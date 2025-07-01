const net = require('net');
const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Datagram, Command, Identifier, SOCStrategy, BatteryStatus } = require('./datagram.js');
const Cache = require('./cache.js');
const { RecoverableError } = require('./recoverable.js');

const DIAL_TIMEOUT = process.env.DIAL_TIMEOUT || 5000;
const MAX_RETRIES = process.env.MAX_RETRIES || 10;
const INITIAL_BACKOFF = process.env.INITIAL_BACKOFF || 100;
const BACKOFF_MULTIPLIER = process.env.BACKOFF_MULTIPLIER || 2;

const _connectionPool = new Map();

class Connection {
    constructor(host, port, cacheDuration, cacheMaxSize = 1000) {
        this.host = host;
        this.port = port;
        this.builder = new DatagramBuilder();
        this.parser = new DatagramParser();
        this.cache = new Cache(cacheDuration, cacheMaxSize);

        this.conn = null;
        this.readBuffer = Buffer.alloc(0);

        this._requestQueue = [];
        this._processing = false;

        this._idleTimeoutHandle = null;
        this._idleTimeoutMs = 90000; // Default idle timeout of 90 seconds
        this._activeRequests = 0;
        this._pendingClose = false;
    }

    setIdleTimeout(ms = this._idleTimeoutMs) {
        if (this._idleTimeoutHandle) {
            clearTimeout(this._idleTimeoutHandle);
        }
        this._idleTimeoutMs = ms;

        if (ms > 0) {
            this._idleTimeoutHandle = setTimeout(() => {
                console.log(`Idle timeout reached, closing connection to ${this.host}:${this.port}`);
                this.close();
            }, ms);
        } else {
            this._idleTimeoutHandle = null;
        }
    }

    async connect() {
        if (this.conn && !this.conn.destroyed) return;
        this.conn = net.createConnection({ host: this.host, port: this.port });

        // Attach a single 'data' listener that handles *all* bytes
        this.conn.on('data', (chunk) => {
            this._onData(chunk);
        });

        return new Promise((resolve, reject) => {
            console.log('Setting up event listeners');
            this.conn.setTimeout(DIAL_TIMEOUT);

            this.conn.once('connect', () => {
                console.log('Connected successfully');
                this.setIdleTimeout(); // Reset idle timeout on successful connection
                resolve();
            });

            this.conn.once('timeout', () => {
                console.error('Connection timed out');
                this.close();
                reject(new Error(`Connection timed out after ${DIAL_TIMEOUT} ms`));
            });

            this.conn.once('error', (err) => {
                console.error('Connection error:', err);
                if (err.code === 'EHOSTUNREACH') {
                    err.message = `The target device ${this.host}:${this.port} is unreachable: ${err.message}`;
                }
                this.close();
                reject(err);
            });
        });
    }

    close() {
        if (this._idleTimeoutHandle) {
            clearTimeout(this._idleTimeoutHandle);
            this._idleTimeoutHandle = null;
        }
        if (this._activeRequests > 0) {
            this._pendingClose = true;
        } else {
            this._doClose();
        }
    }

    _doClose() {
        if (this.conn) {
            this.conn.end();
            this.conn.destroy();
            this.conn = null;
        }
        // Remove from pool if present
        const key = `${this.host}:${this.port}`;
        _connectionPool.delete(key);
        this._pendingClose = false;
    }

    _onData(chunk) {
        this.readBuffer = Buffer.concat([this.readBuffer, chunk]);

        while (this.readBuffer.length > 0) {
            // Set parser's buffer to the current data
            this.parser.buffer = this.readBuffer;
            this.parser.length = this.readBuffer.length;

            let parsed;
            try {
                parsed = this.parser.parse();
            } catch (err) {
                console.error('Parsing error:', err);
                if (this._currentReject) this._currentReject(err);
                this._currentResolve = null;
                this._currentReject = null;
                // Remove first byte to recover from desync (optional, or could clear buffer)
                this.readBuffer = this.readBuffer.slice(1);
                continue;
            }

            if (!parsed || !parsed.datagram) {
                // Wait for more data to arrive
                break;
            }

            // Remove consumed bytes ONLY (not the whole buffer!)
            this.readBuffer = this.readBuffer.slice(parsed.bytesConsumed);

            this._handleDatagram(parsed.datagram);
        }
    }

    _handleDatagram(dg) {
        if (this._currentResolve) {
            this._currentResolve(dg);
            this._currentResolve = null;
            this._currentReject = null;
        } else {
            console.warn('Received unexpected datagram:', dg);
        }
    }

    async send(rdb) {
        if (!this.conn || this.conn.destroyed) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const outBuffer = Buffer.from(rdb.bytes());
            this.conn.write(outBuffer, (err) => {
                if (err) {
                    console.error('Error while sending:', err.message);
                    this.close();
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async _receive(timeoutMs = 4000) {
        if (this._currentResolve) {
            throw new Error('Another request is already waiting for a response');
        }

        return new Promise((resolve, reject) => {
            this._currentResolve = resolve;
            this._currentReject = reject;

            if (timeoutMs > 0) {
                setTimeout(() => {
                    if (this._currentReject) {
                        this._currentReject(new RecoverableError(`Receive timed out after ${timeoutMs} ms`));
                        this._currentResolve = null;
                        this._currentReject = null;
                    }
                }, timeoutMs);
            }
        });
    }

    async retryOperation(operation, retries = MAX_RETRIES, delay = INITIAL_BACKOFF) {
        let attempt = 0;
        let currentDelay = delay;

        while (attempt < retries) {
            try {
                return await operation();
            } catch (error) {
                if (error instanceof RecoverableError) {
                    console.error(`Recoverable error during attempt ${attempt + 1} of ${retries}:`, error.message);
                    attempt++;
                    if (attempt < retries) {
                        console.log(`Waiting ${currentDelay}ms before retrying...`);
                        await new Promise(resolve => setTimeout(resolve, currentDelay));
                        currentDelay *= BACKOFF_MULTIPLIER;
                    }
                } else {
                    throw error;
                }
            }
        }
        throw new Error(`Max retries reached`);
    }

    async write(identifier, value) {
        if (!identifier.writable) {
            throw new Error(`Identifier '${identifier.description}' is not writable.`);
        }

        if (identifier.type === 'uint8' && typeof value === 'boolean') {
            value = value ? 1 : 0;
        }

        if (identifier.validate && !identifier.validate(value)) {
            throw new Error(`Invalid value '${value}' for identifier '${identifier.description}'.`);
        }

        let data;
        switch (identifier.type) {
            case 'float32':
                data = new Uint8Array(4);
                new DataView(data.buffer).setFloat32(0, value, false);
                break;
            case 'uint8':
                data = [value & 0xFF];
                break;
            case 'uint16':
                data = new Uint8Array(2);
                new DataView(data.buffer).setUint16(0, value, false);
                break;
            case 'enum':
                data = [value];
                break;
            default:
                throw new Error(`Unsupported data type '${identifier.type}' for '${identifier.description}'.`);
        }

        const datagram = {
            cmd: Command.WRITE,
            id: identifier.id,
            data: Array.from(data),
        };

        // Pre-check battery status outside of the write queue
        const batteryStatus = await this.query(Identifier.BATTERY_STATUS);
        if (batteryStatus !== 0) {
            const error = new Error(
                `Battery is not in normal operation mode. Current status: ${BatteryStatus.decode(batteryStatus)}`
            );
            error.code = "BATTERY_NOT_NORMAL";
            throw error;
        }

        // Enqueue the write operation steps
        return this._enqueueWriteOperation(identifier, datagram, data);
    }

    async _enqueueWriteOperation(identifier, datagram, data) {
        await this._enqueueRequest(async () => {
            // 1. Write senden
            this.builder.build(datagram);
            await this.send(this.builder);
            console.log(`Write command for '${identifier.description}' sent.`);

            // 2. Wait for response
            await new Promise(resolve => setTimeout(resolve, 800)); // Optional: Wait before Read
            const readDatagram = { cmd: Command.READ, id: identifier.id, data: null };
            this.builder.build(readDatagram);
            await this.send(this.builder);
            console.log(`Read command for '${identifier.description}' sent.`);

            let readDg;
            try {
                readDg = await this._receive(4000);
                if (!readDg || readDg.data.length === 0) {
                    await new Promise(r => setTimeout(r, 200));
                    readDg = await this._receive(4000);
                }
            } catch (err) {
                console.error(`Read after Write for '${identifier.description}' failed.`);
                throw new RecoverableError(`Fallback Read failed for '${identifier.description}'`);
            }

            if (
                readDg &&
                readDg.cmd === Command.RESPONSE &&
                readDg.id === identifier.id &&
                this._compareArrays(readDg.data, data)
            ) {
                console.log(`Read verification for '${identifier.description}' was successful.`);
            } else {
                console.error(
                    `Write & Read verification for '${identifier.description}' failed. ` +
                    `Sent data: ${data}, Got (Read): ${readDg ? readDg.data : "none"}`
                );
                throw new RecoverableError(`Write and Read verification failed for '${identifier.description}'`);
            }
        });
    }


    async query(identifier) {
        return this._enqueueRequest(async () => {
            if (typeof identifier !== 'object' || !('id' in identifier && 'type' in identifier)) {
                throw new Error(`Invalid or unknown identifier: ${JSON.stringify(identifier)}`);
            }

            const { id: numericId, type: dataTypeHandler, enumMapping } = identifier;

            const [cachedDg, found] = this.cache.get(numericId);
            if (found) {
                if (dataTypeHandler) {
                    return this._processDataHandler(cachedDg, dataTypeHandler, enumMapping);
                }
                return cachedDg;
            }

            this.builder.build({ cmd: Command.READ, id: numericId, data: null });

            const operation = async () => {
                await this.send(this.builder);
                const dg = await this._receive();

                if (dg.cmd === Command.RESPONSE && dg.id === numericId) {
                    this.cache.put(dg);
                    this.cache.cleanup();

                    if (dataTypeHandler) {
                        return this._processDataHandler(dg, dataTypeHandler, enumMapping);
                    }
                    return dg;

                } else {
                    throw new RecoverableError(
                        `Mismatch between requested id '${numericId}' and response id '${
                            dg ? JSON.stringify(dg) : 'undefined'
                        }'`
                    );
                }
            };

            return await this.retryOperation(operation);
        });
    }

    _enqueueRequest(fn) {
        this._activeRequests++;
        return new Promise((resolve, reject) => {
            this._requestQueue.push({ fn, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this._processing) return;
        this._processing = true;

        while (this._requestQueue.length > 0) {
            const job = this._requestQueue.shift();
            try {
                const result = await job.fn();
                job.resolve(result);
            } catch (err) {
                job.reject(err);
            }
            this._activeRequests--;
            this.setIdleTimeout(); // Reset idle timeout after processing a request
            if (this._pendingClose && this._activeRequests === 0) {
                this._doClose();
            }
        }

        this._processing = false;
    }

    _processDataHandler(dg, dataTypeHandler, enumMapping = null) {
        if (dataTypeHandler === 'string') {
            const result = dg.data.map(b => String.fromCharCode(b)).join('').trim();
            return result.replace(/[^\x20-\x7E]/g, '');
        }

        if (dataTypeHandler === 'enum') {
            const enumValue = dg.uint8();
            return enumMapping ? enumMapping(enumValue) : enumValue;
        }

        if (typeof dg[dataTypeHandler] !== 'function') {
            throw new Error(`Handler '${dataTypeHandler}' is not supported by the response.`);
        }

        return dg[dataTypeHandler]();
    }

    async queryString(identifier) { return await this.query(identifier, 'string'); }
    async queryFloat32(identifier) { return await this.query(identifier, 'float32'); }
    async queryUint16(identifier) { return await this.query(identifier, 'uint16'); }
    async queryUint8(identifier)  { return await this.query(identifier, 'uint8'); }

    _compareArrays(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }
}

Connection.getPooledConnection = function(host, port, cacheDuration, cacheMaxSize = 1000) {
    const key = `${host}:${port}`;
    let conn = _connectionPool.get(key);

    if (conn && conn.conn && conn.conn.destroyed) {
        _connectionPool.delete(key);
        conn = null;
    }
    if (conn) {
        return conn;
    }

    conn = new Connection(host, port, cacheDuration, cacheMaxSize);
    _connectionPool.set(key, conn);
    return conn;
};


module.exports = Connection;


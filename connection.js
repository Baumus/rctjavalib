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

class Connection {
    constructor(host, port, cacheDuration, cacheMaxSize = 1000) {
        this.host = host;
        this.port = port;
        this.builder = new DatagramBuilder();
        this.parser = new DatagramParser();
        this.cache = new Cache(cacheDuration, cacheMaxSize);

        this.conn = null;

        // We keep one buffer for all incoming data.
        this.readBuffer = Buffer.alloc(0);

        // For single outstanding request: one promise at a time.
        this._pendingResolve = null;
        this._pendingReject = null;

        // Reuse from the original code: connection caching logic
        if (Connection.connectionCache.has(host)) {
            const cachedConn = Connection.connectionCache.get(host);
            if (cachedConn.conn && !cachedConn.conn.destroyed) {
                return cachedConn;
            }
        }
        Connection.connectionCache.set(host, this);
    }

    async connect() {
        if (this.conn && !this.conn.destroyed) {
            // Already connected
            return;
        }

        // Create the TCP connection
        this.conn = net.createConnection({ host: this.host, port: this.port });

        // IMPORTANT: Attach a single 'data' listener that handles *all* bytes
        this.conn.on('data', (chunk) => {
            this._onData(chunk);
        });

        return new Promise((resolve, reject) => {
            console.log('Setting up event listeners');
            this.conn.setTimeout(DIAL_TIMEOUT);

            this.conn.once('connect', () => {
                console.log('Connected successfully');
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
        if (this.conn) {
            this.conn.end();
            this.conn.destroy();
            this.conn = null;
        }
        Connection.connectionCache.delete(this.host);
    }

    /**
     * The new, robust way of reading data: 
     * accumulate in this.readBuffer, then parse in a loop.
     */
    _onData(chunk) {
        // 1) Append new bytes to the buffer
        this.readBuffer = Buffer.concat([this.readBuffer, chunk]);

        // 2) Attempt to parse as many complete datagrams as possible
        while (true) {
            let dg;
            try {
                // Reset/prepare parser for this pass
                this.parser.reset();
                this.parser.buffer = this.readBuffer;
                this.parser.length = this.readBuffer.length;

                // The parser might return null/undefined if not enough bytes exist
                dg = this.parser.parse();  
            } catch (err) {
                // If the parser throws (CRC error, etc.), reject pending request
                console.error('Parsing error:', err);
                if (this._pendingReject) {
                    this._pendingReject(err);
                }
                // Clear out pending
                this._pendingResolve = null;
                this._pendingReject = null;
                // Optionally clear the buffer or attempt re-sync
                this.readBuffer = Buffer.alloc(0);
                return;
            }

            // If parse() returns nothing, we don't have a full datagram yet
            if (!dg) {
                break;
            }

            // If parse() *did* return a complete datagram, 
            // by definition in your parser, it consumed the entire buffer. 
            // (Because your current parser doesn't track partial frames or leftover bytes.)
            // If your parser can parse partial frames, you'd remove the consumed bytes only.
            this.readBuffer = Buffer.alloc(0);

            // We have our parsed datagram, handle it
            this._handleDatagram(dg);
            // If there's no leftover data, just break out
            // If your parser could parse multiple frames, you'd keep looping
        }
    }

    /**
     * Called when we have a fully parsed datagram.
     * In single-request mode, we resolve the pending promise.
     */
    _handleDatagram(dg) {
        if (this._pendingResolve) {
            this._pendingResolve(dg);
            // Clear pending request
            this._pendingResolve = null;
            this._pendingReject = null;
        } else {
            // If there's no pending request, it's an unsolicited datagram
            console.warn('Received unexpected datagram:', dg);
        }
    }

    /**
     * Send data on the socket (unchanged, except we never do once('data') here).
     */
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

    /**
     * The new way to wait for exactly one datagram.
     */
    async _receive(timeoutMs = 2000) {
        // If there's already a pending request, that's an error in single-request mode
        if (this._pendingResolve) {
            throw new Error('Another request is already waiting for a response');
        }

        return new Promise((resolve, reject) => {
            this._pendingResolve = resolve;
            this._pendingReject = reject;

            if (timeoutMs > 0) {
                setTimeout(() => {
                    if (this._pendingReject) {
                        this._pendingReject(
                            new RecoverableError(`Receive timed out after ${timeoutMs} ms`)
                        );
                        this._pendingResolve = null;
                        this._pendingReject = null;
                    }
                }, timeoutMs);
            }
        });
    }

    /**
     * Your existing retry logic is fine. No changes needed.
     */
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

    /**
     * Example write method, using _receive instead of the old receive()
     */
    async write(identifier, value) {
        if (!identifier.writable) {
            throw new Error(`Identifier '${identifier.description}' is not writable.`);
        }

        // Convert boolean to uint8 (0 or 1) if the type is 'uint8'
        if (identifier.type === 'uint8' && typeof value === 'boolean') {
            value = value ? 1 : 0;
        }

        if (identifier.validate && !identifier.validate(value)) {
            throw new Error(`Invalid value '${value}' for identifier '${identifier.description}'.`);
        }

        // Transform value to binary data
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

        // Check if battery is in normal operation mode using query()
        const batteryStatus = await this.query(Identifier.BATTERY_STATUS);
        if (batteryStatus !== 0) {
            const error = new Error(
                `Battery is not in normal operation mode. Current status: ${BatteryStatus.decode(batteryStatus)}`
            );
            error.code = "BATTERY_NOT_NORMAL";
            throw error;
        }

        console.log(`Executing write command for id '${identifier.description}' with data: ${data}`);

        // Define the operation to retry
        const operation = async () => {
            // 1) Build + send the WRITE
            this.builder.build(datagram);
            await this.send(this.builder);

            // 2) Build + send a READ for verification
            this.builder.build({ cmd: Command.READ, id: identifier.id, data: null });
            await this.send(this.builder);

            // 3) Wait for the single response
            const dg = await this._receive();

            // 4) Validate
            if (dg.cmd === Command.RESPONSE && dg.id === identifier.id && this._compareArrays(dg.data, data)) {
                console.log(`Write command for id '${identifier.description}' was successful.`);
            } else {
                console.error(
                    `Write command for id '${identifier.description}' failed. Sent data: ${data}, Received data: ${dg.data}`
                );
                throw new RecoverableError(`Write verification failed for id '${identifier.description}'`);
            }
        };

        // Retry the operation on recoverable errors
        try {
            await this.retryOperation(operation);
        } catch (err) {
            throw new Error(`Error while executing write command for id '${identifier.description}': ${err.message}`);
        }
    }

    // Helper to compare arrays
    _compareArrays(array1, array2) {
        if (!Array.isArray(array1)) array1 = Array.from(array1);
        if (!Array.isArray(array2)) array2 = Array.from(array2);

        if (array1.length !== array2.length) return false;
        for (let i = 0; i < array1.length; i++) {
            if (array1[i] !== array2[i]) return false;
        }
        return true;
    }

    /**
     * Example query method, again using _receive().
     */
    async query(identifier) {
        // Ensure the id is a valid Identifier object
        if (typeof identifier !== 'object' || !('id' in identifier && 'type' in identifier)) {
            throw new Error(`Invalid or unknown identifier: ${JSON.stringify(identifier)}`);
        }

        const { id: numericId, type: dataTypeHandler, enumMapping } = identifier;

        // Check the cache first
        const [cachedDg, found] = this.cache.get(numericId);
        if (found) {
            if (dataTypeHandler) {
                return this._processDataHandler(cachedDg, dataTypeHandler, enumMapping);
            }
            return cachedDg;
        }

        // Build the request datagram
        this.builder.build({ cmd: Command.READ, id: numericId, data: null });

        const operation = async () => {
            // 1) Send the read
            await this.send(this.builder);

            // 2) Wait for the response
            const dg = await this._receive();

            // 3) Validate
            if (dg.cmd === Command.RESPONSE && dg.id === numericId) {
                // Cache the response
                this.cache.put(dg);
                this.cache.cleanup();

                // Convert if needed
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
    }

    _processDataHandler(dg, dataTypeHandler, enumMapping = null) {
        // Same logic as before
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

    // Convenience query methods
    async queryString(identifier) { return await this.query(identifier, 'string'); }
    async queryFloat32(identifier) { return await this.query(identifier, 'float32'); }
    async queryUint16(identifier) { return await this.query(identifier, 'uint16'); }
    async queryUint8(identifier)  { return await this.query(identifier, 'uint8'); }

}

Connection.connectionCache = new Map();
module.exports = Connection;

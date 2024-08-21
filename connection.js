const net = require('net');
const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Datagram, Command, Identifier } = require('./datagram.js');
const Cache = require('./cache.js'); // Verwenden des aktualisierten Cache-Codes
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
        this.cache = new Cache(cacheDuration, cacheMaxSize); // Verwenden der neuen Parameter
        this.conn = null;

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
            return;
        }

        this.conn = net.createConnection({ host: this.host, port: this.port });

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

    async send(rdb) {
        if (!this.conn || this.conn.destroyed) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.conn.write(Buffer.from(rdb.bytes()), (err) => {
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

    async receive() {
        if (!this.conn || this.conn.destroyed) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const onData = (data) => {
                try {
                    this.parser.reset();
                    this.parser.buffer = data;
                    this.parser.length = data.length;
                    const dg = this.parser.parse();
                    if (dg) {
                        resolve(dg);
                    } else {
                        reject(new RecoverableError('Parsing failed'));
                    }
                } catch (error) {
                    reject(error);
                }
            };

            this.conn.once('data', onData);
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

    async query(id) {
        const [cachedDg, found] = this.cache.get(id);
        if (found) {
            return cachedDg;
        }

        this.builder.build({ cmd: Command.READ, id, data: null });

        const operation = async () => {
            await this.send(this.builder);
            const dg = await this.receive();

            if (dg.cmd === Command.RESPONSE && dg.id === id) {
                this.cache.put(dg);
                this.cache.cleanup(); // Bereinige den Cache nach jeder `put`-Operation
                return dg;
            } else {
                throw new RecoverableError(`Mismatch of requested read of id: ${id} and response from source: ${JSON.stringify(dg)}`);
            }
        };

        return await this.retryOperation(operation);
    }

    async queryString(id) {
        const dg = await this.query(id);
        const result = dg.data.map(b => String.fromCharCode(b)).join('').trim();
        return result.replace(/[^\x20-\x7E]/g, ''); // Nicht druckbare Zeichen entfernen
    }

    async queryFloat32(id) {
        const dg = await this.query(id);
        if (!dg || typeof dg.float32 !== 'function') {
            throw new Error(`Invalid answer from device for identifier ${id}: response is ${dg ? `not a function, got ${typeof dg.float32}` : 'null or undefined'}`);
        }
        return dg.float32();
    }

    async queryUint16(id) {
        const dg = await this.query(id);
        if (!dg || typeof dg.uint16 !== 'function') {
            throw new Error(`Invalid answer from device for identifier ${id}: response is ${dg ? `not a function, got ${typeof dg.uint16}` : 'null or undefined'}`);
        }
        return dg.uint16();
    }

    async queryUint8(id) {
        const dg = await this.query(id);
        if (!dg || typeof dg.uint8 !== 'function') {
            throw new Error(`Invalid answer from device for identifier ${id}: response is ${dg ? `not a function, got ${typeof dg.uint8}` : 'null or undefined'}`);
        }
        return dg.uint8();
    }
}

Connection.connectionCache = new Map();

module.exports = Connection;

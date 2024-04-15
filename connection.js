const net = require('net');
const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Datagram, Command, Identifier } = require('./datagram.js');
const Cache = require('./cache.js');
const { RecoverableError } = require('./recoverable.js');

const DIAL_TIMEOUT = 5000; // 5 seconds in milliseconds

class Connection {
    constructor(host, port, cacheDuration) {
        this.host = host;
        this.port = port;
        this.builder = new DatagramBuilder();
        this.parser = new DatagramParser();
        this.cache = new Cache(cacheDuration);
        this.conn = null;

        // If a connection for this host already exists, check if it's alive
        if (Connection.connectionCache.has(host)) {
            const cachedConn = Connection.connectionCache.get(host);
            if (cachedConn.conn) {
                // The cached connection is alive, use it
                return cachedConn;
            }
            // If we reach here, the cached connection is dead and we'll continue to create a new one
        }

        Connection.connectionCache.set(host, this);
    }

    async connect() {
        this.conn = net.createConnection({ host: this.host, port: this.port });
    
        return new Promise((resolve, reject) => {
            this.conn.on('connect', resolve);
            this.conn.on('error', (err) => {
                console.error('Connection error:', err); // Log the original error
                if (err.code === 'EHOSTUNREACH') {
                    // Create a new error message, but keep the original error object
                    err.message = `The target device ${this.host}:${this.port} is unreachable: ${err.message}`;
                    reject(err); // Reject the original error object with the modified message
                } else {
                    reject(err); // Reject the original error object
                }
            });
        });
    }
    
    close() {
        if (this.conn) {
            this.conn.end();
            this.conn = null;
        }
        Connection.connectionCache.delete(this.host); // Connection is dead, no need to cache anymore
    }

    async send(rdb) {
        if (!this.conn) {
            try {
                await this.connect();
            } catch (error) {
                console.error('Error establishing the connection:', error.message);
                throw error;
            }
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
        if (!this.conn) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.conn.on('data', (data) => {
                try {
                    this.parser.reset();
                    this.parser.buffer = data;
                    this.parser.length = data.length;
                    const dg = this.parser.parse();
                    if (dg) resolve(dg);
                    else reject(new RecoverableError('Parsing failed'));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async query(id) {
        const cachedDg = this.cache.get(id);
        if (cachedDg[1]) {
            return cachedDg[0];
        }

        let dg;
        this.builder.build({ cmd: Command.READ, id, data: null });

        const maxRetries = 10; // Number of maximum retries
        let attempt = 0; // Current attempt
        let delay = 100; // Start delay
        const backoffMultiplier = 2; // Backoff multiplier

        while (attempt < maxRetries) {
            try {
                await this.send(this.builder);
                dg = await this.receive();

                if (dg.cmd === Command.RESPONSE && dg.id === id) {
                    this.cache.put(dg);
                    return dg;
                } else {
                    throw new RecoverableError(`Mismatch of requested read of id: ${id} and response from source: ${JSON.stringify(dg)}`);
                }
            } catch (error) {
                if (error instanceof RecoverableError) {
                    console.error(`Recoverable error during parsing, attempt ${attempt + 1} of ${maxRetries}:`, error.message);
                    attempt++;
                    if (attempt < maxRetries) {
                        console.log(`Waiting ${delay}ms before retrying...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= backoffMultiplier; // Increase the delay for the next attempt
                    }
                } else {
                    throw error;
                }
            }
        }

        throw new Error(`Max retries reached for id: ${id}`);
    }
    
    
    async queryString(id) {
        const dg = await this.query(id);
        return dg.data.map(b => String.fromCharCode(b)).join('').trim();
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

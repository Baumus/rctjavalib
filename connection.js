
const net = require('net');
const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Datagram, Command, Identifier } = require('./datagram.js');
const Cache = require('./cache.js');
const { RecoverableError } = require('./recoverable.js');

const DIAL_TIMEOUT = 5000; // 5 seconds in milliseconds

class Connection {
    constructor(host, cacheDuration) {
        this.host = host;
        this.builder = new DatagramBuilder();
        this.parser = new DatagramParser();
        this.cache = new Cache(cacheDuration);
        this.conn = null;

        // If a connection for this host already exists, use it
        if (Connection.connectionCache.has(host)) {
            return Connection.connectionCache.get(host);
        }

        Connection.connectionCache.set(host, this);
    }

    async connect() {
        this.conn = net.createConnection({ host: this.host, port: 8899 });
        this.conn.on('error', (err) => {
            console.error('Connection error:', err);
        });        
        this.conn.setTimeout(DIAL_TIMEOUT);
        return new Promise((resolve, reject) => {
            this.conn.on('connect', resolve);
            this.conn.on('error', reject);
        });
    }

    close() {
        if (this.conn) {
            this.conn.end();
            this.conn = null;
        }
    }

    async send(rdb) {
        if (!this.conn) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.conn.write(Buffer.from(rdb.bytes()), (err) => {
                if (err) {
                    this.close();
                    this.connect().then(() => {
                        this.conn.write(rdb.bytes(), (err2) => {
                            if (err2) reject(err2);
                            else resolve();
                        });
                    }).catch(reject);
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
                this.parser.reset();
                this.parser.buffer = data;
                this.parser.length = data.length;
                const dg = this.parser.parse();
                if (dg) resolve(dg);
                else reject(new RecoverableError('Parsing failed'));
            });
        });
    }

    async query(id) {
        const cachedDg = this.cache.get(id);
        if (cachedDg[1]) {
            return cachedDg[0];
        }
    
        let attempts = 5;
        let dg;
    
        while (attempts > 0) {
            this.builder.build({ cmd: Command.READ, id, data: null });
            await this.send(this.builder);
            dg = await this.receive();
    
            if (dg.cmd === Command.RESPONSE && dg.id === id) {
                this.cache.put(dg);
                return dg;
            }
    
            attempts--;
        }
    
        throw new RecoverableError(`Mismatch of requested read of id: ${id} and response from source: ${JSON.stringify(dg)}`);
    }
    
    async queryString(id) {
        const dg = await this.query(id);
        return dg.data.map(b => String.fromCharCode(b)).join('').trim();
    }
    
    async queryFloat32(id) {
        const dg = await this.query(id);
        return dg.float32();
    }

    async queryUint16(id) {
        const dg = await this.query(id);
        return dg.uint16();
    }

    async queryUint8(id) {
        const dg = await this.query(id);
        return dg.uint8();
    }
}

Connection.connectionCache = new Map();

module.exports = Connection; 
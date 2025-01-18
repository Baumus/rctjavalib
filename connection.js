const net = require('net');
const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Datagram, Command, Identifier, SOCStrategy, BatteryStatus} = require('./datagram.js');
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
            this.conn.once('data', (data) => {
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
            });
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
                new DataView(data.buffer).setFloat32(0, value, false); // BigEndian
                break;
            case 'uint8':
                data = [value & 0xFF];
                break;
            case 'uint16':
                data = new Uint8Array(2);
                new DataView(data.buffer).setUint16(0, value, false); // BigEndian
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
            const error = new Error(`Battery is not in normal operation mode. Current status: ${BatteryStatus.decode(batteryStatus)}`);
            error.code = "BATTERY_NOT_NORMAL";
            throw error;
        }
        
        console.log(`Executing write command for id '${identifier.description}' with data: ${data}`);
        
        // Define the operation to retry
        const operation = async () => {
            // Build the datagram using the builder
            this.builder.build(datagram);
            // Send the datagram using the connection
            await this.send(this.builder);

            // Read-After-Write Verification
            this.builder.build({ cmd: Command.READ, id: identifier.id, data: null });
            await this.send(this.builder);
            const dg = await this.receive();

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

    // Helper method to compare arrays
    _compareArrays(array1, array2) {
        // Convert non-array types (like Uint8Array) to plain arrays
        if (!Array.isArray(array1)) array1 = Array.from(array1);
        if (!Array.isArray(array2)) array2 = Array.from(array2);
    
        // Check if lengths match
        if (array1.length !== array2.length) {
            return false;
        }
    
        // Compare each element with type coercion, log mismatches
        for (let i = 0; i < array1.length; i++) {
            if (array1[i] !== array2[i]) {
                return false;
            }
        }
    
        // Arrays match
        return true;
    }

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
            await this.send(this.builder);
            const dg = await this.receive();

            if (dg.cmd === Command.RESPONSE && dg.id === numericId) {
                // Cache the response
                this.cache.put(dg);
                this.cache.cleanup(); // Clean up cache after putting a new entry
                
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

    // Helper function for data processing
    _processDataHandler(dg, dataTypeHandler, enumMapping = null) {
        if (dataTypeHandler === 'string') {
            const result = dg.data.map(b => String.fromCharCode(b)).join('').trim();
            return result.replace(/[^\x20-\x7E]/g, ''); // Remove non-printable characters
        }

        if (dataTypeHandler === 'enum') {
            const enumValue = dg.uint8();
            return enumMapping ? enumMapping(enumValue) : enumValue; // Map or return raw value
        }

        if (typeof dg[dataTypeHandler] !== 'function') {
            throw new Error(`Handler '${dataTypeHandler}' is not supported by the response.`);
        }

        return dg[dataTypeHandler]();
    }

    async queryString(identifier) {
        return await this.query(identifier, 'string');
    }

    async queryFloat32(identifier) {
        return await this.query(identifier, 'float32');
    }

    async queryUint16(identifier) {
        return await this.query(identifier, 'uint16');
    }

    async queryUint8(identifier) {
        return await this.query(identifier, 'uint8');
    }

    async querySOCStrategy() {
        const strategyValue = await this.query(Identifier.POWER_MNG_SOC_STRATEGY);

        //Check if the value is valid
        if (!Object.values(SOCStrategy).includes(strategyValue)) {
            throw new Error(`Invalid SOC strategy value received: ${strategyValue}`);
        }

        return {
            value: strategyValue,
            description: SOCStrategy.toString(strategyValue),
        };
    }
}

Connection.connectionCache = new Map();

module.exports = Connection;

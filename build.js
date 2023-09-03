const CRC = require('./crc.js');

class DatagramBuilder {
    constructor() {
        this.buffer = [];
        this.crc = new CRC();
    }

    reset() {
        this.buffer = [];
        this.crc.reset();
    }

    writeByte(b) {
        if (b === 0x2b || b === 0x2d) {
            this.buffer.push(0x2d); // escape in byte stream (not in CRC stream)
        }
        this.buffer.push(b);
        this.crc.update(b);
    }

    writeByteUnescapedNoCRC(b) {
        this.buffer.push(b);
    }

    writeCRC() {
        const crc = this.crc.get();
        this.buffer.push(crc >> 8);
        this.buffer.push(crc & 0xff);
    }

    build(dg) {
        //debug
        if (typeof dg.id !== 'number' || dg.id < 0 || dg.id > 0xFFFFFFFF) {
            throw new Error('Invalid id value');
        }
        if (dg.data && !Array.isArray(dg.data)) {
            throw new Error('Data should be an array of bytes');
        }

        this.reset();
        this.writeByteUnescapedNoCRC(0x2b); // Start byte
        if (typeof dg.cmd !== 'number' || dg.cmd < 0 || dg.cmd > 255) {
            throw new Error('Invalid command value');
        }
        this.writeByte(dg.cmd);
        
        let dataLength = (dg.data !== null && dg.data !== undefined) ? dg.data.length : 0;
        this.writeByte(dataLength + 4);
        
        this.writeByte(dg.id >>> 24);
        this.writeByte((dg.id >>> 16) & 0xff);
        this.writeByte((dg.id >>> 8) & 0xff);
        this.writeByte(dg.id & 0xff);

        if (dg.data !== null && dg.data !== undefined) {
            for (const d of dg.data) {
                if (d < 0 || d > 255) {
                    throw new Error('Invalid byte value in data');
                } 
                this.writeByte(d);
            }
        }

        this.writeCRC();
    }

    bytes() {
        return this.buffer;
    }

    toString() {
        return '[' + this.buffer.map(b => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ') + ']';
    }
    
}

module.exports = DatagramBuilder;

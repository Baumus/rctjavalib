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
        this.reset();
        this.writeByteUnescapedNoCRC(0x2b); // Start byte
        this.writeByte(dg.cmd);
        
        let dataLength = (dg.data !== null && dg.data !== undefined) ? dg.data.length : 0;
        this.writeByte(dataLength + 4);
        
        this.writeByte(dg.id >> 24);
        this.writeByte((dg.id >> 16) & 0xff);
        this.writeByte((dg.id >> 8) & 0xff);
        this.writeByte(dg.id & 0xff);

        if (dg.data !== null && dg.data !== undefined) {
            for (const d of dg.data) {
                this.writeByte(d);
            }
        }

        this.writeCRC();
    }

    bytes() {
        return this.buffer;
    }

    toString() {
        return '[' + this.buffer.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') + ']';
    }
}

module.exports = DatagramBuilder;

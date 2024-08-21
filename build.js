const CRC = require('./crc.js');

class DatagramBuilder {
    constructor(initialSize = 8) {
        this.buffer = new Uint8Array(initialSize);
        this.crc = new CRC();
        this.pos = 0;
    }

    reset() {
        this.buffer.fill(0);
        this.crc.reset();
        this.pos = 0;
    }

    ensureCapacity(additionalBytes) {
        const requiredCapacity = this.pos + additionalBytes;
        if (requiredCapacity > this.buffer.length) {
            const newSize = Math.max(this.buffer.length * 2, requiredCapacity);
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
        }
    }

    writeByte(b) {
        this.ensureCapacity(1);
        if (b === 0x2b || b === 0x2d) {
            this.buffer[this.pos++] = 0x2d; // Escape in byte stream (not in CRC stream)
        }
        this.buffer[this.pos++] = b;
        this.crc.update(b);
    }

    bufferPush(b) {
        this.ensureCapacity(1);
        this.buffer[this.pos++] = b;
    }

    writeByteUnescapedNoCRC(b) {
        this.bufferPush(b);
    }

    writeCRC() {
        const crc = this.crc.get();
        this.bufferPush(crc >> 8);
        this.bufferPush(crc & 0xff);
    }

    build(dg) {
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

        let dataLength = dg.data ? dg.data.length : 0;
        this.writeByte(dataLength + 4);

        this.writeByte(dg.id >>> 24);
        this.writeByte((dg.id >>> 16) & 0xff);
        this.writeByte((dg.id >>> 8) & 0xff);
        this.writeByte(dg.id & 0xff);

        if (dg.data) {
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
        return this.buffer.subarray(0, this.pos);
    }

    toString() {
        return '[' + Array.from(this.bytes()).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') + ']';
    }
}

module.exports = DatagramBuilder;

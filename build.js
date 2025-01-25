// builder.js
const CRC = require('./crc.js');

// We define some command codes for reference (if you have them):
const Command = {
    READ: 0x01,
    WRITE: 0x02,
    RESPONSE: 0x05,
    // etc...
};

class DatagramBuilder {
    constructor(initialSize = 16) {
        this.buffer = new Uint8Array(initialSize);
        this.pos = 0;

        // We'll keep track of how many bytes we've fed into the CRC so we can do "even-length padding."
        this.crc = new CRC();
        this.crcBytesCount = 0; 
    }

    reset() {
        this.buffer.fill(0);
        this.pos = 0;
        this.crc.reset();
        this.crcBytesCount = 0;
    }

    ensureCapacity(additionalBytes) {
        const needed = this.pos + additionalBytes;
        if (needed > this.buffer.length) {
            const newSize = Math.max(this.buffer.length * 2, needed);
            const newBuffer = new Uint8Array(newSize);
            newBuffer.set(this.buffer);
            this.buffer = newBuffer;
        }
    }

    /**
     * Called when we want to add 1 byte to the actual frame
     * *without* contributing to the CRC. (e.g. the start token 0x2B)
     */
    writeByteNoCRC(b) {
        this.ensureCapacity(1);
        this.buffer[this.pos++] = b;
        // No crc update
    }

    /**
     * Called when we want to add *one* data byte that *should*
     * be escaped if it's 0x2B or 0x2D, and also *should* feed
     * into the CRC calculation.
     */
    writeByteWithEscape(b) {
     // If it's a plus (0x2B) or minus (0x2D), we write the escape token WITHOUT updating CRC
     if (b === 0x2B || b === 0x2D) {
        this._rawWriteByteNoCRC(0x2D);
    }
    // Then write the actual byte WITH CRC
    this._rawWriteByteCrc(b);
    }

    _rawWriteByteNoCRC(b) {
        this.ensureCapacity(1);
        this.buffer[this.pos++] = b;
        // No crc.update(...) here
    }
    
    _rawWriteByteCrc(b) {
        this.ensureCapacity(1);
        this.buffer[this.pos++] = b;
        this.crc.update(b);
        this.crcBytesCount++;
    }

    /**
     * Once we've finished writing cmd, length, ID, data, we do
     * the "even-length CRC padding" if needed, then append 2 CRC bytes.
     */
    writeCRC() {
        // If we've fed an odd number of bytes into the CRC, add a 0x00
        if ((this.crcBytesCount % 2) === 1) {
            // feed an extra zero
            this.crc.update(0);
        }
            

        const crcVal = this.crc.get();
        const hi = (crcVal >> 8) & 0xFF;
        const lo = crcVal & 0xFF;

        this.ensureCapacity(2);
        // These 2 bytes are physically added to the frame, but do *not* feed back into the CRC
        this.buffer[this.pos++] = hi;
        this.buffer[this.pos++] = lo;
    }

    /**
     * Build a normal (1-byte length) frame with:
     * 1) start(0x2B) no CRC
     * 2) cmd => CRC
     * 3) length => CRC
     * 4) ID => CRC (4 bytes, each possibly escaped)
     * 5) data => CRC (each possibly escaped)
     * 6) pad if odd length
     * 7) 2 CRC bytes
     */
    build(dg) {
        this.reset();

        // Basic validations
        if (typeof dg.id !== 'number' || dg.id < 0 || dg.id > 0xFFFFFFFF) {
            throw new Error(`Invalid ID: ${dg.id}`);
        }
        if (typeof dg.cmd !== 'number' || dg.cmd < 0 || dg.cmd > 255) {
            throw new Error(`Invalid command: ${dg.cmd}`);
        }
        const dataArray = dg.data || [];
        for (const b of dataArray) {
            if (b < 0 || b > 255) throw new Error(`Invalid data byte ${b}`);
        }

        // 1) Start byte (NOT included in CRC)
        this.writeByteNoCRC(0x2B);

        // 2) Command (with escaping + CRC)
        this.writeByteWithEscape(dg.cmd);

        // 3) length = 4 (for ID) + data.length
        // (We're ignoring escaping from the length count.)
        const length = 4 + dataArray.length;
        this.writeByteWithEscape(length);

        // 4) ID (4 bytes, each possibly escaped)
        const b3 = (dg.id >>> 24) & 0xFF;
        const b2 = (dg.id >>> 16) & 0xFF;
        const b1 = (dg.id >>> 8) & 0xFF;
        const b0 = dg.id & 0xFF;
        this.writeByteWithEscape(b3);
        this.writeByteWithEscape(b2);
        this.writeByteWithEscape(b1);
        this.writeByteWithEscape(b0);

        // 5) Data
        for (const b of dataArray) {
            this.writeByteWithEscape(b);
        }

        // 6) Then do the even-length pad in the CRC
        // 7) Write the 2 CRC bytes
        this.writeCRC();
    }

    bytes() {
        return this.buffer.subarray(0, this.pos);
    }

    toString() {
        return '[' + Array.from(this.bytes())
            .map(x => x.toString(16).toUpperCase().padStart(2, '0'))
            .join(' ') + ']';
    }
}

module.exports = DatagramBuilder;

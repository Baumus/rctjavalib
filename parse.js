// parse.js
const { RecoverableError } = require('./recoverable.js');
const CRC = require('./crc.js');
const { Datagram } = require('./datagram.js');

// For reference:
const START_BYTE = 0x2B;

class DatagramParser {
    constructor() {
        this.buffer = new Uint8Array(0);
        this.length = 0;
    }

    reset() {
        // If you have parser state, reset it here
    }

    parse() {
        // 1) Find first 0x2B that is NOT preceded by 0x2D (escape)
        const startIndex = this._findStartIndex();
        if (startIndex < 0) return null; // no start token yet

        // 2) Unescape everything from startIndex forward
        //    until we can parse a complete frame
        const unescaped = this._unescapeFrame(startIndex);
        if (!unescaped) return null; // not enough data to unescape or incomplete?

        // unescaped is an array of bytes: [cmd, length, ID..., data..., CRC(2 bytes)]
        // 3) Check we have at least cmd(1) + length(1) + ID(4) + CRC(2) => 8 bytes
        if (unescaped.length < 8) {
            // we have cmd(1), length(1), ID(4) => 6 so far, plus 2 CRC => 8
            return null;
        }

        // 4) Extract cmd, length
        const cmd = unescaped[0];
        const length = unescaped[1];
        if (length < 4) {
            // short frame => possibly a heartbeat or ack; skip
            throw new RecoverableError(`Short frame with length=${length}, ignoring...`);
        }

        // Check if unescaped buffer is big enough for ID(4) + data(length-4) + CRC(2)
        const totalNeeded = 2 /*cmd+length*/ + length + 2 /*crc*/;
        if (unescaped.length < totalNeeded) {
            return null; // incomplete
        }

        // 5) ID
        let offset = 2;
        let id = 0;
        for (let i = 0; i < 4; i++) {
            id = (id << 8) | unescaped[offset + i];
        }
        id >>>= 0;
        offset += 4;

        // 6) data
        const dataLength = length - 4;
        const dataBytes = unescaped.slice(offset, offset + dataLength);
        offset += dataLength;

        // Next 2 are CRC
        const crcHigh = unescaped[offset];
        const crcLow  = unescaped[offset + 1];
        const crcReceived = ((crcHigh << 8) | crcLow) >>> 0;

        // 7) Now compute the CRC. We do NOT include the 2 CRC bytes.
        // We do it over [cmd, length, ID..., data...].
        // Also apply the "if odd length of input => add 0x00" rule.
        let crcCalc = this._computeCrcPad(
            unescaped.slice(0, 2 + length)
        );

        if (crcCalc !== crcReceived) {
            throw new RecoverableError(
                `CRC mismatch. Calculated: ${crcCalc}, Received: ${crcReceived}`
            );
        }

        // If we got here, we have a valid frame
        const dg = new Datagram(cmd, id, Array.from(dataBytes));

        // Optionally remove the consumed bytes from this.buffer.
        // But we only unescaped "some portion" of the buffer. 
        // The easiest approach is to do that in `_onData()` in your connection:
        //   this.readBuffer = this.readBuffer.slice(startIndex + ???);

        return dg;
    }

    /**
     * Finds the first 0x2B that is NOT escaped by 0x2D.
     */
    _findStartIndex() {
        // naive approach: find indexOf(0x2B), check if it's escaped
        // if it's preceded by 0x2D, skip it. For repeated escapes, do more logic.
        // For now, we do a simple loop:
        for (let i = 0; i < this.buffer.length; i++) {
            if (this.buffer[i] === START_BYTE) {
                // check if this is the first byte or if the previous byte is not 0x2D
                if (i === 0) return 0;
                if (this.buffer[i - 1] !== 0x2D) {
                    return i;
                }
            }
        }
        return -1;
    }

    /**
     * Builds an unescaped array from the raw buffer,
     * starting at `startIndex`. We stop once we have enough to parse,
     * or if the data ends.
     */
    _unescapeFrame(startIndex) {
        // we skip leading bytes (0..startIndex-1)
        // Then from startIndex forward, we interpret escapes.
        const out = [];
        // skip the start token 0x2B itself
        // => we do not store it in out, because we only store [cmd, length, ...]
        // But if the device wants the start in the CRC? The doc says NO, the start byte is excluded.

        let i = startIndex + 1;
        while (i < this.buffer.length) {
            const b = this.buffer[i];
            // if b == 0x2D, then the next byte is data => skip b, read next
            if (b === 0x2D) {
                // ensure there's a next byte
                if (i + 1 >= this.buffer.length) {
                    return null; // incomplete
                }
                out.push(this.buffer[i + 1]);
                i += 2;
            } else if (b === START_BYTE) {
                // That might be a new frame => we can stop here. 
                // Because we only parse ONE frame at a time.
                // or we interpret it as an error if we haven't found a CRC yet.
                // For now, let's just break, we'll parse only up to here.
                break;
            } else {
                out.push(b);
                i++;
            }
        }

        return out;
    }

    /**
     * Compute CRC with "pad to even length" rule if out.length is odd.
     */
    _computeCrcPad(bytes) {
        const crc = new CRC();
        // feed each byte
        for (let b of bytes) {
            crc.update(b);
        }
        if ((bytes.length % 2) === 1) {
            crc.update(0);
        } 
        return crc.get();
    }
}

module.exports = DatagramParser;

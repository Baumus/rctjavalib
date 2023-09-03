class CRC {
    constructor() {
        this.crc = 0xffff;
        this.isOdd = false;
    }

    reset() {
        this.crc = 0xffff;
        this.isOdd = false;
    }

    update(b) {
        let crc = this.crc;
        for (let i = 0; i < 8; i++) {
            const bit = (b >> (7 - i) & 1) === 1;
            const c15 = ((crc >> 15) & 1) === 1;
            crc <<= 1;
            if (c15 !== bit) {
                crc ^= 0x1021;
            }
        }
        this.crc = crc;
        this.isOdd = !this.isOdd;
    }

    get() {
        if (this.isOdd) {
            this.update(0); // pad CRC stream (not byte stream) to even length
        }
        return this.crc;
    }
}

module.exports = CRC;
class CRC {
    constructor() {
        this.reset();  // Initialisierung durch Aufruf von reset
    }

    reset() {
        this.crc = 0xffff;
        this.isOdd = false;
    }

    update(b) {
        let crc = this.crc;
        for (let i = 0; i < 8; i++) {
            const bit = (b >> (7 - i)) & 1;
            const c15 = (crc >> 15) & 1;
            crc = ((crc << 1) ^ (c15 !== bit ? 0x1021 : 0)) & 0xFFFF;
        }
        this.crc = crc;
        this.isOdd = !this.isOdd;
    }

    get() {
        if (this.isOdd) {
            this.update(0); // Füge Padding hinzu, falls notwendig
        }
        return this.crc;
    }
}

module.exports = CRC;

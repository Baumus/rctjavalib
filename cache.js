class CacheEntry {
    constructor(dg, ts) {
        this.dg = dg;
        this.ts = ts;
    }
}

class Cache {
    constructor(timeout) {
        this.entries = new Map();
        this.timeout = timeout;
    }

    get(identifier) {
        const entry = this.entries.get(identifier);
        if (!entry) {
            return [null, false];
        }

        const currentTime = new Date();
        const elapsedTime = currentTime - entry.ts;

        if (elapsedTime > this.timeout) {
            return [null, false];
        }
        return [entry.dg, true];
    }

    put(dg) {
        const entry = new CacheEntry(dg, new Date());
        this.entries.set(dg.id, entry);
    }
}

module.exports = Cache;

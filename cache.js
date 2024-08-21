class CacheEntry {
    constructor(dg, ts) {
        this.dg = dg;
        this.ts = ts;
    }
}

class Cache {
    constructor(timeout, maxSize = 1000) {
        this.entries = new Map();
        this.timeout = timeout;
        this.maxSize = maxSize;
    }

    get(identifier) {
        const entry = this.entries.get(identifier);
        if (!entry) {
            return [null, false];
        }

        const currentTime = Date.now();
        const elapsedTime = currentTime - entry.ts;

        if (elapsedTime > this.timeout) {
            this.entries.delete(identifier); // Entfernt veraltete Einträge
            return [null, false];
        }
        return [entry.dg, true];
    }

    put(dg) {
        if (this.entries.size >= this.maxSize) {
            this.cleanup(); // Entfernt die ältesten Einträge, um Platz zu schaffen
        }
        const entry = new CacheEntry(dg, Date.now());
        this.entries.set(dg.id, entry);
    }

    cleanup() {
        const currentTime = Date.now();
        for (let [key, entry] of this.entries) {
            if (currentTime - entry.ts > this.timeout) {
                this.entries.delete(key);
            }
        }

        if (this.entries.size > this.maxSize) {
            // Entferne die ältesten Einträge, wenn die Cache-Größe überschritten wurde
            const keys = Array.from(this.entries.keys());
            for (let i = 0; i < this.entries.size - this.maxSize; i++) {
                this.entries.delete(keys[i]);
            }
        }
    }
}

module.exports = Cache;

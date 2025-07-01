const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');
const { Command, Identifier } = require('./datagram.js');
const { RecoverableError } = require('./recoverable.js');

const builderTestCases = [
    { dg: { cmd: Command.READ, id: Identifier.BATTERY_POWER_W.id, data: null }, expect: "[2B 01 04 40 0F 01 5B 58 B4]" },
    { dg: { cmd: Command.READ, id: Identifier.INVERTER_AC_POWER_W.id, data: null }, expect: "[2B 01 04 DB 2D 2D 69 AE 55 AB]" }
];

const dg = { cmd: Command.READ, id: Identifier.INVERTER_AC_POWER_W.id, data: null }; 
const builder = new DatagramBuilder();
builder.build(dg);
console.log(builder.toString());

describe('DatagramBuilder and DatagramParser Tests', () => {

    test('Builder returns expected byte representation', () => {
        const builder = new DatagramBuilder();
       
        for (const tc of builderTestCases) {
            builder.build(tc.dg);
            const res = builder.toString();
            expect(res).toBe(tc.expect);
        }
    });

    test('Roundtrip from builder to parser returns the same datagram', () => {
        const builder = new DatagramBuilder();
        const parser = new DatagramParser();

        for (const tc of builderTestCases) {
            builder.build(tc.dg);
            parser.reset();
            parser.buffer = builder.bytes();
            parser.length = builder.bytes().length;
            const result = parser.parse();
            expect(result && result.datagram).toBeTruthy();
            const dg = result.datagram;

            expect(dg).toBeTruthy();  // check if dg is not null or undefined
            expect(dg.cmd).toBe(tc.dg.cmd);
            expect(dg.id >>> 0).toBe(tc.dg.id >>> 0);  // Treat both values as unsigned 32-bit integers
            expect(dg.data ? dg.data.length : 0).toBe(tc.dg.data ? tc.dg.data.length : 0);

            for (let i = 0; i < dg.data.length; i++) {
                expect(dg.data[i]).toBe(tc.dg.data[i]);
            }
        }
    });

});

describe('DatagramBuilder Validations', () => {

    let builder;

    beforeEach(() => {
        builder = new DatagramBuilder();
    });

    test('should throw error for dg.id value of -1', () => {
        expect(() => {
            builder.build({ id: -1, cmd: 1, data: [1, 2, 3] });
        }).toThrow('Invalid ID: -1');
    });

    test('should throw error for dg.id value of 0x100000000', () => {
        expect(() => {
            builder.build({ id: 0x100000000, cmd: 1, data: [1, 2, 3] });
        }).toThrow('Invalid ID: 4294967296');
    });

    test('should throw error for dg.data value containing -1', () => {
        expect(() => {
            builder.build({ id: 1, cmd: 1, data: [-1, 2, 3] });
        }).toThrow('Invalid data byte -1');
    });

    test('should throw error for dg.data value containing 256', () => {
        expect(() => {
            builder.build({ id: 1, cmd: 1, data: [256, 2, 3] });
        }).toThrow('Invalid data byte 256');
    });

    test('should throw error for dg.cmd value of -1', () => {
        expect(() => {
            builder.build({ id: 1, cmd: -1, data: [1, 2, 3] });
        }).toThrow('Invalid command: -1');
    });

    test('should throw error for dg.cmd value of 256', () => {
        expect(() => {
            builder.build({ id: 1, cmd: 256, data: [1, 2, 3] });
        }).toThrow('Invalid command: 256');
    });

});

describe('DatagramParser Validations', () => {
    let parser;

    beforeEach(() => {
        parser = new DatagramParser();
    });

    test('should correctly parse valid buffer', () => {
        const buffer = [0x2B, 0x01, 0x04, 0x40, 0x0F, 0x01, 0x5B, 0x58, 0xB4];
        parser.buffer = new Uint8Array(buffer);
        parser.length = buffer.length;
        const result = parser.parse();
        expect(result && result.datagram).toBeTruthy();
        const dg = result.datagram;
        expect(dg.cmd).toBe(0x01);
        expect(dg.id).toBe(0x400F015B);
    });

    test('should throw error for invalid buffer', () => {
        const buffer = [0x2B, 0x01, 0x04, 0x40, 0x0F, 0x01, 0x91, -2134184, 0x180];
        parser.buffer = new Uint8Array(buffer);
        parser.length = buffer.length;
        expect(() => parser.parse()).toThrow(RecoverableError);
    });
});

const Connection = require('./connection.js');

describe('Connection Pooling', () => {
    const host = '127.0.0.1';
    const port = 12345;
    const cacheDuration = 1000;

    test('reuses connection for same host:port', () => {
        const c1 = Connection.getPooledConnection(host, port, cacheDuration);
        const c2 = Connection.getPooledConnection(host, port, cacheDuration);
        expect(c1).toBe(c2);
    });

    test('returns new connection after close (pooled)', () => {
        const c1 = Connection.getPooledConnection(host, port, cacheDuration);
        c1.close();
        const c2 = Connection.getPooledConnection(host, port, cacheDuration);
        expect(c2).not.toBe(c1);
    });

    test('different ports do not share connection (pooled)', () => {
        const c1 = Connection.getPooledConnection(host, 10000, cacheDuration);
        const c2 = Connection.getPooledConnection(host, 10001, cacheDuration);
        expect(c1).not.toBe(c2);
    });

    test('different hosts do not share connection (pooled)', () => {
        const c1 = Connection.getPooledConnection('127.0.0.1', port, cacheDuration);
        const c2 = Connection.getPooledConnection('127.0.0.2', port, cacheDuration);
        expect(c1).not.toBe(c2);
    });

    test('direct new always returns a fresh instance', () => {
        const c1 = new Connection(host, port, cacheDuration);
        const c2 = new Connection(host, port, cacheDuration);
        expect(c1).not.toBe(c2);
    });
});

describe('Connection Request Queue', () => {
    test('should process requests strictly in sequence and never in parallel', async () => {
        // Fake Host/Port – es wird nichts verbunden, wir testen nur die Queue
        const conn = new Connection('localhost', 12345, 1000);

        let concurrentExecutions = 0;
        let maxConcurrent = 0;
        let callOrder = [];

        // Wir hängen uns an die _enqueueRequest-Queue direkt an.
        // Die Jobs warten jeweils 30ms, um Überschneidungen zu erkennen
        function jobFactory(id, wait = 30) {
            return async () => {
                concurrentExecutions++;
                if (concurrentExecutions > maxConcurrent) maxConcurrent = concurrentExecutions;
                callOrder.push(`start-${id}`);

                // Simuliertes "langes" Processing
                await new Promise(res => setTimeout(res, wait));

                callOrder.push(`end-${id}`);
                concurrentExecutions--;
                return id;
            }
        }

        // Fünf Requests fast gleichzeitig in die Queue geben
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(conn._enqueueRequest(jobFactory(i)));
        }

        // Alle durchlaufen lassen
        const results = await Promise.all(promises);

        // Die Ausführung MUSS nacheinander erfolgen (maxConcurrent darf nie > 1 sein)
        expect(maxConcurrent).toBe(1);

        // Die Ergebnisse müssen der Reihenfolge nach stimmen
        expect(results).toEqual([0, 1, 2, 3, 4]);
        expect(callOrder).toEqual([
            'start-0', 'end-0',
            'start-1', 'end-1',
            'start-2', 'end-2',
            'start-3', 'end-3',
            'start-4', 'end-4'
        ]);
    });
});

describe('DatagramParser Buffer Robustness', () => {
    test('should parse multiple datagrams from a single buffer', () => {
        const builder = new DatagramBuilder();
        const parser  = new DatagramParser();

        // first frame
        builder.build({ cmd: Command.READ, id: 0x400F015B, data: null });
        const frame1 = Buffer.from(builder.bytes());        // clone here

        // second frame
        builder.build({ cmd: Command.READ, id: 0xDB2D69AE, data: null });
        const frame2 = Buffer.from(builder.bytes());        // clone here

        // combine and feed parser
        let buffer = Buffer.concat([frame1, frame2]);
        parser.buffer = new Uint8Array(buffer);
        parser.length = parser.buffer.length;

        const r1 = parser.parse();
        expect(r1 && r1.datagram).toBeTruthy();

        parser.buffer = parser.buffer.slice(r1.bytesConsumed);
        parser.length = parser.buffer.length;

        const r2 = parser.parse();
        expect(r2 && r2.datagram).toBeTruthy();

        expect(r1.datagram.id).toBe(0x400F015B);
        expect(r2.datagram.id).toBe(0xDB2D69AE);
    });



    test('should wait for complete frame if buffer is partial', () => {
        const parser = new DatagramParser();
        // Only the start of a frame, missing the last bytes
        const buffer = [0x2B, 0x01, 0x04, 0x40, 0x0F];
        parser.buffer = new Uint8Array(buffer);
        parser.length = buffer.length;

        let result = parser.parse();
        expect(result).toBe(null); // Not enough data, should return null
    });

    test('should skip and survive unsolicited frames', () => {
        const builder = new DatagramBuilder();
        const parser = new DatagramParser();

        // Build push frame (cmd=2, id=0x11223344)
        builder.build({ cmd: 0x02, id: 0x11223344, data: null });
        const pushFrame = builder.bytes();

        // Build a valid response frame (cmd=1, id=0x400F015B)
        builder.build({ cmd: 0x01, id: 0x400F015B, data: null });
        const responseFrame = builder.bytes();

        const buffer = Buffer.concat([pushFrame, responseFrame]);
        parser.buffer = buffer;
        parser.length = buffer.length;

        let result1 = parser.parse();
        expect(result1 && result1.datagram).toBeTruthy();
        let result2 = parser.parse();
        expect(result2 && result2.datagram).toBeTruthy();

        // Check both frames parsed, order may vary
        expect([0x01, 0x02]).toContain(result1.datagram.cmd);
        expect([0x01, 0x02]).toContain(result2.datagram.cmd);
    });

    test('should parse second frame after first parsed and buffer updated', () => {
        const parser = new DatagramParser();
        // First, only the first frame
        const buffer1 = [0x2B, 0x01, 0x04, 0x40, 0x0F, 0x01, 0x5B, 0x58, 0xB4];
        parser.buffer = new Uint8Array(buffer1);
        parser.length = buffer1.length;

        let result1 = parser.parse();
        expect(result1 && result1.datagram).toBeTruthy();
        // Simulate updating the buffer with the next frame (e.g., a later TCP chunk)
        const buffer2 = [0x2B, 0x01, 0x04, 0xDB, 0x2D, 0x2D, 0x69, 0xAE, 0x55, 0xAB];
        parser.buffer = new Uint8Array(buffer2);
        parser.length = buffer2.length;

        let result2 = parser.parse();
        expect(result2 && result2.datagram).toBeTruthy();
        expect(result2.datagram.id).toBe(0xDB2D69AE);
    });
});






/*
// Basic Parsing Tests
describe('Basic Parsing Tests', () => {
    let parser;

    beforeEach(() => {
        parser = new DatagramParser();
    });

    test('should parse minimal valid buffer', () => {
        const buffer = new Uint8Array([0x2b, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00]); // Adjust this based on what a minimal valid buffer looks like
        parser.buffer = buffer;
        expect(() => parser.parse()).not.toThrow();
    });

    test('should throw error with only start byte', () => {
        const buffer = new Uint8Array([0x2b]);
        parser.buffer = buffer;
        expect(() => parser.parse()).toThrow();
    });

    test('should throw error with missing start byte', () => {
        const buffer = new Uint8Array([0x01, 0x04, 0x00, 0x00, 0x00, 0x00]);
        parser.buffer = buffer;
        expect(() => parser.parse()).toThrow();
    });

    test('should handle extra bytes after complete datagram', () => {
        const buffer = new Uint8Array([0x2b, 0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x2b]);
        parser.buffer = buffer;
        expect(() => parser.parse()).not.toThrow();
    });
});

// Command Byte Tests
describe('Command Byte Tests', () => {
    let parser;

    beforeEach(() => {
        parser = new DatagramParser();
    });

    test('should handle valid command bytes', () => {
        const buffer = new Uint8Array([0x2b, Command.READ, Command.WRITE, Command.LONG_WRITE, Command.RESERVED1, Command.RESPONSE, Command.LONG_RESPONSE, Command.RESERVED2, Command.READ_PERIODICALLY, Command.EXTENSION]);
        parser.buffer = buffer;
        expect(() => parser.parse()).not.toThrow();
    });

    test('should throw error for invalid command bytes', () => {
        const buffer = new Uint8Array([0x2b, 0xFF, 0x04, 0x00, 0x00, 0x00, 0x00]); // Assuming 0xFF is an invalid command byte
        parser.buffer = buffer;
        expect(() => parser.parse()).toThrow();
    });
});

// Negative Byte Value Tests
describe('Negative Byte Value Tests', () => {
    let parser;

    beforeEach(() => {
        parser = new DatagramParser();
    });

    test('should convert negative byte values to unsigned byte values', () => {
        const buffer = new Uint8Array([0x2b, 0x01, 0x04, 0x00, 0x00, 0x00, 0xFF]); // 0xFF is -1 in signed byte representation
        parser.buffer = buffer;
        expect(() => parser.parse()).not.toThrow();
    });
});
*/
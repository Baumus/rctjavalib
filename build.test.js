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
            const dg = parser.parse();

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
        const dg = parser.parse();
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
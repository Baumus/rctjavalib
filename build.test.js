const DatagramBuilder = require('./build.js');
const DatagramParser = require('./parse.js');

const builderTestCases = [
    { dg: { cmd: 'Read', id: 'BatteryPowerW', data: null }, expect: "[2B 01 04 40 0F 01 5B 58 B4]" },
    { dg: { cmd: 'Read', id: 'InverterACPowerW', data: null }, expect: "[2B 01 04 DB 2D 2D 69 AE 55 AB]" }
];

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
            expect(dg.id).toBe(tc.dg.id);
            expect(dg.data.length).toBe(tc.dg.data ? tc.dg.data.length : 0);

            for (let i = 0; i < dg.data.length; i++) {
                expect(dg.data[i]).toBe(tc.dg.data[i]);
            }
        }
    });

});

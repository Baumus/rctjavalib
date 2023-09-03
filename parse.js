const { RecoverableError, isRecoverableError } = require('./recoverable.js');
const CRC = require('./crc.js');
const { Command } = require('./datagram.js');


const ParserState = {
    AwaitingStart: 0,
    AwaitingCmd: 1,
    AwaitingLen: 2,
    AwaitingId0: 3,
    AwaitingId1: 4,
    AwaitingId2: 5,
    AwaitingId3: 6,
    AwaitingData: 7,
    AwaitingCrc0: 8,
    AwaitingCrc1: 9,
    Done: 10
};

class DatagramParser {
    constructor() {
        this.dg = { id: 0 };
        this.buffer = new Uint8Array(1024); // Standardpuffergröße
        this.length = 0;
        this.pos = 0;
        this.state = ParserState.AwaitingStart;
    }

    reset() {
        this.length = 0;
        this.pos = 0;
        this.state = ParserState.AwaitingStart;
    }

    parse() {
        let length = 0;
        let dataLength = 0;
        let crc = new CRC();
        let crcReceived = 0;
        let escaped = false;
        let state = ParserState.AwaitingStart;
        let dg = {};

        //debug purposes
        console.log("Received data:", this.buffer);
        let startIndex = this.buffer.indexOf(0x2B);
        if (startIndex === -1) {
            throw new RecoverableError('Missing start byte');
        }
        state = ParserState.AwaitingCmd;
    
        console.log("Parser ");
        
        for (let i = startIndex; i < this.length; i++) {
            const b = this.buffer[i];

            if (escaped) {
                escaped = false;
            } else {
                if (b === 0x2d) {
                    escaped = true;
                    continue;
                } else if (b === 0x2b && state !== ParserState.AwaitingStart) {
                    this.reset();
                    continue;
                }
            }
        
            console.log(`(${state})-${b.toString(16).padStart(2, '0')}->`);
             
            switch (state) {
            
                case ParserState.AwaitingCmd:
                    crc.reset();
                    crc.update(b);
                    dg.cmd = b;
                    console.log("Received command byte:", dg.cmd);

                
                    console.log(`Command value: ${dg.cmd}, READ_PERIODICALLY value: ${Command.READ_PERIODICALLY}, EXTENSION value: ${Command.EXTENSION}`);

                    if (Command.toString(dg.cmd) !== "#INVALID") {
                        state = ParserState.AwaitingLen;
                    } else {
                        state = ParserState.AwaitingStart;
                    }                    
                                    
                case ParserState.AwaitingLen:
                    crc.update(b);
                    length = b;
                    dataLength = length - 4;
                    state = ParserState.AwaitingId0;
                    break;
            
                case ParserState.AwaitingId0:
                    crc.update(b);
                    dg.id |= (b << 24) >>> 0;  // Ensure unsigned shift
                    state = ParserState.AwaitingId1;
                    break;
            
                case ParserState.AwaitingId1:
                    crc.update(b);
                    dg.id |= (b << 16) >>> 0;  // Ensure unsigned shift
                    state = ParserState.AwaitingId2;
                    break;
            
                case ParserState.AwaitingId2:
                    crc.update(b);
                    dg.id |= (b << 8) >>> 0;  // Ensure unsigned shift
                    state = ParserState.AwaitingId3;  // Ensure transition to AwaitingId3
                    break;
            
                case ParserState.AwaitingId3:
                    crc.update(b);
                    dg.id |= b;
                    dg.data = [];  // Das entspricht make([]byte, 0, dataLength) in Go
                    if (dataLength > 0) {
                        state = ParserState.AwaitingData;
                    } else {
                        state = ParserState.AwaitingCrc0;
                    }
                    break;
            
                case ParserState.AwaitingData:
                    crc.update(b);
                    if (escaped) {
                        // Handle the escaped byte
                        dg.data.push(b ^ 0x20);
                        escaped = false;
                    } else if (b === 0x2d) {
                        escaped = true;
                    } else {
                        dg.data.push(b);
                    }
                    if (dg.data.length === dataLength) {
                        state = ParserState.AwaitingCrc0;
                    }
                    break;
            
                case ParserState.AwaitingCrc0:
                    crcReceived = b << 8;
                    state = ParserState.AwaitingCrc1;
                    break;
            
                case ParserState.AwaitingCrc1:
                    crcReceived |= b;
                    const crcCalculated = crc.get();
                    if (crcCalculated !== crcReceived) {
                        // Hier können Sie eine Fehlermeldung oder ein Logging hinzufügen, wenn Sie möchten
                        state = ParserState.AwaitingStart;
                    } else {
                        state = ParserState.Done;
                    }
                    break;
            
                case ParserState.Done:
                    // Ignoriere zusätzliche Bytes
                    break;
            }  
            
            if (!escaped && (b === 0x2b || b === 0x2d)) {
                console.log("Parsing error detected.");
                console.log(`Current state: ${state}`);
                console.log(`Current byte: ${b.toString(16).padStart(2, '0')}`);
                console.log(`Buffer position: ${i}`);
            }            

        }

        if (state !== ParserState.Done) {
            console.error("Failed to parse data:", this.buffer.toString());
            throw new RecoverableError(`Parsing failed in state ${state}`);
        }        
        return dg;
    }
}

module.exports = DatagramParser;

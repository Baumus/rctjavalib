/**
 * DatagramParser: A class responsible for parsing datagrams based on a state machine approach.
 * It handles unsigned 32-bit integers and provides detailed error messages for parsing failures.
 */
const { RecoverableError, isRecoverableError } = require('./recoverable.js');
const CRC = require('./crc.js');
const { Command, Datagram } = require('./datagram.js');

/**
 * Enumeration of parser states representing different stages of the parsing process.
 */
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
    /**
     * Initializes a new instance of the DatagramParser.
     * Sets up the initial state and buffer for parsing.
     */
    constructor() {
        //this.dg = { id: 0 };
        this.buffer = new Uint8Array(1024); // Standardpuffergröße
        this.length = 0;
        this.pos = 0;
        this.state = ParserState.AwaitingStart;
    }

    /**
     * Resets the parser to its initial state.
     * Useful for starting a new parsing process or recovering from an error.
     */
    reset() {
        this.length = 0;
        this.pos = 0;
        this.state = ParserState.AwaitingStart;
    }

    /**
     * Parses the buffer to extract a datagram.
     * Uses a state machine approach to handle different parts of the datagram.
     * @returns {Object} The parsed datagram.
     * @throws {RecoverableError} If parsing fails at any stage.
     */
    parse() {
        let length = 0;
        let dataLength = 0;
        let crc = new CRC();
        let crcReceived = 0;
        let escaped = false;
        let state = ParserState.AwaitingStart;
        let dg = new Datagram();

        //debug purposes
        console.log("Buffer content:", this.buffer);
        let startIndex = this.buffer.indexOf(0x2B);
        if (startIndex === -1) {
            throw new RecoverableError('Missing start byte');
        }
        state = ParserState.AwaitingCmd;
    
        console.log("Parser start index:", startIndex);
        console.log("Parser buffer length:", this.buffer.length);
        console.log("Parser buffer state:", state);

        this.length = this.buffer.length;
        let i = startIndex + 1; // Überspringen Sie das Startbyte und gehen Sie zum nächsten Byte über
        while (i < this.length) {
            const b = this.buffer[i] & 0xFF; // Ensure unsigned byte
     
            // Handling of escaped bytes
            if (!escaped) {
                if (b === 0x2b) {
                    state = ParserState.AwaitingCmd;
                    i++;
                    continue;
                } else if (b === 0x2d) {
                    escaped = true;
                    i++;
                    continue;
                }
            } else {
                escaped = false; // Reset the escaped flag
            }

            console.log("Parser buffer index:", i);
            console.log("Parser buffer byte:", b);
        
            console.log(`(state: ${state})-${b.toString(16).padStart(2, '0')}->`);
         
            switch (state) {
                case ParserState.AwaitingStart:
                    if (b === 0x2B) {
                        state = ParserState.AwaitingCmd;
                    }
                    break;

                case ParserState.AwaitingCmd:
                    crc.reset();
                    crc.update(b);
                    dg.cmd = b;
                    console.log("Parsed command value:", dg.cmd);

                    if (Object.values(Command).includes(dg.cmd)) { 
                        state = ParserState.AwaitingLen;
                    } else {
                        console.log("Unrecognized command byte:", dg.cmd);
                        state = ParserState.AwaitingStart;
                    }
                    break;              
                                    
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
                    dg.id = (dg.id | b) >>> 0;   // Ensure the result is treated as an unsigned 32-bit integer
                    dg.data = [];  // Das entspricht make([]byte, 0, dataLength) in Go
                    if (dataLength > 0) {
                        state = ParserState.AwaitingData;
                    } else {
                        state = ParserState.AwaitingCrc0;
                    }
                    break;
            
                case ParserState.AwaitingData:
                    crc.update(b);
                    dg.data.push(b);
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
                    console.log("Received CRC:", crcReceived);
                    const crcCalculated = crc.get();
                    if (crcCalculated !== crcReceived) {
                        throw new RecoverableError(`CRC mismatch. Calculated: ${crcCalculated}, Received: ${crcReceived}`);
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
                console.log(`Parsing error detected at state: ${state}, at byte: ${b.toString(16).padStart(2, '0')}, at Buffer position: ${i}`);
            }  
        i++;
        }

        if (state !== ParserState.Done) {
            console.error("Failed to parse data at state:", state, "with buffer:", this.buffer.toString());
            throw new RecoverableError(`Parsing failed in state ${state}. Buffer content: ${this.buffer.toString()}`);
        }      
        return dg;
    }
}

/**
 * Exports the DatagramParser class for use in other modules.
 */
module.exports = DatagramParser;

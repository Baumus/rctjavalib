// parse.js
const CRC = require('./crc.js');
const { Datagram } = require('./datagram.js');

// Protokoll-Konstanten
const START_BYTE = 0x2B; // '+'
const ESCAPE_BYTE = 0x2D; // '-'

/**
 * Stream-sicherer Parser:
 *  - wirft keine Exceptions für Fragmentierung/Kurz-Frames
 *  - liefert:
 *    * null                          → brauche mehr Daten
 *    * { datagram: null, bytesConsumed: N } → N Bytes verwerfen (Noise/kurzer/defekter Frame)
 *    * { datagram, bytesConsumed: N }       → gültiges Datagramm + verbrauchte Bytes
 */
class DatagramParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  reset() {
    // aktuell kein Zustandsbedarf
  }

  parse() {
    const buf = this.buffer;
    if (!buf || buf.length === 0) return null;

    // 1) Start-Marker suchen
    const startIndex = this._findStartIndex(buf);
    if (startIndex < 0) {
      // gar kein Start-Byte → alles bis auf evtl. letztes Byte verwerfen,
      // hier vereinfachend: alles verwerfen (Transport liefert schnell neu)
      return { datagram: null, bytesConsumed: buf.length };
    }
    // Noise vor dem Start verwerfen
    if (startIndex > 0) {
      return { datagram: null, bytesConsumed: startIndex };
    }

    // 2) Unescapen & so lange sammeln, bis wir anhand der 'length' wissen, wie viele Bytes wir brauchen
    const out = [];
    let i = startIndex + 1; // erstes Byte nach START
    let expected = null;    // erwartete unescapte Länge: 2 (cmd,len) + len + 2 (crc)

    while (i < buf.length) {
      const b = buf[i];

      if (b === ESCAPE_BYTE) {
        if (i + 1 >= buf.length) {
          // Escape ohne Datenbyte → auf mehr warten
          return null;
        }
        out.push(buf[i + 1]);
        i += 2;
      } else if (b === START_BYTE && expected === null) {
        // Neuer Frame beginnt, bevor wir len lesen konnten → altes START verwerfen
        return { datagram: null, bytesConsumed: 1 };
      } else {
        out.push(b);
        i++;
      }

      if (expected === null && out.length >= 2) {
        const len = out[1]; // length-Feld
        expected = 2 + len + 2; // cmd+len + (len Bytes: id+data...) + 2 CRC
      }
      if (expected !== null && out.length >= expected) {
        break; // Frame komplett im 'out'
      }
    }

    if (expected === null || out.length < expected) {
      // noch unvollständig
      return null;
    }

    // 3) Grunddaten
    const cmd = out[0];
    const length = out[1];

    // 4) Sehr kurze Frames (<4) als „Kurz-/Keepalive-Frame“ behandeln → konsumieren & überspringen
    if (length < 4) {
      return { datagram: null, bytesConsumed: (i - startIndex) };
    }

    // 5) ID (4 Byte, big-endian)
    let off = 2;
    let id = 0;
    for (let k = 0; k < 4; k++) {
      id = (id << 8) | out[off + k];
    }
    id >>>= 0;
    off += 4;

    // 6) Nutzdaten
    const dataLen = length - 4;
    const dataBytes = out.slice(off, off + dataLen);

    // 7) CRC prüfen (über [cmd, length, ID..., data...], ggf. auf gerade Länge padden)
    const crcHigh = out[2 + length];
    const crcLow  = out[2 + length + 1];
    const crcReceived = ((crcHigh << 8) | crcLow) >>> 0;

    const crcCalc = this._computeCrcPad(out.slice(0, 2 + length));
    if (crcCalc !== crcReceived) {
      // korrupten Frame still verwerfen
      return { datagram: null, bytesConsumed: (i - startIndex) };
    }

    // 8) Gültiges Datagramm bauen
    const dg = new Datagram(cmd, id, Array.from(dataBytes));
    return { datagram: dg, bytesConsumed: (i - startIndex) };
  }

  _findStartIndex(buffer) {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === START_BYTE) {
        // wenn escaped, zählt es nicht als Start
        const escaped = (i > 0 && buffer[i - 1] === ESCAPE_BYTE);
        if (!escaped) return i;
      }
    }
    return -1;
  }

  /**
   * CRC mit „Pad auf gerade Länge“-Regel
   */
  _computeCrcPad(bytes) {
    const crc = new CRC();
    for (let b of bytes) crc.update(b);
    if ((bytes.length % 2) === 1) crc.update(0);
    return crc.get();
  }
}

module.exports = DatagramParser;

// ═══════════════════════════════════════════════════════════════════════════════
//  s7.js — Siemens S7 / SINUMERIK PLC conversion math.
//
//  Pure. Imports nothing. Knows nothing about React or signal names.
//
//  Conventions:
//    - `bits`       is a bit count  (8 / 16 / 32)
//    - `widthBytes` is a byte count (1 / 2 / 4)
//    - Every function returns a result OR { error: string }. Nothing throws.
//    - Byte order is big-endian (MSB first), as on all S7 hardware.
//    - Avoid <<  and >> on 32-bit values: JS bitwise ops coerce to SIGNED 32-bit,
//      so 0xFFFFFFFF << 0 is -1. Use * and Math.floor instead.
// ═══════════════════════════════════════════════════════════════════════════════

/** True if a returned value is a structured error. */
export function isErr(x) {
    return typeof x === "object" && x !== null && "error" in x;
}

// ── Radix ──────────────────────────────────────────────────────────────────────

/**
 * Parse a number in any notation a Siemens engineer might type.
 * Accepts: 16#FF | W#16#FF | DW#16#FF | B#16#FF | 0xFF | FFh | 2#1010 | 0b1010 | 255
 * A bare "FF" is rejected on purpose — it is ambiguous between hex and a typo.
 */
export function parseNumber(input) {
    if (typeof input !== "string") return { error: "Input must be a string" };
    const s = input.trim().replace(/\s+/g, "");
    if (s === "") return { error: "Empty input" };

    // Strip a Siemens typed-constant prefix: B#16#FF, W#16#FF, DW#16#FF
    const typed = /^(?:B|W|DW)#(.+)$/i.exec(s);
    const body = typed ? typed[1] : s;

    let m;
    if ((m = /^16#([0-9a-f]+)$/i.exec(body))) return { value: parseInt(m[1], 16), radix: 16 };
    if ((m = /^0x([0-9a-f]+)$/i.exec(body))) return { value: parseInt(m[1], 16), radix: 16 };
    if ((m = /^([0-9a-f]+)h$/i.exec(body))) return { value: parseInt(m[1], 16), radix: 16 };
    if ((m = /^2#([01]+)$/.exec(body))) return { value: parseInt(m[1], 2), radix: 2 };
    if ((m = /^0b([01]+)$/i.exec(body))) return { value: parseInt(m[1], 2), radix: 2 };
    if ((m = /^(\d+)$/.exec(body))) return { value: parseInt(m[1], 10), radix: 10 };

    return { error: `Cannot parse "${input}". Try 16#FF, 0xFF, FFh, 2#1010 or 255.` };
}

// ── Signed / unsigned ──────────────────────────────────────────────────────────

/** Normalise a value into the unsigned range for `bits` (wraps negatives). */
export function toUnsigned(value, bits) {
    const max = 2 ** bits;
    return ((value % max) + max) % max;
}

/** Two's-complement read. toSigned(0xFFFF, 16) === -1. */
export function toSigned(value, bits) {
    const max = 2 ** bits;
    const v = toUnsigned(value, bits);
    return v >= max / 2 ? v - max : v;
}

/** Siemens hex literal, zero-padded to the byte width. formatHex(255, 2) === "16#00FF". */
export function formatHex(value, widthBytes) {
    const u = toUnsigned(value, widthBytes * 8);
    return "16#" + u.toString(16).toUpperCase().padStart(widthBytes * 2, "0");
}

// ── Byte order (big-endian, MSB first) ─────────────────────────────────────────

const TYPE_BY_CODE = { X: "BOOL", B: "BYTE", W: "WORD", D: "DWORD" };
const CODE_BY_TYPE = { BOOL: "X", BYTE: "B", WORD: "W", DWORD: "D" };
const WIDTH_BY_CODE = { X: 1, B: 1, W: 2, D: 4 };

/** Assemble bytes MSB-first. assembleBE([0x12, 0x34]) === 0x1234. */
export function assembleBE(bytes) {
    return bytes.reduce((acc, b) => acc * 256 + (b & 0xff), 0);
}

/** Split a value into bytes MSB-first. splitBE(0x1234, 2) === [0x12, 0x34]. */
export function splitBE(value, widthBytes) {
    const u = toUnsigned(value, widthBytes * 8);
    const out = [];
    for (let i = widthBytes - 1; i >= 0; i--) {
        out.push(Math.floor(u / 256 ** i) % 256);
    }
    return out;
}

// ── Addresses ──────────────────────────────────────────────────────────────────

/**
 * Parse a DB address: DB10.DBW20, DB10.DBB20, DB10.DBD20, DB31.DBX60.4
 * Returns { db, type, byte, bit, widthBytes }. `bit` is null for non-BOOL.
 */
export function parseAddress(input) {
    if (typeof input !== "string") return { error: "Address must be a string" };
    const s = input.trim().toUpperCase().replace(/\s+/g, "");
    const m = /^DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d+))?$/.exec(s);
    if (!m) {
        return { error: `Cannot parse "${input}". Expected e.g. DB10.DBW20 or DB31.DBX60.4` };
    }

    const db = parseInt(m[1], 10);
    const code = m[2];
    const byte = parseInt(m[3], 10);
    const bitStr = m[4];

    if (db < 1) return { error: "DB number must be 1 or greater" };

    if (code === "X") {
        if (bitStr === undefined) {
            return { error: "A bit address needs a bit number, e.g. DB31.DBX60.4" };
        }
        const bit = parseInt(bitStr, 10);
        if (bit > 7) return { error: `Bit number must be 0-7, got ${bit}` };
        return { db, type: "BOOL", byte, bit, widthBytes: 1 };
    }

    if (bitStr !== undefined) {
        return { error: `Only DBX takes a bit number. DB${code}${byte} addresses a whole ${TYPE_BY_CODE[code]}.` };
    }

    return { db, type: TYPE_BY_CODE[code], byte, bit: null, widthBytes: WIDTH_BY_CODE[code] };
}

/** Render a parsed address back to Siemens notation. */
export function formatAddress(addr) {
    const code = CODE_BY_TYPE[addr.type];
    if (!code) return { error: `Unknown type ${addr.type}` };
    return addr.type === "BOOL"
        ? `DB${addr.db}.DBX${addr.byte}.${addr.bit}`
        : `DB${addr.db}.DB${code}${addr.byte}`;
}

/** The byte offsets an address occupies. DBW20 occupies [20, 21]. */
export function bytesForAddress(addr) {
    if (isErr(addr)) return addr;
    if (typeof addr.widthBytes !== "number") {
        return { error: "Address has no numeric widthBytes; expected the object returned by parseAddress" };
    }
    const out = [];
    for (let i = 0; i < addr.widthBytes; i++) out.push(addr.byte + i);
    return out;
}

/**
 * Do two addresses share any byte? The classic trap: DBW20 and DBW21 overlap,
 * because DBW20 is bytes 20-21 and DBW21 is bytes 21-22.
 *
 * NOTE: this can return { error: string } instead of a boolean when either
 * argument is malformed. Callers MUST check isErr(result) before using the
 * result as a boolean — `if (overlaps(a, b))` would treat an error object as
 * truthy and wrongly conclude "overlaps".
 */
export function overlaps(a, b) {
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    if (typeof a.widthBytes !== "number") {
        return { error: "First address has no numeric widthBytes; expected the object returned by parseAddress" };
    }
    if (typeof b.widthBytes !== "number") {
        return { error: "Second address has no numeric widthBytes; expected the object returned by parseAddress" };
    }
    if (a.db !== b.db) return false;
    const aEnd = a.byte + a.widthBytes - 1;
    const bEnd = b.byte + b.widthBytes - 1;
    return a.byte <= bEnd && b.byte <= aEnd;
}

// ── BCD ────────────────────────────────────────────────────────────────────────

/** Decode packed BCD. bcdToDec(0x99) === 99. Rejects any nibble above 9. */
export function bcdToDec(value) {
    if (!Number.isInteger(value)) return { error: "BCD requires an integer" };
    if (value < 0) return { error: "BCD values cannot be negative" };

    let result = 0;
    let mult = 1;
    let v = value;
    while (v > 0) {
        const nib = v % 16;
        if (nib > 9) {
            return { error: `Not valid BCD: nibble 16#${nib.toString(16).toUpperCase()} is above 9` };
        }
        result += nib * mult;
        mult *= 10;
        v = Math.floor(v / 16);
    }
    return result;
}

/** Encode to packed BCD. decToBcd(99) === 0x99. */
export function decToBcd(n) {
    if (!Number.isInteger(n)) return { error: "BCD requires an integer" };
    if (n < 0) return { error: "BCD values cannot be negative" };

    let result = 0;
    let shift = 0;
    let v = n;
    while (v > 0) {
        result += (v % 10) * 16 ** shift;
        v = Math.floor(v / 10);
        shift++;
    }
    return result;
}

// ── IEEE 754 single precision (S7 REAL) ────────────────────────────────────────

/** Read 32 bits as an S7 REAL. */
export function bitsToReal(u32) {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, toUnsigned(u32, 32), false); // false = big-endian
    return view.getFloat32(0, false);
}

/** Write an S7 REAL to its 32-bit pattern. */
export function realToBits(f) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, f, false);
    return view.getUint32(0, false);
}

/** Break a REAL's 32 bits into sign / exponent / mantissa, naming special cases. */
export function explainReal(u32) {
    const u = toUnsigned(u32, 32);
    const sign = Math.floor(u / 2 ** 31) % 2;
    const exponent = Math.floor(u / 2 ** 23) % 256;
    const mantissa = u % 2 ** 23;
    const value = bitsToReal(u);

    let special = null;
    if (exponent === 0xff) {
        special = mantissa === 0 ? (sign ? "-Infinity" : "+Infinity") : "NaN";
    } else if (exponent === 0) {
        special = mantissa === 0 ? (sign ? "-0" : "+0") : "denormal";
    }

    return { sign, exponent, mantissa, value, special };
}

// ── Rollup ─────────────────────────────────────────────────────────────────────

/**
 * Every reading of the same bits, for the UI to render side by side.
 * `bcd` may be a structured error — invalid BCD is a real condition, not a number.
 */
export function interpret(value, widthBytes) {
    const bits = widthBytes * 8;
    const u = toUnsigned(value, bits);

    const out = {
        hex: formatHex(u, widthBytes),
        unsigned: u,
        signed: toSigned(u, bits),
        binary: u.toString(2).padStart(bits, "0"),
        bytes: splitBE(u, widthBytes),
        bcd: bcdToDec(u),
        type:
            widthBytes === 1 ? "BYTE / SINT" : widthBytes === 2 ? "WORD / INT" : "DWORD / DINT / REAL",
    };

    if (widthBytes === 4) {
        out.real = bitsToReal(u);
        out.realExplain = explainReal(u);
    }
    return out;
}

// ── Pointers ───────────────────────────────────────────────────────────────────

/** S7 memory area identifiers, as used in byte 6 of an ANY pointer. */
export const AREA_IDS = { I: 0x81, Q: 0x82, M: 0x83, DB: 0x84, DI: 0x85, L: 0x86 };

/** S7 data type codes, as used in byte 1 of an ANY pointer. */
export const ANY_TYPE_CODES = {
    BOOL: 0x01, BYTE: 0x02, CHAR: 0x03, WORD: 0x04,
    INT: 0x05, DWORD: 0x06, DINT: 0x07, REAL: 0x08,
};

const ANY_TYPE_NAMES = Object.keys(ANY_TYPE_CODES);

/** Parse a P# pointer: P#DB10.DBX20.0 BYTE 4 */
export function parsePointer(input) {
    if (typeof input !== "string") return { error: "Pointer must be a string" };
    const s = input.trim().toUpperCase().replace(/\s+/g, " ");
    const m = /^P#DB(\d+)\.DBX(\d+)\.(\d+) ([A-Z]+) (\d+)$/.exec(s);
    if (!m) {
        return { error: `Cannot parse "${input}". Expected e.g. P#DB10.DBX20.0 BYTE 4` };
    }

    const bit = parseInt(m[3], 10);
    if (bit > 7) return { error: `Bit number must be 0-7, got ${bit}` };

    const type = m[4];
    if (!ANY_TYPE_NAMES.includes(type)) {
        return { error: `Unknown data type "${type}". Expected one of ${ANY_TYPE_NAMES.join(", ")}.` };
    }

    return {
        area: "DB",
        db: parseInt(m[1], 10),
        byte: parseInt(m[2], 10),
        bit,
        type,
        count: parseInt(m[5], 10),
    };
}

/** Render a pointer back to P# notation. */
export function formatPointer(p) {
    return `P#DB${p.db}.DBX${p.byte}.${p.bit} ${p.type} ${p.count}`;
}

/**
 * Pack a 32-bit area pointer.
 *   bits 0-2   bit number
 *   bits 3-18  byte offset
 *   bits 24-31 area id
 * So P#DB10.DBX20.0 packs to 16#840000A0 (20 * 8 = 160 = 16#A0).
 */
export function encodeAreaPointer(p) {
    const areaId = AREA_IDS[p.area];
    if (areaId === undefined) {
        return { error: `Unknown area "${p.area}". Expected one of ${Object.keys(AREA_IDS).join(", ")}.` };
    }
    if (p.byte > 0xffff) return { error: `Byte offset ${p.byte} exceeds the 16-bit range` };
    if (p.bit > 7) return { error: `Bit number must be 0-7, got ${p.bit}` };
    return areaId * 2 ** 24 + p.byte * 8 + p.bit;
}

/** Unpack a 32-bit area pointer. */
export function decodeAreaPointer(u32) {
    const u = toUnsigned(u32, 32);
    const areaId = Math.floor(u / 2 ** 24) % 256;
    const area = Object.keys(AREA_IDS).find((k) => AREA_IDS[k] === areaId) || null;
    const lower = u % 2 ** 24;
    return { area, areaId, byte: Math.floor(lower / 8), bit: lower % 8 };
}

/**
 * Build the 10-byte ANY pointer descriptor.
 *   byte 0     16#10 (ANY id)
 *   byte 1     data type code
 *   bytes 2-3  repetition count
 *   bytes 4-5  DB number
 *   byte 6     area id
 *   bytes 7-9  24-bit byte.bit offset
 */
export function encodeAnyPointer(p) {
    const typeCode = ANY_TYPE_CODES[p.type];
    if (typeCode === undefined) {
        return { error: `Unknown data type "${p.type}". Expected one of ${ANY_TYPE_NAMES.join(", ")}.` };
    }
    const areaId = AREA_IDS[p.area];
    if (areaId === undefined) {
        return { error: `Unknown area "${p.area}". Expected one of ${Object.keys(AREA_IDS).join(", ")}.` };
    }

    const offset = p.byte * 8 + p.bit; // fits in 24 bits, so shifts are safe below
    return [
        0x10,
        typeCode,
        Math.floor(p.count / 256) % 256,
        p.count % 256,
        Math.floor(p.db / 256) % 256,
        p.db % 256,
        areaId,
        Math.floor(offset / 65536) % 256,
        Math.floor(offset / 256) % 256,
        offset % 256,
    ];
}

/** Unpack a 10-byte ANY pointer descriptor. */
export function decodeAnyPointer(bytes) {
    if (!Array.isArray(bytes) || bytes.length !== 10) {
        return { error: `An ANY pointer is exactly 10 bytes, got ${Array.isArray(bytes) ? bytes.length : "non-array"}` };
    }
    if (bytes[0] !== 0x10) {
        return { error: `Byte 0 must be 16#10 (the ANY id), got 16#${bytes[0].toString(16).toUpperCase()}` };
    }

    const type = ANY_TYPE_NAMES.find((k) => ANY_TYPE_CODES[k] === bytes[1]);
    if (!type) {
        return { error: `Unknown data type code 16#${bytes[1].toString(16).toUpperCase()} in byte 1` };
    }

    const areaId = bytes[6];
    const area = Object.keys(AREA_IDS).find((k) => AREA_IDS[k] === areaId) || null;
    const offset = bytes[7] * 65536 + bytes[8] * 256 + bytes[9];

    return {
        type,
        count: bytes[2] * 256 + bytes[3],
        db: bytes[4] * 256 + bytes[5],
        area,
        byte: Math.floor(offset / 8),
        bit: offset % 8,
    };
}

// ── S5TIME ─────────────────────────────────────────────────────────────────────

/**
 * S5TIME layout, 16 bits:
 *   bits 12-13  time base (00 = 10ms, 01 = 100ms, 10 = 1s, 11 = 10s)
 *   bits 0-11   value, as 3 packed BCD digits (0-999)
 * STEP7 picks the SMALLEST base that fits, for best resolution.
 */
export const S5_BASES = [
    { code: 0, ms: 10, label: "10ms" },
    { code: 1, ms: 100, label: "100ms" },
    { code: 2, ms: 1000, label: "1s" },
    { code: 3, ms: 10000, label: "10s" },
];

/** Decode a 16-bit S5TIME word. */
export function s5TimeFromBits(u16) {
    const u = toUnsigned(u16, 16);
    const base = S5_BASES[Math.floor(u / 2 ** 12) % 4];
    const value = bcdToDec(u % 2 ** 12);
    if (isErr(value)) return { error: `S5TIME payload is not valid BCD: ${value.error}` };
    return { base: base.label, baseMs: base.ms, value, ms: value * base.ms, bits: u };
}

/** Parse S5T#2s, S5T#1m30s, S5T#10ms ... */
export function parseS5Time(input) {
    if (typeof input !== "string") return { error: "S5TIME must be a string" };
    const s = input.trim().toUpperCase().replace(/\s+/g, "");
    const m = /^S5T#(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?(?:(\d+)MS)?$/.exec(s);
    if (!m || !m.slice(1).some((g) => g !== undefined)) {
        return { error: `Cannot parse "${input}". Expected e.g. S5T#2s or S5T#1m30s` };
    }

    const ms =
        Number(m[1] || 0) * 3600000 +
        Number(m[2] || 0) * 60000 +
        Number(m[3] || 0) * 1000 +
        Number(m[4] || 0);

    if (ms === 0) return { error: "S5TIME must be at least 10ms" };

    // Smallest base whose value fits 3 BCD digits, matching STEP7.
    const base = S5_BASES.find((b) => ms % b.ms === 0 && ms / b.ms <= 999);
    if (!base) {
        return { error: `${ms}ms cannot be represented as S5TIME (range is 10ms to 9990s, value must fit 3 BCD digits)` };
    }

    const value = ms / base.ms;
    const bcd = decToBcd(value);
    if (isErr(bcd)) return bcd;

    return { base: base.label, baseMs: base.ms, value, ms, bits: base.code * 2 ** 12 + bcd };
}

// ── TIME (DINT milliseconds) ───────────────────────────────────────────────────

/** Parse T#1d2h3m4s5ms to milliseconds. */
export function parseTime(input) {
    if (typeof input !== "string") return { error: "TIME must be a string" };
    const s = input.trim().toUpperCase().replace(/\s+/g, "");
    const m = /^T#(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?(?:(\d+)MS)?$/.exec(s);
    if (!m || !m.slice(1).some((g) => g !== undefined)) {
        return { error: `Cannot parse "${input}". Expected e.g. T#1d2h3m4s5ms` };
    }
    return (
        Number(m[1] || 0) * 86400000 +
        Number(m[2] || 0) * 3600000 +
        Number(m[3] || 0) * 60000 +
        Number(m[4] || 0) * 1000 +
        Number(m[5] || 0)
    );
}

/** Render milliseconds as T#1d2h3m4s5ms, omitting zero components. */
export function formatTime(ms) {
    if (!Number.isInteger(ms)) return { error: "TIME requires an integer number of milliseconds" };
    if (ms < 0) return { error: "TIME cannot be negative" };
    if (ms === 0) return "T#0ms";

    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const rem = ms % 1000;

    let out = "T#";
    if (d) out += `${d}d`;
    if (h) out += `${h}h`;
    if (m) out += `${m}m`;
    if (s) out += `${s}s`;
    if (rem) out += `${rem}ms`;
    return out;
}

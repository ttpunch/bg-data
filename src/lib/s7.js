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
    const out = [];
    for (let i = 0; i < addr.widthBytes; i++) out.push(addr.byte + i);
    return out;
}

/**
 * Do two addresses share any byte? The classic trap: DBW20 and DBW21 overlap,
 * because DBW20 is bytes 20-21 and DBW21 is bytes 21-22.
 */
export function overlaps(a, b) {
    if (a.db !== b.db) return false;
    const aEnd = a.byte + a.widthBytes - 1;
    const bEnd = b.byte + b.widthBytes - 1;
    return a.byte <= bEnd && b.byte <= aEnd;
}

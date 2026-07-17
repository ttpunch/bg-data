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

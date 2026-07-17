# Siemens PLC Data & Address Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Knowledge card that converts Siemens PLC numbers and addresses — hex/dec/binary/BCD, DB word/byte/bit decoding, P#/ANY pointers, IEEE-754 REAL, S5TIME/TIME — plus an NC/PLC interface signal lookup for 840D sl / 840D powerline / 828D.

**Architecture:** A thin React shell over a pure, React-free logic library (`src/lib/s7.js`) with the signal dataset as separate pure data (`src/lib/s7Signals.js`). The math is isolated so it can be unit-tested without rendering — a wrong two's complement or byte order is silently wrong on a live machine, which is the failure this tool exists to prevent. Tasks 1–6 build and test the correctness core before any UI exists; Task 7 is the first visible slice.

**Tech Stack:** React 18, Vite 7, React Router, Tailwind, shadcn/ui primitives (`card`, `button`, `input`), lucide-react icons, Vitest (added by this plan — the repo's first test runner).

**Spec:** `docs/superpowers/specs/2026-07-17-siemens-plc-converter-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Unit convention (load-bearing):** any parameter named `bits` is a bit count (8/16/32); any parameter named `widthBytes` is a byte count (1/2/4). **No function takes an unqualified `width`.**
- **Totality contract:** every exported function returns a result **or** a structured `{ error: string }`. No function throws. No function returns a silently-wrong number.
- **`src/lib/s7.js` imports nothing.** No React, no signal data, no third-party packages.
- **`src/lib/s7Signals.js` imports nothing and knows nothing about rendering.**
- **Byte order is big-endian (MSB first).** In `DBW20`, `DBB20` is the high byte and `DBB21` the low byte.
- **Bit numbering is Siemens:** bit 7 is the MSB within each byte, bit 0 the LSB.
- **Signal accuracy:** nothing is guessed. Every dataset entry carries a `source`. Unknown addresses return an honest miss, never an invented name.
- **Follow existing patterns:** reuse the `ErrorBox` markup pattern from `src/components/AlarmCalculator.jsx`; use `./ui/card`, `./ui/button`, `./ui/input` primitives; components use default exports.
- **Arithmetic:** use `*` and `Math.floor`, not `<<`/`>>`, when handling 32-bit values. JavaScript bitwise operators coerce to **signed** 32-bit, so `0xFFFFFFFF << 0` is `-1`. Bitwise ops are safe only where a task explicitly confines them to ≤24 bits.
- **Detecting errors:** because success values are sometimes plain numbers, callers check errors with `typeof result === "object" && result !== null && "error" in result`. A shared `isErr()` helper is defined in Task 1 and used everywhere after.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/s7.js` | **Create.** All conversion math. Pure, no imports. Tasks 1–5. |
| `src/lib/s7.test.js` | **Create.** Unit tests for `s7.js`. Tasks 1–5. |
| `src/lib/s7Signals.js` | **Create.** Signal dataset + `lookupSignal`. Pure data. Task 6. |
| `src/lib/s7Signals.test.js` | **Create.** Unit tests for lookup + range resolution. Task 6. |
| `src/components/S7Converter.jsx` | **Create.** Thin shell: tab state + shared value/widthBytes. Task 7. |
| `src/components/s7/NumberTab.jsx` | **Create.** Hex/dec/bin/BCD + bit grid. Task 7. |
| `src/components/s7/AddressTab.jsx` | **Create.** DB decoder, byte map, overlap panel. Task 8. |
| `src/components/s7/PointerTab.jsx` | **Create.** P#/ANY builder + parser. Task 9. |
| `src/components/s7/SignalTab.jsx` | **Create.** NC/PLC signal lookup. Task 10. |
| `src/components/s7/RealTimeTab.jsx` | **Create.** IEEE-754 + S5TIME/TIME. Task 11. |
| `src/components/s7/Shared.jsx` | **Create.** `ErrorBox`, `Field`, `ResultRow` shared by tabs. Task 7. |
| `src/lib/knowledgeTools.jsx` | **Modify.** Add registry entry. Task 7. |
| `src/components/Layout.jsx` | **Modify.** Add route. Task 7. |
| `package.json` | **Modify.** Add `vitest` devDependency + `test` script. Task 1. |

---

## Task 1: Vitest setup + radix parsing and two's complement

Vitest setup is folded in here rather than split out: a reviewer cannot meaningfully approve "add a test runner" while rejecting the first tested function — they stand or fall together.

**Files:**
- Modify: `package.json`
- Create: `src/lib/s7.js`
- Test: `src/lib/s7.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `isErr(x) → boolean`, `parseNumber(str) → {value, radix} | {error}`, `toSigned(value, bits) → number`, `toUnsigned(value, bits) → number`, `formatHex(value, widthBytes) → string`.

- [ ] **Step 1: Install Vitest and add the test script**

```bash
npm install --save-dev vitest
```

Then edit `package.json` so the `scripts` block reads exactly:

```json
"scripts": {
  "start": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

No `vitest.config.js` is needed — Vitest reads the existing Vite config and defaults to a Node environment, which is all `s7.js` requires (it never touches the DOM).

- [ ] **Step 2: Write the failing test**

Create `src/lib/s7.test.js`:

```js
import { describe, it, expect } from "vitest";
import { isErr, parseNumber, toSigned, toUnsigned, formatHex } from "./s7";

describe("isErr", () => {
  it("recognises an error object", () => {
    expect(isErr({ error: "nope" })).toBe(true);
  });
  it("does not treat plain values as errors", () => {
    expect(isErr(0)).toBe(false);
    expect(isErr(null)).toBe(false);
    expect(isErr({ value: 1 })).toBe(false);
  });
});

describe("parseNumber", () => {
  it("parses Siemens hex", () => {
    expect(parseNumber("16#FF")).toEqual({ value: 255, radix: 16 });
  });
  it("parses Siemens typed hex constants", () => {
    expect(parseNumber("W#16#FF")).toEqual({ value: 255, radix: 16 });
    expect(parseNumber("DW#16#FFFF")).toEqual({ value: 65535, radix: 16 });
  });
  it("parses C-style and suffix hex", () => {
    expect(parseNumber("0xFF")).toEqual({ value: 255, radix: 16 });
    expect(parseNumber("FFh")).toEqual({ value: 255, radix: 16 });
  });
  it("parses Siemens binary", () => {
    expect(parseNumber("2#1010")).toEqual({ value: 10, radix: 2 });
  });
  it("parses decimal", () => {
    expect(parseNumber("255")).toEqual({ value: 255, radix: 10 });
  });
  it("is case and whitespace insensitive", () => {
    expect(parseNumber("  16#ff  ")).toEqual({ value: 255, radix: 16 });
  });
  it("rejects a bare hex string with no radix marker", () => {
    expect(isErr(parseNumber("FF"))).toBe(true);
  });
  it("rejects empty input", () => {
    expect(isErr(parseNumber(""))).toBe(true);
  });
  it("rejects an invalid binary digit", () => {
    expect(isErr(parseNumber("2#1012"))).toBe(true);
  });
});

describe("toSigned", () => {
  it("reads 16#FFFF as -1 (the INT vs WORD trap)", () => {
    expect(toSigned(0xffff, 16)).toBe(-1);
  });
  it("reads the most negative INT", () => {
    expect(toSigned(0x8000, 16)).toBe(-32768);
  });
  it("reads the most positive INT", () => {
    expect(toSigned(0x7fff, 16)).toBe(32767);
  });
  it("handles BYTE width", () => {
    expect(toSigned(0xff, 8)).toBe(-1);
    expect(toSigned(0x7f, 8)).toBe(127);
  });
  it("handles DWORD width without 32-bit overflow", () => {
    expect(toSigned(0xffffffff, 32)).toBe(-1);
    expect(toSigned(0x80000000, 32)).toBe(-2147483648);
  });
});

describe("toUnsigned", () => {
  it("keeps DWORD values positive", () => {
    expect(toUnsigned(0xffffffff, 32)).toBe(4294967295);
  });
  it("wraps a negative value into range", () => {
    expect(toUnsigned(-1, 16)).toBe(65535);
  });
});

describe("formatHex", () => {
  it("zero-pads to the byte width", () => {
    expect(formatHex(255, 2)).toBe("16#00FF");
    expect(formatHex(255, 1)).toBe("16#FF");
    expect(formatHex(255, 4)).toBe("16#000000FF");
  });
  it("formats a full DWORD", () => {
    expect(formatHex(0xffffffff, 4)).toBe("16#FFFFFFFF");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./s7"`, because `src/lib/s7.js` does not exist yet.

- [ ] **Step 4: Write the implementation**

Create `src/lib/s7.js`:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in `src/lib/s7.test.js` green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/s7.js src/lib/s7.test.js
git commit -m "feat: add s7 radix parsing and two's complement, with vitest

Adds Vitest as the repo's first test runner and the foundation of the
pure S7 conversion library: parseNumber (16#/0x/h/2#/decimal, including
Siemens typed constants), toSigned/toUnsigned two's complement, and
formatHex.

toSigned is the reason this library exists: 16#FFFF is 65535 as a WORD
but -1 as an INT, and showing only one is wrong half the time."
```

---

## Task 2: Big-endian assembly, address parsing, overlap detection

**Files:**
- Modify: `src/lib/s7.js`
- Test: `src/lib/s7.test.js`

**Interfaces:**
- Consumes: `toUnsigned` (Task 1).
- Produces: `assembleBE(bytes) → number`, `splitBE(value, widthBytes) → number[]`, `parseAddress(str) → {db, type, byte, bit, widthBytes} | {error}`, `formatAddress(addr) → string | {error}`, `bytesForAddress(addr) → number[]`, `overlaps(a, b) → boolean`. `type` is one of `"BOOL" | "BYTE" | "WORD" | "DWORD"`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/s7.test.js`:

```js
import {
  assembleBE, splitBE, parseAddress, formatAddress, bytesForAddress, overlaps,
} from "./s7";

describe("assembleBE", () => {
  it("assembles MSB first, not LSB first", () => {
    expect(assembleBE([0x12, 0x34])).toBe(0x1234);
  });
  it("assembles a DWORD without going negative", () => {
    expect(assembleBE([0xff, 0xff, 0xff, 0xff])).toBe(4294967295);
  });
  it("assembles a single byte", () => {
    expect(assembleBE([0xab])).toBe(0xab);
  });
});

describe("splitBE", () => {
  it("splits MSB first", () => {
    expect(splitBE(0x1234, 2)).toEqual([0x12, 0x34]);
  });
  it("splits a DWORD", () => {
    expect(splitBE(0x12345678, 4)).toEqual([0x12, 0x34, 0x56, 0x78]);
  });
  it("round-trips with assembleBE", () => {
    expect(assembleBE(splitBE(0xdeadbeef, 4))).toBe(0xdeadbeef);
  });
});

describe("parseAddress", () => {
  it("parses a word address", () => {
    expect(parseAddress("DB10.DBW20")).toEqual({
      db: 10, type: "WORD", byte: 20, bit: null, widthBytes: 2,
    });
  });
  it("parses a byte address", () => {
    expect(parseAddress("DB10.DBB20")).toEqual({
      db: 10, type: "BYTE", byte: 20, bit: null, widthBytes: 1,
    });
  });
  it("parses a dword address", () => {
    expect(parseAddress("DB10.DBD20")).toEqual({
      db: 10, type: "DWORD", byte: 20, bit: null, widthBytes: 4,
    });
  });
  it("parses a bit address", () => {
    expect(parseAddress("DB31.DBX60.4")).toEqual({
      db: 31, type: "BOOL", byte: 60, bit: 4, widthBytes: 1,
    });
  });
  it("is case and whitespace insensitive", () => {
    expect(parseAddress(" db10.dbw20 ").type).toBe("WORD");
  });
  it("rejects a bit number above 7", () => {
    expect(isErr(parseAddress("DB10.DBX20.8"))).toBe(true);
  });
  it("rejects DBX without a bit number", () => {
    expect(isErr(parseAddress("DB10.DBX20"))).toBe(true);
  });
  it("rejects a bit number on a word address", () => {
    expect(isErr(parseAddress("DB10.DBW20.1"))).toBe(true);
  });
  it("rejects DB0", () => {
    expect(isErr(parseAddress("DB0.DBW20"))).toBe(true);
  });
  it("rejects gibberish", () => {
    expect(isErr(parseAddress("hello"))).toBe(true);
  });
});

describe("formatAddress", () => {
  it("round-trips a word address", () => {
    expect(formatAddress(parseAddress("DB10.DBW20"))).toBe("DB10.DBW20");
  });
  it("round-trips a bit address", () => {
    expect(formatAddress(parseAddress("DB31.DBX60.4"))).toBe("DB31.DBX60.4");
  });
});

describe("bytesForAddress", () => {
  it("reports the two bytes a word occupies", () => {
    expect(bytesForAddress(parseAddress("DB10.DBW20"))).toEqual([20, 21]);
  });
  it("reports the four bytes a dword occupies", () => {
    expect(bytesForAddress(parseAddress("DB10.DBD20"))).toEqual([20, 21, 22, 23]);
  });
  it("reports the single byte a bit lives in", () => {
    expect(bytesForAddress(parseAddress("DB31.DBX60.4"))).toEqual([60]);
  });
});

describe("overlaps", () => {
  it("detects the classic DBW20 / DBW21 overlap", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB10.DBW21"))).toBe(true);
  });
  it("detects the DBW19 / DBW20 overlap", () => {
    expect(overlaps(parseAddress("DB10.DBW19"), parseAddress("DB10.DBW20"))).toBe(true);
  });
  it("reports no overlap for adjacent non-overlapping words", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB10.DBW22"))).toBe(false);
  });
  it("reports no overlap across different DBs", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB11.DBW20"))).toBe(false);
  });
  it("detects a dword swallowing a word", () => {
    expect(overlaps(parseAddress("DB10.DBD20"), parseAddress("DB10.DBW22"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `assembleBE is not a function` (and similar) for the six new exports.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/s7.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/s7.js src/lib/s7.test.js
git commit -m "feat: add big-endian assembly, address parsing and overlap detection

assembleBE/splitBE handle Siemens byte order MSB-first, using
multiplication rather than shifts so a full DWORD does not coerce to a
negative signed 32-bit int.

parseAddress covers DBX/DBB/DBW/DBD and rejects the malformed cases
(bit > 7, DBX without a bit, a bit number on a word).

overlaps surfaces the DBW20/DBW21 trap: consecutive word addresses share
a byte, which is a real and easily-missed bug source."
```

---

## Task 3: BCD and IEEE-754 REAL

**Files:**
- Modify: `src/lib/s7.js`
- Test: `src/lib/s7.test.js`

**Interfaces:**
- Consumes: `toUnsigned` (Task 1).
- Produces: `bcdToDec(value) → number | {error}`, `decToBcd(n) → number | {error}`, `bitsToReal(u32) → number`, `realToBits(f) → number`, `explainReal(u32) → {sign, exponent, mantissa, value, special}`. `special` is `null` for ordinary numbers, else one of `"+Infinity" | "-Infinity" | "NaN" | "+0" | "-0" | "denormal"`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/s7.test.js`:

```js
import { bcdToDec, decToBcd, bitsToReal, realToBits, explainReal } from "./s7";

describe("bcdToDec", () => {
  it("decodes packed BCD", () => {
    expect(bcdToDec(0x99)).toBe(99);
    expect(bcdToDec(0x1234)).toBe(1234);
  });
  it("decodes zero", () => {
    expect(bcdToDec(0)).toBe(0);
  });
  it("rejects a nibble above 9", () => {
    expect(isErr(bcdToDec(0x9a))).toBe(true);
  });
  it("rejects a negative value", () => {
    expect(isErr(bcdToDec(-1))).toBe(true);
  });
});

describe("decToBcd", () => {
  it("encodes packed BCD", () => {
    expect(decToBcd(99)).toBe(0x99);
    expect(decToBcd(1234)).toBe(0x1234);
  });
  it("encodes zero", () => {
    expect(decToBcd(0)).toBe(0);
  });
  it("round-trips with bcdToDec", () => {
    expect(bcdToDec(decToBcd(4095))).toBe(4095);
  });
  it("rejects a negative number", () => {
    expect(isErr(decToBcd(-1))).toBe(true);
  });
});

describe("bitsToReal / realToBits", () => {
  it("decodes 1.0", () => {
    expect(bitsToReal(0x3f800000)).toBe(1.0);
  });
  it("decodes -2.0", () => {
    expect(bitsToReal(0xc0000000)).toBe(-2.0);
  });
  it("encodes 1.0", () => {
    expect(realToBits(1.0)).toBe(0x3f800000);
  });
  it("round-trips a representable value", () => {
    expect(bitsToReal(realToBits(0.5))).toBe(0.5);
  });
});

describe("explainReal", () => {
  it("breaks down 1.0", () => {
    const r = explainReal(0x3f800000);
    expect(r.sign).toBe(0);
    expect(r.exponent).toBe(127);
    expect(r.mantissa).toBe(0);
    expect(r.value).toBe(1.0);
    expect(r.special).toBe(null);
  });
  it("identifies positive zero", () => {
    expect(explainReal(0x00000000).special).toBe("+0");
  });
  it("identifies negative zero", () => {
    expect(explainReal(0x80000000).special).toBe("-0");
  });
  it("identifies positive infinity", () => {
    expect(explainReal(0x7f800000).special).toBe("+Infinity");
  });
  it("identifies negative infinity", () => {
    expect(explainReal(0xff800000).special).toBe("-Infinity");
  });
  it("identifies NaN", () => {
    expect(explainReal(0xffc00000).special).toBe("NaN");
  });
  it("identifies a denormal", () => {
    expect(explainReal(0x00000001).special).toBe("denormal");
  });
  it("reports the sign bit of a negative number", () => {
    expect(explainReal(0xc0000000).sign).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `bcdToDec is not a function` (and similar).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/s7.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/s7.js src/lib/s7.test.js
git commit -m "feat: add BCD and IEEE-754 REAL conversion

bcdToDec refuses any nibble above 9 rather than returning a plausible
wrong decimal — an invalid BCD byte is a real condition worth naming.

explainReal breaks a REAL into sign/exponent/mantissa and identifies the
special encodings (NaN, +/-Inf, +/-0, denormal) instead of quietly
rendering them as numbers."
```

---

## Task 4: P# area pointers and ANY pointers

**Files:**
- Modify: `src/lib/s7.js`
- Test: `src/lib/s7.test.js`

**Interfaces:**
- Consumes: `toUnsigned` (Task 1).
- Produces: `AREA_IDS` (object), `ANY_TYPE_CODES` (object), `parsePointer(str) → {area, db, byte, bit, type, count} | {error}`, `formatPointer(p) → string`, `encodeAreaPointer(p) → number | {error}`, `decodeAreaPointer(u32) → {area, areaId, byte, bit}`, `encodeAnyPointer(p) → number[] | {error}`, `decodeAnyPointer(bytes) → {type, count, db, area, byte, bit} | {error}`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/s7.test.js`:

```js
import {
  AREA_IDS, ANY_TYPE_CODES, parsePointer, formatPointer,
  encodeAreaPointer, decodeAreaPointer, encodeAnyPointer, decodeAnyPointer,
} from "./s7";

describe("parsePointer", () => {
  it("parses a standard P# pointer", () => {
    expect(parsePointer("P#DB10.DBX20.0 BYTE 4")).toEqual({
      area: "DB", db: 10, byte: 20, bit: 0, type: "BYTE", count: 4,
    });
  });
  it("parses a bit pointer", () => {
    expect(parsePointer("P#DB31.DBX60.4 BOOL 1")).toEqual({
      area: "DB", db: 31, byte: 60, bit: 4, type: "BOOL", count: 1,
    });
  });
  it("is case and whitespace insensitive", () => {
    expect(parsePointer("  p#db10.dbx20.0   byte 4  ").db).toBe(10);
  });
  it("rejects a bit number above 7", () => {
    expect(isErr(parsePointer("P#DB10.DBX20.8 BYTE 4"))).toBe(true);
  });
  it("rejects an unknown data type", () => {
    expect(isErr(parsePointer("P#DB10.DBX20.0 WIDGET 4"))).toBe(true);
  });
  it("rejects gibberish", () => {
    expect(isErr(parsePointer("hello"))).toBe(true);
  });
});

describe("formatPointer", () => {
  it("round-trips", () => {
    expect(formatPointer(parsePointer("P#DB10.DBX20.0 BYTE 4"))).toBe("P#DB10.DBX20.0 BYTE 4");
  });
});

describe("encodeAreaPointer", () => {
  it("packs area, byte offset and bit into 32 bits", () => {
    // area DB (16#84) in bits 24-31, byte 20 in bits 3-18, bit 0 in bits 0-2
    // 20 * 8 = 160 = 16#A0
    expect(encodeAreaPointer({ area: "DB", byte: 20, bit: 0 })).toBe(0x840000a0);
  });
  it("packs a non-zero bit number", () => {
    expect(encodeAreaPointer({ area: "DB", byte: 60, bit: 4 })).toBe(0x840001e4);
  });
  it("packs the M area", () => {
    expect(encodeAreaPointer({ area: "M", byte: 0, bit: 0 })).toBe(0x83000000);
  });
  it("rejects an unknown area", () => {
    expect(isErr(encodeAreaPointer({ area: "ZZ", byte: 0, bit: 0 }))).toBe(true);
  });
});

describe("decodeAreaPointer", () => {
  it("unpacks an area pointer", () => {
    expect(decodeAreaPointer(0x840000a0)).toEqual({
      area: "DB", areaId: 0x84, byte: 20, bit: 0,
    });
  });
  it("round-trips with encodeAreaPointer", () => {
    const p = { area: "DB", byte: 60, bit: 4 };
    const d = decodeAreaPointer(encodeAreaPointer(p));
    expect({ area: d.area, byte: d.byte, bit: d.bit }).toEqual(p);
  });
});

describe("encodeAnyPointer", () => {
  it("builds the 10-byte ANY descriptor", () => {
    expect(encodeAnyPointer({ area: "DB", db: 10, byte: 20, bit: 0, type: "BYTE", count: 4 }))
      .toEqual([0x10, 0x02, 0x00, 0x04, 0x00, 0x0a, 0x84, 0x00, 0x00, 0xa0]);
  });
  it("rejects an unknown type", () => {
    expect(isErr(encodeAnyPointer({ area: "DB", db: 1, byte: 0, bit: 0, type: "WIDGET", count: 1 }))).toBe(true);
  });
});

describe("decodeAnyPointer", () => {
  it("unpacks the 10-byte ANY descriptor", () => {
    expect(decodeAnyPointer([0x10, 0x02, 0x00, 0x04, 0x00, 0x0a, 0x84, 0x00, 0x00, 0xa0]))
      .toEqual({ type: "BYTE", count: 4, db: 10, area: "DB", byte: 20, bit: 0 });
  });
  it("rejects a wrong length", () => {
    expect(isErr(decodeAnyPointer([0x10, 0x02]))).toBe(true);
  });
  it("rejects a missing ANY id byte", () => {
    expect(isErr(decodeAnyPointer([0x11, 0x02, 0, 4, 0, 10, 0x84, 0, 0, 0xa0]))).toBe(true);
  });
  it("round-trips with encodeAnyPointer", () => {
    const p = { area: "DB", db: 31, byte: 60, bit: 4, type: "WORD", count: 2 };
    expect(decodeAnyPointer(encodeAnyPointer(p))).toEqual(p);
  });
});

describe("area and type tables", () => {
  it("uses the documented area ids", () => {
    expect(AREA_IDS.DB).toBe(0x84);
    expect(AREA_IDS.I).toBe(0x81);
    expect(AREA_IDS.Q).toBe(0x82);
    expect(AREA_IDS.M).toBe(0x83);
  });
  it("uses the documented ANY type codes", () => {
    expect(ANY_TYPE_CODES.BOOL).toBe(0x01);
    expect(ANY_TYPE_CODES.BYTE).toBe(0x02);
    expect(ANY_TYPE_CODES.REAL).toBe(0x08);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `parsePointer is not a function` (and similar).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/s7.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/s7.js src/lib/s7.test.js
git commit -m "feat: add P# area pointer and ANY pointer encode/decode

Packs and unpacks the 32-bit area pointer (bit in bits 0-2, byte offset
in bits 3-18, area id in bits 24-31) and the 10-byte ANY descriptor, both
verified by round-trip tests."
```

---

## Task 5: S5TIME, TIME, and the interpret() rollup

**Files:**
- Modify: `src/lib/s7.js`
- Test: `src/lib/s7.test.js`

**Interfaces:**
- Consumes: `toUnsigned`, `formatHex`, `splitBE`, `toSigned`, `bcdToDec`, `decToBcd`, `bitsToReal`, `explainReal` (Tasks 1–3).
- Produces: `S5_BASES` (array), `s5TimeFromBits(u16) → {base, baseMs, value, ms, bits} | {error}`, `parseS5Time(str) → {base, baseMs, value, ms, bits} | {error}`, `parseTime(str) → number | {error}`, `formatTime(ms) → string | {error}`, `interpret(value, widthBytes) → object`.

**Note on the S5TIME encoding:** STEP7 selects the **smallest** time base that can represent the value, for best resolution. `S5T#2S` is therefore base **10ms**, value **200**, encoding to `16#0200` — *not* base 1s / value 2. An earlier draft of the spec had this wrong; the spec has been corrected to match.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/s7.test.js`:

```js
import { S5_BASES, s5TimeFromBits, parseS5Time, parseTime, formatTime, interpret } from "./s7";

describe("parseS5Time", () => {
  it("encodes S5T#2s using the smallest base that fits", () => {
    // STEP7 picks best resolution: 2000ms / 10ms = 200, so base 10ms, BCD 16#200
    expect(parseS5Time("S5T#2s")).toEqual({
      base: "10ms", baseMs: 10, value: 200, ms: 2000, bits: 0x0200,
    });
  });
  it("encodes a value that needs the 100ms base", () => {
    // 20000ms / 10ms = 2000 (too big for 3 BCD digits), so 100ms base, value 200
    expect(parseS5Time("S5T#20s")).toEqual({
      base: "100ms", baseMs: 100, value: 200, ms: 20000, bits: 0x1200,
    });
  });
  it("encodes the smallest representable time", () => {
    expect(parseS5Time("S5T#10ms").bits).toBe(0x0001);
  });
  it("parses compound notation", () => {
    expect(parseS5Time("S5T#1m30s").ms).toBe(90000);
  });
  it("is case and whitespace insensitive", () => {
    expect(parseS5Time("  s5t#2S ").ms).toBe(2000);
  });
  it("rejects a duration beyond S5TIME range", () => {
    expect(isErr(parseS5Time("S5T#10000s"))).toBe(true);
  });
  it("rejects gibberish", () => {
    expect(isErr(parseS5Time("hello"))).toBe(true);
  });
  it("rejects an empty duration", () => {
    expect(isErr(parseS5Time("S5T#"))).toBe(true);
  });
});

describe("s5TimeFromBits", () => {
  it("decodes 16#0200 back to 2s", () => {
    expect(s5TimeFromBits(0x0200)).toEqual({
      base: "10ms", baseMs: 10, value: 200, ms: 2000, bits: 0x0200,
    });
  });
  it("round-trips with parseS5Time", () => {
    expect(s5TimeFromBits(parseS5Time("S5T#1m30s").bits).ms).toBe(90000);
  });
  it("rejects an invalid BCD payload", () => {
    expect(isErr(s5TimeFromBits(0x0abc))).toBe(true);
  });
});

describe("parseTime / formatTime", () => {
  it("parses full compound TIME notation", () => {
    expect(parseTime("T#1d2h3m4s5ms")).toBe(93784005);
  });
  it("parses a bare millisecond value", () => {
    expect(parseTime("T#5ms")).toBe(5);
  });
  it("parses seconds", () => {
    expect(parseTime("T#2s")).toBe(2000);
  });
  it("rejects gibberish", () => {
    expect(isErr(parseTime("hello"))).toBe(true);
  });
  it("formats compound TIME", () => {
    expect(formatTime(93784005)).toBe("T#1d2h3m4s5ms");
  });
  it("formats zero", () => {
    expect(formatTime(0)).toBe("T#0ms");
  });
  it("omits zero components", () => {
    expect(formatTime(2000)).toBe("T#2s");
  });
  it("round-trips", () => {
    expect(formatTime(parseTime("T#1d2h3m4s5ms"))).toBe("T#1d2h3m4s5ms");
  });
  it("rejects a negative duration", () => {
    expect(isErr(formatTime(-1))).toBe(true);
  });
});

describe("interpret", () => {
  it("reads a WORD both ways", () => {
    const r = interpret(0xffff, 2);
    expect(r.hex).toBe("16#FFFF");
    expect(r.unsigned).toBe(65535);
    expect(r.signed).toBe(-1);
    expect(r.binary).toBe("1111111111111111");
    expect(r.bytes).toEqual([0xff, 0xff]);
  });
  it("labels the WORD types", () => {
    expect(interpret(0, 2).type).toBe("WORD / INT");
  });
  it("adds REAL for a DWORD", () => {
    const r = interpret(0x3f800000, 4);
    expect(r.real).toBe(1.0);
    expect(r.realExplain.exponent).toBe(127);
    expect(r.type).toBe("DWORD / DINT / REAL");
  });
  it("omits REAL for a WORD", () => {
    expect(interpret(0, 2).real).toBeUndefined();
  });
  it("surfaces a BCD error rather than a wrong number", () => {
    expect(isErr(interpret(0x9a, 1).bcd)).toBe(true);
  });
  it("reports valid BCD", () => {
    expect(interpret(0x99, 1).bcd).toBe(99);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `parseS5Time is not a function` (and similar).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/s7.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green. This completes `s7.js`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/s7.js src/lib/s7.test.js
git commit -m "feat: add S5TIME, TIME and the interpret() rollup

S5TIME follows STEP7 in picking the smallest time base that fits, so
S5T#2S encodes as base 10ms / value 200 / 16#0200 rather than base 1s.
An earlier spec draft had this backwards; the spec is corrected to match.

interpret() returns every reading of the same bits at once, which is what
the Number and Address tabs render side by side. Its bcd field can be a
structured error, because invalid BCD is a real condition rather than a
number worth guessing at."
```

---

## Task 6: Signal dataset and lookup

**Files:**
- Create: `src/lib/s7Signals.js`
- Test: `src/lib/s7Signals.test.js`

**Interfaces:**
- Consumes: nothing (pure data module).
- Produces: `CONTROLS` (array of `{id, label}`), `SIGNALS` (array of entries), `lookupSignal({control, db, byte, bit}) → match[]`, `searchSignals({control, query}) → match[]`. A `match` is a signal entry plus `{ resolvedLabel: string|null, address: string }`.

**On the 828D dataset:** per the spec's accuracy policy, 828D ships with **no seeded entries**. Its interface map cannot be stated with high confidence from memory, and a guessed 828D signal name is exactly the failure this tool exists to prevent. The control is fully wired and tested — including the honest-miss path — so populating it later is a data edit with no code change. Task 10 renders an explicit note for this case.

- [ ] **Step 1: Write the failing test**

Create `src/lib/s7Signals.test.js`:

```js
import { describe, it, expect } from "vitest";
import { CONTROLS, SIGNALS, lookupSignal, searchSignals } from "./s7Signals";

describe("CONTROLS", () => {
  it("offers the three controls the spec calls for", () => {
    expect(CONTROLS.map((c) => c.id).sort()).toEqual(["828D", "840Dpl", "840Dsl"]);
  });
});

describe("SIGNALS integrity", () => {
  it("gives every entry a source, per the accuracy policy", () => {
    for (const s of SIGNALS) {
      expect(s.source, `signal ${s.id} is missing a source`).toBeTruthy();
    }
  });
  it("gives every entry a unique id", () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length);
  });
  it("only uses known control ids", () => {
    const known = CONTROLS.map((c) => c.id);
    for (const s of SIGNALS) {
      for (const c of s.controls) expect(known).toContain(c);
    }
  });
});

describe("lookupSignal", () => {
  it("resolves a per-axis signal and names the axis", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 31, byte: 60, bit: 4 });
    expect(hits.length).toBe(1);
    expect(hits[0].name).toMatch(/exact stop fine/i);
    expect(hits[0].resolvedLabel).toBe("Axis 1");
  });
  it("resolves the axis number from the DB offset", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 34, byte: 60, bit: 4 });
    expect(hits[0].resolvedLabel).toBe("Axis 4");
    expect(hits[0].address).toBe("DB34.DBX60.4");
  });
  it("resolves a per-channel signal", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 22, byte: 7, bit: 1 });
    expect(hits[0].resolvedLabel).toBe("Channel 2");
    expect(hits[0].name).toMatch(/NC.?start/i);
  });
  it("finds powerline signals too", () => {
    expect(lookupSignal({ control: "840Dpl", db: 31, byte: 60, bit: 4 }).length).toBe(1);
  });
  it("returns an honest miss for an unknown address rather than inventing a name", () => {
    expect(lookupSignal({ control: "840Dsl", db: 31, byte: 200, bit: 0 })).toEqual([]);
  });
  it("returns an honest miss for 828D, which has no seeded data", () => {
    expect(lookupSignal({ control: "828D", db: 31, byte: 60, bit: 4 })).toEqual([]);
  });
  it("does not match a DB outside the declared range", () => {
    expect(lookupSignal({ control: "840Dsl", db: 62, byte: 60, bit: 4 })).toEqual([]);
  });
});

describe("searchSignals", () => {
  it("finds by name fragment", () => {
    const hits = searchSignals({ control: "840Dsl", query: "exact stop" });
    expect(hits.length).toBeGreaterThan(0);
  });
  it("is case insensitive", () => {
    expect(searchSignals({ control: "840Dsl", query: "EXACT STOP" }).length).toBeGreaterThan(0);
  });
  it("returns empty for no match", () => {
    expect(searchSignals({ control: "840Dsl", query: "zzzznotathing" })).toEqual([]);
  });
  it("returns empty for 828D", () => {
    expect(searchSignals({ control: "828D", query: "exact stop" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./s7Signals"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/s7Signals.js`:

```js
// ═══════════════════════════════════════════════════════════════════════════════
//  s7Signals.js — curated NC/PLC interface signals for SINUMERIK controls.
//
//  Pure data. Imports nothing. Knows nothing about rendering.
//
//  ACCURACY POLICY (see the design spec):
//    - Nothing is guessed. Every entry carries a `source`.
//    - An address with no entry returns an honest miss. The tool never invents
//      a signal name, because a wrong name on a live machine is worse than no
//      name at all.
//    - 828D intentionally has no entries yet: its interface map could not be
//      stated with high confidence. The control is fully wired, so adding
//      entries here is a data edit with no code change.
//
//  RANGE RULE:
//    DB31-61 are per-axis and DB21-30 per-channel, so an entry declares a `db`
//    range plus an `offset`. DB34 with offset 30 resolves to "Axis 4". This
//    avoids storing 31 near-identical copies of each axis signal.
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTROLS = [
    { id: "840Dsl", label: "SINUMERIK 840D sl" },
    { id: "840Dpl", label: "SINUMERIK 840D powerline" },
    { id: "828D", label: "SINUMERIK 828D" },
];

const SL_PL = ["840Dsl", "840Dpl"];
const AXIS_SRC = "840D Lists Manual — axis/spindle-specific signals (DB31-61)";
const CHAN_SRC = "840D Lists Manual — channel-specific signals (DB21-30)";
const BAG_SRC = "840D Lists Manual — mode group signals (DB11)";

const axis = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [31, 61], label: "Axis", offset: 30 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: AXIS_SRC,
});

const channel = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [21, 30], label: "Channel", offset: 20 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: CHAN_SRC,
});

const bag = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [11, 11], label: "Mode group", offset: 10 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: BAG_SRC,
});

export const SIGNALS = [
    // ── Axis / spindle: DB31-61 ───────────────────────────────────────────────
    axis(1, 3, "Axis/spindle disable", "PLC→NCK", "axis-disable"),
    axis(2, 1, "Controller enable (Reglerfreigabe)", "PLC→NCK", "axis-controller-enable"),
    axis(4, 3, "Feed stop / spindle stop", "PLC→NCK", "axis-feed-stop"),
    axis(21, 7, "Pulse enable (Impulsfreigabe)", "PLC→NCK", "axis-pulse-enable"),
    axis(60, 4, "Exact stop fine — position reached", "NCK→PLC", "axis-exact-stop-fine"),
    axis(60, 5, "Exact stop coarse — position reached", "NCK→PLC", "axis-exact-stop-coarse"),
    axis(60, 6, "Referenced / synchronised, measuring system 1", "NCK→PLC", "axis-referenced-1"),
    axis(60, 7, "Referenced / synchronised, measuring system 2", "NCK→PLC", "axis-referenced-2"),
    axis(61, 4, "Drive ready", "NCK→PLC", "axis-drive-ready"),
    axis(61, 5, "Position controller active", "NCK→PLC", "axis-pos-ctrl-active"),
    axis(61, 6, "Speed controller active", "NCK→PLC", "axis-speed-ctrl-active"),
    axis(61, 7, "Current controller active", "NCK→PLC", "axis-current-ctrl-active"),

    // ── Channel: DB21-30 ──────────────────────────────────────────────────────
    channel(7, 1, "NC-Start", "PLC→NCK", "chan-nc-start"),
    channel(7, 3, "NC-Stop", "PLC→NCK", "chan-nc-stop"),
    channel(7, 7, "Reset", "PLC→NCK", "chan-reset"),

    // ── Mode group: DB11 ──────────────────────────────────────────────────────
    bag(0, 0, "JOG mode selected", "PLC→NCK", "bag-jog-select"),
    bag(0, 1, "MDA mode selected", "PLC→NCK", "bag-mda-select"),
    bag(0, 2, "AUTO mode selected", "PLC→NCK", "bag-auto-select"),
    bag(6, 0, "JOG mode active", "NCK→PLC", "bag-jog-active"),
    bag(6, 1, "MDA mode active", "NCK→PLC", "bag-mda-active"),
    bag(6, 2, "AUTO mode active", "NCK→PLC", "bag-auto-active"),

    // ── 828D ──────────────────────────────────────────────────────────────────
    // Intentionally empty. See the accuracy policy above.
];

/** Resolve "Axis 4" / "Channel 2" from a signal's range rule and the actual DB. */
function resolveLabel(entry, db) {
    const [lo, hi] = entry.area.db;
    if (lo === hi) return entry.area.label; // single-DB areas need no number
    return `${entry.area.label} ${db - entry.area.offset}`;
}

function addressOf(entry, db) {
    return `DB${db}.${entry.type}${entry.byte}.${entry.bit}`;
}

function decorate(entry, db) {
    return { ...entry, resolvedLabel: resolveLabel(entry, db), address: addressOf(entry, db) };
}

/**
 * Find signals matching an exact address on a control.
 * Returns [] for anything not in the dataset — never a guessed name.
 */
export function lookupSignal({ control, db, byte, bit }) {
    return SIGNALS.filter((s) => {
        if (!s.controls.includes(control)) return false;
        const [lo, hi] = s.area.db;
        return db >= lo && db <= hi && s.byte === byte && s.bit === bit;
    }).map((s) => decorate(s, db));
}

/** Free-text search over signal names for a control. */
export function searchSignals({ control, query }) {
    const q = String(query || "").trim().toLowerCase();
    if (q === "") return [];
    return SIGNALS.filter(
        (s) => s.controls.includes(control) && s.name.toLowerCase().includes(q)
    ).map((s) => decorate(s, s.area.db[0]));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/s7Signals.js src/lib/s7Signals.test.js
git commit -m "feat: add curated NC/PLC interface signal dataset and lookup

Seeds the high-confidence 840D sl/powerline core: axis/spindle (DB31-61),
channel (DB21-30) and mode group (DB11). A range-plus-offset rule resolves
DB34 to 'Axis 4' rather than storing 31 copies of each axis signal.

828D ships with no entries by design. Its interface map could not be
stated with high confidence, and per the accuracy policy a guessed signal
name is worse than an honest miss. The control is fully wired and tested,
so populating it later is a data edit with no code change."
```

---

## Task 7: Shell, Number tab, registry and route — first visible slice

This is the first task with anything to look at in a browser. It folds in the registry entry and route because a reviewer cannot sensibly approve a shell that is unreachable.

**Files:**
- Create: `src/components/s7/Shared.jsx`
- Create: `src/components/s7/NumberTab.jsx`
- Create: `src/components/S7Converter.jsx`
- Modify: `src/lib/knowledgeTools.jsx`
- Modify: `src/components/Layout.jsx`

**Interfaces:**
- Consumes: `isErr`, `parseNumber`, `interpret`, `formatHex`, `splitBE` from `src/lib/s7.js` (Tasks 1–5).
- Produces: `ErrorBox({msg})`, `Row({label, value, mono, hint})`, `TabButton({active, onClick, children})` from `Shared.jsx`; `NumberTab({value, widthBytes, onValueChange, onWidthChange})` from `NumberTab.jsx`; default-exported `S7Converter` component.

- [ ] **Step 1: Create the shared UI helpers**

Create `src/components/s7/Shared.jsx`:

```jsx
import React from "react";
import { AlertTriangle } from "lucide-react";

// Mirrors the ErrorBox pattern already used in AlarmCalculator.jsx.
export const ErrorBox = ({ msg }) => (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mt-4">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{msg}</span>
    </div>
);

export const Row = ({ label, value, mono = true, hint }) => (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border/60 last:border-0">
        <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
        <span className={`text-sm text-right ${mono ? "font-mono" : ""} tabular-nums break-all`}>
            {value}
            {hint && <span className="ml-2 text-xs text-muted-foreground font-sans">{hint}</span>}
        </span>
    </div>
);

export const TabButton = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
    >
        {children}
    </button>
);
```

- [ ] **Step 2: Create the Number tab**

Create `src/components/s7/NumberTab.jsx`:

```jsx
import React, { useState } from "react";
import { Input } from "../ui/input";
import { interpret, splitBE } from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const WIDTHS = [
    { bytes: 1, label: "BYTE (8)" },
    { bytes: 2, label: "WORD (16)" },
    { bytes: 4, label: "DWORD (32)" },
];

// Siemens numbers bit 7 as the MSB within each byte.
const BitGrid = ({ value, widthBytes, onToggle }) => {
    const bytes = splitBE(value, widthBytes);
    return (
        <div className="flex flex-wrap gap-3 mt-4">
            {bytes.map((b, byteIdx) => (
                <div key={byteIdx} className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 text-center">
                        Byte {byteIdx} {byteIdx === 0 && widthBytes > 1 ? "(MSB)" : ""}
                    </div>
                    <div className="flex gap-1">
                        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => {
                            const on = (b >> bit) % 2 === 1;
                            const absBit = (widthBytes - 1 - byteIdx) * 8 + bit;
                            return (
                                <button
                                    key={bit}
                                    type="button"
                                    onClick={() => onToggle(absBit)}
                                    title={`Bit ${bit} of byte ${byteIdx}`}
                                    className={`w-7 h-9 rounded text-xs font-mono border transition-colors ${
                                        on
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted/40 text-muted-foreground border-border hover:bg-accent"
                                    }`}
                                >
                                    {on ? 1 : 0}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex gap-1 mt-1">
                        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
                            <div key={bit} className="w-7 text-[10px] text-center text-muted-foreground font-mono">
                                {bit}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const NumberTab = ({ value, widthBytes, raw, onRawChange, onValueChange, onWidthChange, error }) => {
    const r = interpret(value, widthBytes);

    const toggleBit = (absBit) => onValueChange(value ^ (2 ** absBit));

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Value</label>
                    <Input
                        value={raw}
                        onChange={(e) => onRawChange(e.target.value)}
                        placeholder="16#FF, 0xFF, FFh, 2#1010 or 255"
                        className="font-mono mt-1"
                    />
                </div>
                <div className="flex gap-1">
                    {WIDTHS.map((w) => (
                        <button
                            key={w.bytes}
                            type="button"
                            onClick={() => onWidthChange(w.bytes)}
                            className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                                widthBytes === w.bytes
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:bg-accent"
                            }`}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <ErrorBox msg={error} />}

            <div className="mt-5 rounded-lg border border-border p-4">
                <Row label="Hex" value={r.hex} />
                <Row label="Decimal (unsigned)" value={r.unsigned.toLocaleString("en-US")} hint={widthBytes === 2 ? "WORD" : widthBytes === 1 ? "BYTE" : "DWORD"} />
                <Row label="Decimal (signed)" value={r.signed.toLocaleString("en-US")} hint={widthBytes === 2 ? "INT" : widthBytes === 1 ? "SINT" : "DINT"} />
                <Row label="Binary" value={r.binary.replace(/(.{8})/g, "$1 ").trim()} />
                <Row label="BCD" value={typeof r.bcd === "object" ? <span className="text-destructive">{r.bcd.error}</span> : r.bcd.toLocaleString("en-US")} />
                <Row label="Bytes (big-endian)" value={r.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")} />
            </div>

            <BitGrid value={value} widthBytes={widthBytes} onToggle={toggleBit} />
            <p className="text-xs text-muted-foreground mt-2">
                Click a bit to toggle it. Bit 7 is the MSB of each byte, per Siemens numbering.
            </p>
        </div>
    );
};

export default NumberTab;
```

- [ ] **Step 3: Create the shell**

Create `src/components/S7Converter.jsx`:

```jsx
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Binary } from "lucide-react";
import { isErr, parseNumber } from "../lib/s7";
import { TabButton } from "./s7/Shared";
import NumberTab from "./s7/NumberTab";

const TABS = [{ id: "number", label: "Number" }];

const S7Converter = () => {
    const [tab, setTab] = useState("number");
    const [raw, setRaw] = useState("16#FF");
    const [value, setValue] = useState(255);
    const [widthBytes, setWidthBytes] = useState(2);
    const [error, setError] = useState("");

    // Typing drives the shared value. A partial entry is a neutral state, not an error.
    const onRawChange = (next) => {
        setRaw(next);
        if (next.trim() === "") {
            setError("");
            return;
        }
        const parsed = parseNumber(next);
        if (isErr(parsed)) {
            setError(parsed.error);
        } else {
            setError("");
            setValue(parsed.value);
        }
    };

    // Bit-grid clicks write back to the raw field so the two never disagree.
    const onValueChange = (next) => {
        setValue(next);
        setRaw("16#" + next.toString(16).toUpperCase());
        setError("");
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Binary className="h-6 w-6 text-primary" />
                    Siemens PLC Data & Address Converter
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Numbers, DB addresses, pointers and interface signals for SINUMERIK PLCs.
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap gap-1">
                        {TABS.map((t) => (
                            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                                {t.label}
                            </TabButton>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    {tab === "number" && (
                        <NumberTab
                            value={value}
                            widthBytes={widthBytes}
                            raw={raw}
                            error={error}
                            onRawChange={onRawChange}
                            onValueChange={onValueChange}
                            onWidthChange={setWidthBytes}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default S7Converter;
```

- [ ] **Step 4: Register the tool**

In `src/lib/knowledgeTools.jsx`, change the import line to add `Binary`:

```js
import { BookOpenText, Crosshair, Repeat, Zap, Binary } from "lucide-react";
```

Then append this entry to the `knowledgeTools` array, after the `dc-motor-drive` entry:

```js
    {
        id: "s7-converter",
        title: "Siemens PLC Data & Address Converter",
        description:
            "Hex/dec/binary with signed and BCD, DB word/byte/bit decoding with big-endian byte maps and overlap warnings, P#/ANY pointers, REAL and S5TIME, plus NC/PLC interface signal lookup for 840D sl, 840D powerline and 828D.",
        icon: Binary,
        path: "/knowledge/s7-converter",
    },
```

- [ ] **Step 5: Add the route**

In `src/components/Layout.jsx`, add this import after the `DCMotorDrive` import:

```js
import S7Converter from "./S7Converter";
```

Then add this route after the `dc-motor-drive` route:

```jsx
                <Route path='/knowledge/s7-converter' element={<S7Converter />} />
```

- [ ] **Step 6: Verify the tests still pass and the app builds**

Run: `npm test`
Expected: PASS — the library tests are unaffected.

Run: `npm run build`
Expected: build succeeds with no unresolved imports.

- [ ] **Step 7: Commit**

```bash
git add src/components/S7Converter.jsx src/components/s7/Shared.jsx src/components/s7/NumberTab.jsx src/lib/knowledgeTools.jsx src/components/Layout.jsx
git commit -m "feat: add S7 converter shell and number tab

First visible slice: the card is registered, routed, and converts between
hex/dec/binary/BCD with signed and unsigned readings side by side and a
clickable bit grid using Siemens bit numbering.

The shell owns the shared value and width so later tabs inherit whatever
number is on screen."
```

---

## Task 8: Address tab

**Files:**
- Create: `src/components/s7/AddressTab.jsx`
- Modify: `src/components/S7Converter.jsx`

**Interfaces:**
- Consumes: `isErr`, `parseAddress`, `formatAddress`, `bytesForAddress`, `overlaps`, `interpret`, `splitBE` from `src/lib/s7.js`; `ErrorBox`, `Row` from `./Shared`.
- Produces: default-exported `AddressTab({ value, onWidthChange })`.

- [ ] **Step 1: Create the Address tab**

Create `src/components/s7/AddressTab.jsx`:

```jsx
import React, { useState } from "react";
import { Input } from "../ui/input";
import {
    isErr, parseAddress, formatAddress, bytesForAddress, overlaps, interpret, splitBE,
} from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

// Every word address that shares a byte with `addr`, i.e. the DBW20/DBW21 trap.
const overlappingWords = (addr) => {
    const out = [];
    for (let b = Math.max(0, addr.byte - 3); b <= addr.byte + addr.widthBytes; b++) {
        const other = parseAddress(`DB${addr.db}.DBW${b}`);
        if (isErr(other)) continue;
        if (b === addr.byte && addr.type === "WORD") continue; // itself
        if (overlaps(addr, other)) out.push(formatAddress(other));
    }
    return out;
};

const ByteMap = ({ addr, bytes }) => (
    <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
        {bytesForAddress(addr).map((offset, i) => (
            <div key={offset} className="rounded-md border border-border p-2 min-w-[104px]">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                    DBB{offset}
                </div>
                <div className="text-lg font-mono text-center py-1">
                    {bytes[i].toString(16).toUpperCase().padStart(2, "0")}
                </div>
                <div className="text-[10px] text-center text-muted-foreground">
                    {addr.widthBytes === 1
                        ? "only byte"
                        : i === 0
                        ? "high byte (MSB)"
                        : i === addr.widthBytes - 1
                        ? "low byte (LSB)"
                        : `byte ${i}`}
                </div>
            </div>
        ))}
    </div>
);

const AddressTab = ({ value }) => {
    const [rawAddr, setRawAddr] = useState("DB10.DBW20");
    const addr = parseAddress(rawAddr);
    const addrErr = isErr(addr) ? addr.error : null;

    return (
        <div>
            <div className="max-w-sm">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Address</label>
                <Input
                    value={rawAddr}
                    onChange={(e) => setRawAddr(e.target.value)}
                    placeholder="DB10.DBW20 or DB31.DBX60.4"
                    className="font-mono mt-1"
                />
            </div>

            {addrErr && <ErrorBox msg={addrErr} />}

            {!addrErr && (
                <>
                    <div className="mt-5 rounded-lg border border-border p-4">
                        <Row label="Data block" value={`DB${addr.db}`} />
                        <Row label="Type" value={addr.type} />
                        <Row label="Start byte" value={addr.byte} />
                        <Row label="Width" value={`${addr.widthBytes} byte${addr.widthBytes > 1 ? "s" : ""}`} />
                        <Row label="Occupies" value={bytesForAddress(addr).map((b) => `DBB${b}`).join(", ")} />
                        {addr.type === "BOOL" && (
                            <Row
                                label="Bit"
                                value={`${addr.bit}`}
                                hint={`absolute bit offset ${addr.byte * 8 + addr.bit}`}
                            />
                        )}
                    </div>

                    <ByteMap addr={addr} bytes={splitBE(value, addr.widthBytes)} />
                    <p className="text-xs text-muted-foreground mt-2">
                        Siemens is big-endian: the lowest byte offset holds the most significant byte.
                    </p>

                    {addr.type !== "BOOL" && overlappingWords(addr).length > 0 && (
                        <div className="mt-5 rounded-lg border border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                            <div className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                                Overlaps {overlappingWords(addr).join(", ")}
                            </div>
                            <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
                                Consecutive word addresses share a byte. Writing one changes the other —
                                a common and easily-missed source of bugs.
                            </p>
                        </div>
                    )}

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            Same bits, read as
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            {(() => {
                                const r = interpret(value, addr.widthBytes);
                                return (
                                    <>
                                        <Row label="Hex" value={r.hex} />
                                        <Row label="Unsigned" value={r.unsigned.toLocaleString("en-US")} />
                                        <Row label="Signed" value={r.signed.toLocaleString("en-US")} />
                                        {r.real !== undefined && (
                                            <Row label="REAL" value={String(r.real)} />
                                        )}
                                        <Row
                                            label="Bytes"
                                            value={r.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}
                                        />
                                    </>
                                );
                            })()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Value comes from the Number tab. Change it there to see it here.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

export default AddressTab;
```

- [ ] **Step 2: Wire the tab into the shell**

In `src/components/S7Converter.jsx`, add the import:

```js
import AddressTab from "./s7/AddressTab";
```

Change the `TABS` constant to:

```js
const TABS = [
    { id: "number", label: "Number" },
    { id: "address", label: "Address" },
];
```

Add this block inside `<CardContent>`, after the `number` block:

```jsx
                    {tab === "address" && <AddressTab value={value} />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/s7/AddressTab.jsx src/components/S7Converter.jsx
git commit -m "feat: add address tab with byte map and overlap panel

Decodes DBX/DBB/DBW/DBD, shows which bytes an address occupies with the
high byte labelled explicitly, and warns when consecutive word addresses
overlap. Reads the shared value from the shell and renders every
interpretation of the same bits."
```

---

## Task 9: Pointer tab

**Files:**
- Create: `src/components/s7/PointerTab.jsx`
- Modify: `src/components/S7Converter.jsx`

**Interfaces:**
- Consumes: `isErr`, `parsePointer`, `formatPointer`, `encodeAreaPointer`, `encodeAnyPointer`, `AREA_IDS`, `ANY_TYPE_CODES` from `src/lib/s7.js`; `ErrorBox`, `Row` from `./Shared`.
- Produces: default-exported `PointerTab()`.

- [ ] **Step 1: Create the Pointer tab**

Create `src/components/s7/PointerTab.jsx`:

```jsx
import React, { useState } from "react";
import { Input } from "../ui/input";
import {
    isErr, parsePointer, encodeAreaPointer, encodeAnyPointer, AREA_IDS, ANY_TYPE_CODES,
} from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const hex = (n, digits) => "16#" + n.toString(16).toUpperCase().padStart(digits, "0");

const PointerTab = () => {
    const [raw, setRaw] = useState("P#DB10.DBX20.0 BYTE 4");
    const p = parsePointer(raw);
    const err = isErr(p) ? p.error : null;

    const area = err ? null : encodeAreaPointer(p);
    const any = err ? null : encodeAnyPointer(p);
    const areaErr = area !== null && isErr(area) ? area.error : null;
    const anyErr = any !== null && isErr(any) ? any.error : null;

    return (
        <div>
            <div className="max-w-md">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Pointer</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="P#DB10.DBX20.0 BYTE 4"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}
            {areaErr && <ErrorBox msg={areaErr} />}
            {anyErr && <ErrorBox msg={anyErr} />}

            {!err && !areaErr && !anyErr && (
                <>
                    <div className="mt-5 rounded-lg border border-border p-4">
                        <Row label="Area" value={`${p.area} (${hex(AREA_IDS[p.area], 2)})`} />
                        <Row label="Data block" value={`DB${p.db}`} />
                        <Row label="Byte" value={p.byte} />
                        <Row label="Bit" value={p.bit} />
                        <Row label="Type" value={`${p.type} (${hex(ANY_TYPE_CODES[p.type], 2)})`} />
                        <Row label="Count" value={p.count} />
                    </div>

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            32-bit area pointer
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <Row label="Encoded" value={hex(area, 8)} />
                            <Row label="Bits 24-31" value={`${hex(AREA_IDS[p.area], 2)} — area ${p.area}`} />
                            <Row label="Bits 3-18" value={`${p.byte} — byte offset`} />
                            <Row label="Bits 0-2" value={`${p.bit} — bit number`} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            The byte offset is stored shifted left by 3, so byte {p.byte} becomes{" "}
                            {p.byte * 8} with the bit number in the low three bits.
                        </p>
                    </div>

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            10-byte ANY pointer
                        </div>
                        <div className="overflow-x-auto">
                            <div className="flex gap-1 min-w-max">
                                {any.map((b, i) => (
                                    <div key={i} className="rounded border border-border p-2 min-w-[62px] text-center">
                                        <div className="text-[10px] text-muted-foreground">Byte {i}</div>
                                        <div className="font-mono text-sm py-0.5">
                                            {b.toString(16).toUpperCase().padStart(2, "0")}
                                        </div>
                                        <div className="text-[9px] text-muted-foreground leading-tight">
                                            {["ANY id", "type", "count hi", "count lo", "DB hi", "DB lo", "area", "off hi", "off mid", "off lo"][i]}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 rounded-lg border border-border p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            Area identifiers
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
                            {Object.entries(AREA_IDS).map(([k, v]) => (
                                <span key={k}>
                                    {k} = {hex(v, 2)}
                                </span>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PointerTab;
```

- [ ] **Step 2: Wire the tab into the shell**

In `src/components/S7Converter.jsx`, add the import:

```js
import PointerTab from "./s7/PointerTab";
```

Add `{ id: "pointer", label: "Pointer" }` to the `TABS` array, after `address`.

Add this block inside `<CardContent>`, after the `address` block:

```jsx
                    {tab === "pointer" && <PointerTab />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/s7/PointerTab.jsx src/components/S7Converter.jsx
git commit -m "feat: add pointer tab

Parses P# pointers and shows both encodings: the 32-bit area pointer with
its bitfield split out, and the 10-byte ANY descriptor with each byte
labelled, plus the area identifier table."
```

---

## Task 10: Signal tab

**Files:**
- Create: `src/components/s7/SignalTab.jsx`
- Modify: `src/components/S7Converter.jsx`

**Interfaces:**
- Consumes: `isErr`, `parseAddress` from `src/lib/s7.js`; `CONTROLS`, `lookupSignal`, `searchSignals` from `src/lib/s7Signals.js`; `ErrorBox`, `Row` from `./Shared`.
- Produces: default-exported `SignalTab()`.

- [ ] **Step 1: Create the Signal tab**

Create `src/components/s7/SignalTab.jsx`:

```jsx
import React, { useState } from "react";
import { Input } from "../ui/input";
import { isErr, parseAddress } from "../../lib/s7";
import { CONTROLS, lookupSignal, searchSignals } from "../../lib/s7Signals";
import { ErrorBox } from "./Shared";

const Hit = ({ hit }) => (
    <div className="rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <div className="font-medium text-sm">{hit.name}</div>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">{hit.address}</div>
            </div>
            <div className="flex gap-2 shrink-0">
                {hit.resolvedLabel && (
                    <span className="text-xs font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                        {hit.resolvedLabel}
                    </span>
                )}
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {hit.dir}
                </span>
            </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/60">
            Source: {hit.source}
        </div>
    </div>
);

const Miss = ({ control }) => (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm">
        <div className="font-medium">Not in dataset</div>
        <p className="text-muted-foreground text-xs mt-1">
            No verified signal is recorded at this address for {control}. Check the Siemens Lists
            manual. Address decoding on the other tabs still works for any address — only the
            named lookup is limited to entries that could be confirmed.
        </p>
    </div>
);

const Empty828 = () => (
    <div className="rounded-lg border border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 px-4 py-4 text-sm">
        <div className="font-semibold text-orange-700 dark:text-orange-300">
            No signals seeded for 828D yet
        </div>
        <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
            The 828D interface map could not be confirmed to the standard this tool holds itself
            to, so nothing was entered rather than guessing. Address decoding works normally on
            the other tabs. Entries can be added to <code className="font-mono">src/lib/s7Signals.js</code>{" "}
            from the 828D Lists manual with no code change.
        </p>
    </div>
);

const SignalTab = () => {
    const [control, setControl] = useState("840Dsl");
    const [mode, setMode] = useState("address");
    const [rawAddr, setRawAddr] = useState("DB31.DBX60.4");
    const [query, setQuery] = useState("");

    const addr = parseAddress(rawAddr);
    const addrErr = isErr(addr) ? addr.error : null;

    const hits =
        mode === "address"
            ? addrErr
                ? []
                : lookupSignal({ control, db: addr.db, byte: addr.byte, bit: addr.bit ?? 0 })
            : searchSignals({ control, query });

    const searched = mode === "search" && query.trim() !== "";
    const showMiss = mode === "address" ? !addrErr && hits.length === 0 : searched && hits.length === 0;

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Control</label>
                    <div className="flex gap-1 mt-1">
                        {CONTROLS.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setControl(c.id)}
                                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                                    control === c.id
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border text-muted-foreground hover:bg-accent"
                                }`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Find by</label>
                    <div className="flex gap-1 mt-1">
                        {[
                            { id: "address", label: "Address" },
                            { id: "search", label: "Name" },
                        ].map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setMode(m.id)}
                                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                                    mode === m.id
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border text-muted-foreground hover:bg-accent"
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 max-w-sm">
                {mode === "address" ? (
                    <Input
                        value={rawAddr}
                        onChange={(e) => setRawAddr(e.target.value)}
                        placeholder="DB31.DBX60.4"
                        className="font-mono"
                    />
                ) : (
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search signal names, e.g. exact stop"
                    />
                )}
            </div>

            {mode === "address" && addrErr && <ErrorBox msg={addrErr} />}

            <div className="mt-5 space-y-3">
                {hits.map((h) => (
                    <Hit key={h.id} hit={h} />
                ))}
                {showMiss && (control === "828D" ? <Empty828 /> : <Miss control={control} />)}
            </div>
        </div>
    );
};

export default SignalTab;
```

- [ ] **Step 2: Wire the tab into the shell**

In `src/components/S7Converter.jsx`, add the import:

```js
import SignalTab from "./s7/SignalTab";
```

Add `{ id: "signal", label: "Signal" }` to the `TABS` array, after `pointer`.

Add this block inside `<CardContent>`, after the `pointer` block:

```jsx
                    {tab === "signal" && <SignalTab />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/s7/SignalTab.jsx src/components/S7Converter.jsx
git commit -m "feat: add NC/PLC interface signal lookup tab

Looks signals up by address or name per control, resolving DB34 to
'Axis 4' from the range rule and showing direction plus the source of
every entry.

Unknown addresses get an explicit 'not in dataset' state, and 828D gets a
dedicated note explaining that nothing was seeded rather than guessed.
Neither path ever invents a signal name."
```

---

## Task 11: REAL / Time tab

**Files:**
- Create: `src/components/s7/RealTimeTab.jsx`
- Modify: `src/components/S7Converter.jsx`

**Interfaces:**
- Consumes: `isErr`, `parseNumber`, `bitsToReal`, `realToBits`, `explainReal`, `parseS5Time`, `s5TimeFromBits`, `parseTime`, `formatTime` from `src/lib/s7.js`; `ErrorBox`, `Row` from `./Shared`.
- Produces: default-exported `RealTimeTab()`.

- [ ] **Step 1: Create the REAL / Time tab**

Create `src/components/s7/RealTimeTab.jsx`:

```jsx
import React, { useState } from "react";
import { Input } from "../ui/input";
import {
    isErr, parseNumber, realToBits, explainReal, parseS5Time, parseTime, formatTime,
} from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const hex = (n, digits) => "16#" + n.toString(16).toUpperCase().padStart(digits, "0");

const RealSection = () => {
    const [raw, setRaw] = useState("1.0");
    const asFloat = Number(raw);
    const valid = raw.trim() !== "" && Number.isFinite(asFloat);
    const bits = valid ? realToBits(asFloat) : null;
    const info = valid ? explainReal(bits) : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">REAL value</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="1.0"
                    className="font-mono mt-1"
                />
            </div>

            {!valid && raw.trim() !== "" && <ErrorBox msg={`"${raw}" is not a number`} />}

            {valid && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="32-bit pattern" value={hex(bits, 8)} />
                    <Row label="Binary" value={bits.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ").trim()} />
                    <Row label="Sign" value={`${info.sign} (${info.sign ? "negative" : "positive"})`} />
                    <Row label="Exponent" value={`${info.exponent}`} hint={`biased; unbiased ${info.exponent - 127}`} />
                    <Row label="Mantissa" value={hex(info.mantissa, 6)} />
                    <Row
                        label="Special"
                        value={info.special ? <span className="text-orange-600 dark:text-orange-400">{info.special}</span> : "— ordinary number"}
                    />
                </div>
            )}
        </div>
    );
};

const BitsSection = () => {
    const [raw, setRaw] = useState("16#3F800000");
    const parsed = parseNumber(raw);
    const err = isErr(parsed) ? parsed.error : null;
    const info = err ? null : explainReal(parsed.value);

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                    32-bit pattern to REAL
                </label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="16#3F800000"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="REAL value" value={String(info.value)} />
                    <Row
                        label="Special"
                        value={info.special ? <span className="text-orange-600 dark:text-orange-400">{info.special}</span> : "— ordinary number"}
                    />
                </div>
            )}
        </div>
    );
};

const S5Section = () => {
    const [raw, setRaw] = useState("S5T#2s");
    const r = parseS5Time(raw);
    const err = isErr(r) ? r.error : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">S5TIME</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="S5T#2s"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <>
                    <div className="mt-4 rounded-lg border border-border p-4">
                        <Row label="Encoded word" value={hex(r.bits, 4)} />
                        <Row label="Time base" value={r.base} hint={`${r.baseMs} ms per count`} />
                        <Row label="Value (BCD)" value={`${r.value}`} hint={hex(r.bits % 4096, 3)} />
                        <Row label="Duration" value={`${r.ms.toLocaleString("en-US")} ms`} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        STEP7 picks the smallest time base that fits, for best resolution — so
                        S5T#2s is base 10ms with a count of 200, not base 1s with a count of 2.
                    </p>
                </>
            )}
        </div>
    );
};

const TimeSection = () => {
    const [raw, setRaw] = useState("T#1d2h3m4s5ms");
    const ms = parseTime(raw);
    const err = isErr(ms) ? ms.error : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">TIME</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="T#1d2h3m4s5ms"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="Milliseconds (DINT)" value={ms.toLocaleString("en-US")} />
                    <Row label="Hex" value={hex(ms, 8)} />
                    <Row label="Normalised" value={formatTime(ms)} />
                </div>
            )}
        </div>
    );
};

const SECTIONS = [
    { id: "real", label: "REAL → bits", render: () => <RealSection /> },
    { id: "bits", label: "bits → REAL", render: () => <BitsSection /> },
    { id: "s5time", label: "S5TIME", render: () => <S5Section /> },
    { id: "time", label: "TIME", render: () => <TimeSection /> },
];

const RealTimeTab = () => {
    const [section, setSection] = useState("real");
    return (
        <div>
            <div className="flex flex-wrap gap-1">
                {SECTIONS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setSection(s.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                            section === s.id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
            <div className="mt-5">{SECTIONS.find((s) => s.id === section).render()}</div>
        </div>
    );
};

export default RealTimeTab;
```

- [ ] **Step 2: Wire the tab into the shell**

In `src/components/S7Converter.jsx`, add the import:

```js
import RealTimeTab from "./s7/RealTimeTab";
```

Add `{ id: "realtime", label: "REAL / Time" }` to the `TABS` array, after `signal`.

Add this block inside `<CardContent>`, after the `signal` block:

```jsx
                    {tab === "realtime" && <RealTimeTab />}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/s7/RealTimeTab.jsx src/components/S7Converter.jsx
git commit -m "feat: add REAL and time tab

IEEE-754 conversion in both directions with the sign/exponent/mantissa
split and special encodings named, plus S5TIME and TIME encode/decode."
```

---

## Task 12: Browser verification

The library is unit-tested, but nothing has confirmed the card actually renders and behaves. This task closes that gap.

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Start the dev server**

Use the preview tooling with the `dev` configuration from `.claude/launch.json` (do not run `npm start` via a shell). Note the app is behind a JWT login gate in `src/components/Loginsuccess.jsx` — the router only mounts once authenticated, so a login is required before `/knowledge/s7-converter` resolves.

- [ ] **Step 2: Confirm the card appears on the dashboard**

Navigate to `/knowledge`.
Expected: five cards, the new one titled "Siemens PLC Data & Address Converter" with the `Binary` icon.

- [ ] **Step 3: Verify the Number tab**

Navigate to `/knowledge/s7-converter`.
- Type `16#FFFF` with WORD width selected.
- Expected: unsigned `65,535`, signed `-1`, binary `11111111 11111111`, bytes `FF FF`.
- Click any bit in the grid.
- Expected: the value updates and the input rewrites to the new `16#...` literal.

- [ ] **Step 4: Verify the Address tab**

- Enter `DB10.DBW20`.
- Expected: occupies `DBB20, DBB21`; the byte map labels DBB20 "high byte (MSB)".
- Expected: an orange overlap panel naming `DB10.DBW19` and `DB10.DBW21`.
- Enter `DB10.DBX20.8`.
- Expected: an error box reading "Bit number must be 0-7, got 8". No crash.

- [ ] **Step 5: Verify the Pointer tab**

- Confirm the default `P#DB10.DBX20.0 BYTE 4` shows the area pointer as `16#840000A0`.
- Expected: the ANY byte strip reads `10 02 00 04 00 0A 84 00 00 A0`.

- [ ] **Step 6: Verify the Signal tab**

- With 840D sl selected, enter `DB34.DBX60.4`.
- Expected: "Exact stop fine — position reached", badge "Axis 4", direction "NCK→PLC", and a source line.
- Enter `DB34.DBX200.0`.
- Expected: the "Not in dataset" state, not an invented name.
- Switch the control to 828D.
- Expected: the orange "No signals seeded for 828D yet" note.

- [ ] **Step 7: Verify the REAL / Time tab**

- REAL → bits with `1.0`. Expected: `16#3F800000`, exponent 127, special "— ordinary number".
- S5TIME with `S5T#2s`. Expected: encoded word `16#0200`, base `10ms`, value `200`.

- [ ] **Step 8: Check for console errors and both themes**

- Read the browser console. Expected: no errors from the new card.
- Toggle dark mode via the navbar control and re-check the Address tab overlap panel and the Signal tab 828D note.
- Expected: both remain legible; the orange panels have dark variants already.

- [ ] **Step 9: Run the full test suite once more**

Run: `npm test`
Expected: PASS — every test across `s7.test.js` and `s7Signals.test.js`.

- [ ] **Step 10: Commit any fixes**

If steps 2–8 surfaced defects, fix them, add a regression test to the relevant `.test.js` file where the defect was in the library, and commit:

```bash
git add -A
git commit -m "fix: <specific defect found during browser verification>"
```

If nothing needed fixing, skip this step — do not create an empty commit.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Number converter — hex/dec/bin/BCD, signed, bit grid | 1, 5, 7 |
| DB address decoder — byte map, overlap, type interpretation | 2, 5, 8 |
| Pointer builder/parser — P# and ANY | 4, 9 |
| NC/PLC signal lookup — 3 controls, range rule, honest miss | 6, 10 |
| REAL / IEEE-754 | 3, 11 |
| S5TIME / TIME / BCD | 3, 5, 11 |
| Shared value across tabs | 7 (shell owns `value` + `widthBytes`) |
| Registry entry + route | 7 |
| Vitest added | 1 |
| Totality contract (no throws) | Global Constraints; enforced by `isErr` tests in every task |
| Accuracy policy (source on every entry, no guessing) | 6 (integrity test asserts every entry has a source) |
| Error handling — ErrorBox reuse, neutral partial input | 7 (`onRawChange` returns early on empty) |
| Big-endian shown explicitly | 8 (byte map labels the high byte) |

No gaps.

**2. Placeholder scan**

No "TBD", "TODO", "implement later", or "similar to Task N". Every code step carries complete code. The one place that could read as a placeholder — the empty 828D dataset — is a deliberate, spec-mandated decision with a rendered explanation in Task 10, not deferred work.

**3. Type consistency**

- `widthBytes` used consistently; no bare `width` anywhere. ✓
- `parseAddress` returns `type` as `"BOOL" | "BYTE" | "WORD" | "DWORD"`; `formatAddress`, `bytesForAddress`, `overlaps` and `AddressTab` all read that same vocabulary. ✓
- `isErr` defined in Task 1 and used unchanged in Tasks 2–11. ✓
- `lookupSignal` returns entries decorated with `resolvedLabel` and `address`; `SignalTab`'s `Hit` reads exactly those plus `name`, `dir`, `source`, `id`. ✓
- `parseS5Time` and `s5TimeFromBits` both return `{base, baseMs, value, ms, bits}`; `S5Section` reads exactly those. ✓
- `interpret` returns `real`/`realExplain` only for `widthBytes === 4`; `AddressTab` guards with `r.real !== undefined`. ✓

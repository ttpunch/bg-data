# Siemens PLC Data & Address Converter — Design

**Date:** 2026-07-17
**Status:** Approved for planning
**Target:** New Knowledge card at `/knowledge/s7-converter`

---

## 1. Purpose

A Siemens CNC–oriented converter for PLC data and addresses. It answers the questions
that come up constantly when reading an 840D/828D PLC on the shop floor:

- What is this hex value in decimal — and is it signed?
- Which bytes does `DB10.DBW20` actually occupy, and which is the high byte?
- What does `P#DB10.DBX20.0 BYTE 4` decode to?
- What signal *is* `DB34.DBX60.4`?

The tool exists to prevent confidently-wrong answers. A mis-read two's complement or a
byte order flipped the wrong way is silently wrong on a live machine, which is why the
conversion math is isolated and unit-tested rather than embedded in JSX.

## 2. Scope

**In scope — six sub-tools across five tabs:**

1. Number converter — hex/dec/bin/BCD, signed and unsigned, bit grid
2. DB address decoder — DBX/DBB/DBW/DBD, big-endian byte map, overlap detection, type interpretation
3. Pointer builder/parser — `P#` area pointer and 10-byte ANY pointer
4. NC/PLC interface signal lookup — 840D sl, 840D powerline, 828D
5. REAL / IEEE-754 decoder
6. S5TIME / TIME / BCD

**Explicitly out of scope:**

- Standalone byte-order flip tool. Big-endian is *shown* in the Address tab byte map,
  but there is no separate endianness converter.
- Any refactor of `DCMotorDrive.jsx` or `GCodeTrainer.jsx`. They are large, but they do
  not block this work. This card simply must not repeat their structure.
- Live PLC connectivity. Everything is manual entry.

## 3. Architecture

Approach: thin UI shell over a pure logic library. Chosen because the math is the product
and must be verifiable without rendering.

```
src/lib/s7.js                       pure conversion math — no React, no imports
src/lib/s7Signals.js                curated signal dataset + lookup — pure data
src/components/S7Converter.jsx      thin shell, tab state, shared value  (~120 lines)
src/components/s7/NumberTab.jsx     hex/dec/bin/BCD + bit grid
src/components/s7/AddressTab.jsx    DB decoder, byte map, overlap
src/components/s7/PointerTab.jsx    P# / ANY builder + parser
src/components/s7/SignalTab.jsx     NC/PLC lookup
src/components/s7/RealTimeTab.jsx   IEEE-754 + S5TIME/TIME
```

Two integrations, following the established pattern:

- `src/lib/knowledgeTools.jsx` — registry entry:
  ```js
  {
      id: "s7-converter",
      title: "Siemens PLC Data & Address Converter",
      description: "Hex/dec/binary with signed and BCD, DB word/byte/bit decoding with big-endian byte maps and overlap warnings, P#/ANY pointers, REAL and S5TIME, plus NC/PLC interface signal lookup for 840D sl, 840D powerline and 828D.",
      icon: Binary,            // from lucide-react
      path: "/knowledge/s7-converter",
  }
  ```
- `src/components/Layout.jsx` — `<Route path='/knowledge/s7-converter' element={<S7Converter />} />`

### Module boundaries

- `s7.js` knows nothing about React and nothing about signal names.
- `s7Signals.js` knows nothing about rendering.
- Tab components are thin: parse input, call one or two lib functions, render.

The UI can be replaced without touching the math; the math can be verified without
mounting a component.

### `s7.js` public API

**Unit convention (load-bearing, to avoid a whole class of bug):** any parameter named
`bits` is a bit count (8/16/32); any parameter named `widthBytes` is a byte count (1/2/4).
No function takes an unqualified `width`.

```js
parseAddress("DB10.DBW20")   → { db:10, type:"WORD", byte:20, bit:null, widthBytes:2 }
formatAddress(addr)          → "DB10.DBW20"
bytesForAddress(addr)        → [20, 21]
assembleBE(bytes)            → value            // big-endian, MSB first
splitBE(value, widthBytes)   → bytes[]
interpret(value, widthBytes) → { BYTE, WORD, DWORD, INT, DINT, REAL, BCD, bits[] }
toSigned(value, bits)        → number           // two's complement
toUnsigned(value, bits)      → number
parseNumber(str)             → { value, radix } // 16#FF | 0xFF | FFh | 2#1010 | 255 | W#16#FF
formatHex(value, widthBytes) → "16#00FF"
bcdToDec(value)              → number | { error }
decToBcd(number)             → value | { error }
bitsToReal(u32)              → number
realToBits(number)           → u32
explainReal(u32)             → { sign, exponent, mantissa, value, special }
parsePointer(str)            → { db, area, byte, bit, type, count }
encodeAreaPointer(ptr)       → u32              // bits 0-2 bit, 3-18 byte, 24-31 area
decodeAreaPointer(u32)       → ptr
encodeAnyPointer(ptr)        → byte[10]
decodeAnyPointer(bytes)      → ptr
parseS5Time("S5T#2s")        → { base, value, ms, bits }
s5TimeFromBits(u16)          → { base, value, ms }
parseTime("T#1d2h3m4s5ms")   → ms
formatTime(ms)               → "T#1d2h3m4s5ms"
overlaps(addrA, addrB)       → boolean
```

**Totality contract:** every function returns a result or a structured `{ error }`.
No function throws. No function returns a silently-wrong number.

## 4. Sub-tool behaviour

### Number tab
Accepts any radix (`16#FF`, `0xFF`, `FFh`, `2#1010`, `255`, `W#16#FF`). Width selector
BYTE / WORD / DWORD. Outputs hex, unsigned decimal, **signed** decimal (two's complement),
binary, and BCD. Clickable bit grid using Siemens numbering (bit 7 = MSB within each byte)
with byte boundaries marked.

Rationale for signed being mandatory: `DB10.DBW20 = 16#FFFF` is `65535` as a WORD but
`-1` as an INT. Showing only one is wrong half the time.

### Address tab
Input an address plus a value. Renders:

- **Byte map** — which byte offsets are occupied, with big-endian labelling made explicit:
  in `DBW20`, `DBB20` is the **high** byte and `DBB21` the **low** byte.
- **Overlap panel** — `DBW20` overlaps `DBW19` and `DBW21`, with shared bytes highlighted.
  This is a real bug source and is surfaced, not just documented.
- **Type interpretation table** — the same bits read as WORD / INT / 2×BYTE, or for a
  DWORD as DWORD / DINT / REAL / 2×INT / 4×BYTE.
- **Bit addressing** — `DBX20.3` ↔ absolute bit offset.

### Pointer tab
Bidirectional. Build from a form to `P#DB10.DBX20.0 BYTE 4`, or paste a pointer to get
fields back. Shows the 32-bit area-pointer bitfield (bits 0–2 bit number, 3–18 byte
offset, 24–31 area ID) and the 10-byte ANY pointer breakdown, with the area-ID reference
(DB = 84h, I = 81h, Q = 82h, M = 83h).

### Signal tab
Control selector: 840D sl / 840D powerline / 828D. Address in → named signal out, with
direction (NCK→PLC or PLC→NCK) and resolved axis/channel number. Also searchable by name.
Each hit shows its `confidence` and `source`.

### REAL / Time tab
REAL ↔ 32 bits with sign / exponent / mantissa breakdown and special cases (NaN, ±Inf,
denormal, ±0). S5TIME (`S5T#2s` ↔ BCD value + time base 10ms/100ms/1s/10s) showing the
nibbles. TIME (`T#1d2h3m4s5ms` ↔ DINT milliseconds).

### Shared state
The shell owns one current value plus width. Switching tabs preserves it, so a number
decoded on the Number tab is still present on the Address tab. This shared flow is the
reason these are one card rather than several.

## 5. Signal dataset

Curated core, data-driven, extensible by editing data rather than code.

```js
{
  id: "axis-exact-stop-fine",
  controls: ["840Dsl", "840Dpl"],
  area: { db: [31, 61], label: "axis", offset: 30 },  // DB34 → axis 4
  type: "DBX", byte: 60, bit: 4,
  name: "Exact stop fine — position reached",
  dir: "NCK→PLC",
  confidence: "high",
  source: "840D sl Lists Manual — axis/spindle signals",
}
```

`lookupSignal({ control, db, byte, bit })` → matching entries with the axis/channel number
resolved from the range rule.

**Range modelling:** DB31–61 are per-axis (DB31 = axis 1) and DB21–30 are per-channel.
The dataset stores a range plus an offset rule rather than duplicating each signal 31 times.

**Accuracy policy — load-bearing:**

- Only signals that can be stated with high confidence ship. Nothing is guessed.
- Every entry carries a `source`.
- Address math works for **any** address. Named lookup covers only what is verified.
- Unknown addresses return an honest empty state: *"not in dataset — check the Lists
  manual"*. The tool never invents a signal name.

**Initial seed reality:**

- **840D sl / powerline** — seeded with the high-confidence core (axis/spindle DB31–61,
  channel DB21–30, mode group DB11).
- **828D** — ships with **no seeded entries**. Applying the accuracy policy honestly: the
  828D interface map (DB1200/1600/1800/2600/3300/3800 ranges) is not something that can be
  stated with high confidence from memory, and a guessed 828D signal name is exactly the
  failure this tool exists to prevent. The control selector, lookup, and honest-miss path
  are fully built and tested for 828D — only the data is absent. Populating it is a data
  edit against the 828D Lists manual, requiring no code change.

This asymmetry is a deliberate consequence of the policy, not an oversight.

## 6. Error handling

- Every parse returns `{ error }`; nothing throws.
- Invalid address (bad DB number, malformed type, out-of-range byte) → inline message.
- BCD nibble > 9 → explicit "not valid BCD", never a wrong decimal.
- Value wider than the selected width → explicit warning, never silent truncation.
- Reuses the `ErrorBox` component pattern already established in `AlarmCalculator.jsx`.
- Partial input while typing renders a neutral state, not a red error.

## 7. Testing

Vitest is added to the project (one dev dependency, near-zero config on Vite, plus a
`test` script in `package.json`). It is the first test runner in this repo.

`src/lib/s7.js` is unit-tested against known-good vectors:

```
toSigned(0xFFFF, 16)      → -1
toSigned(0x8000, 16)      → -32768
toSigned(0x7FFF, 16)      → 32767
assembleBE([0x12, 0x34])  → 0x1234      // big-endian, not 0x3412
parseAddress("DB10.DBW20")→ bytes [20, 21]
overlaps(DBW20, DBW21)    → true
overlaps(DBW20, DBW22)    → false
explainReal(0x3F800000)   → 1.0
explainReal(0x00000000)   → 0
explainReal(0x7F800000)   → +Inf
explainReal(0xFFC00000)   → NaN
bcdToDec(0x99)            → 99
bcdToDec(0x9A)            → { error }
parseS5Time("S5T#2s")     → base 10ms, value 200, bits 16#0200
pointer round-trip        → parse → encode → decode is identity
```

`s7Signals.js` is tested for range resolution (`DB34.DBX60.4` → axis 4) and for the
honest-miss path (unknown address returns empty, not a fabricated name).

Tab components are not unit-tested; they are thin by design and verified by running the
app.

## 8. Implementation order

1. Add Vitest + `test` script.
2. Build `s7.js` with tests — radix parsing, two's complement, big-endian assembly,
   address parsing, overlap.
3. Extend `s7.js` — BCD, IEEE-754, pointers, S5TIME/TIME, with tests.
4. Build `s7Signals.js` — schema, range resolution, seed dataset, lookup tests.
5. Build the shell + Number tab; wire registry and route. First visible slice.
6. Address tab (byte map, overlap panel, interpretation table).
7. Pointer tab.
8. Signal tab.
9. REAL / Time tab.
10. Verify in the browser across tabs and both themes.

Steps 2–4 are the correctness core and land before any UI. Step 5 is the first point the
card is usable end-to-end.

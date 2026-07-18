# SINUMERIK NC Variables Database — Design

**Date:** 2026-07-18
**Status:** Approved for planning
**Target:** New "NC Variables" tab in the existing Siemens PLC Data & Address Converter
(`/knowledge/s7-converter`)

---

## 1. Purpose

Add a searchable reference for the ~2,759 SINUMERIK **NC variables** (OPI/BTSS system
variables such as `$AN_LANGUAGE_ON_HMI`) from chapter 3 of the 840D sl List Manual, as a
new tab alongside the interface-signal lookup already shipped.

The interface signals (chapter 5, 1,104 DB signals) are already in the app
(`src/lib/s7Signals.js`). This project adds the **other half** of the same manual: the NC
variables, organized by the manual's ~128 Area/Block sections.

## 2. Scope

**In scope:**

- Extract every NC variable from chapter 3, grouped by its Area/Block section.
- Per variable, capture: **name, `$SYSTEM_VAR`, description** (the description text includes
  the manual's enumerated value lists inline).
- A new **NC Variables tab** in `S7Converter.jsx`: search by name / `$var` / description,
  filter by section, expandable descriptions.
- The dataset is **lazy-loaded** — imported only when the tab is opened, so the ~1.5 MB
  never burdens the rest of the app.

**Explicitly out of scope:**

- Structured extraction of data type, access rights, enumerated values as separate fields,
  and BTSS addressing indices (area/block/column/row). These were considered and dropped:
  they are the least reliable parts of the text layer, and the enum values survive inside
  the description text anyway.
- Chapter 4/5 interface signals — already shipped.
- Any change to the existing signal, number, address, pointer, or REAL/Time tabs.
- 828D or other controls — this manual is 840D sl.

## 3. Architecture

A committed, reproducible extraction pipeline feeds a generated, lazy-loaded dataset behind
a thin tab. The extractor is committed (unlike the signal parser, which lived in scratchpad)
because this dataset is large enough that regeneration and auditability matter.

```
scripts/ncvars/extract.py         committed parser: manual text -> generated dataset
scripts/ncvars/README.md          how to regenerate (download manual, run, verify)
src/lib/ncVariables.js            GENERATED dataset (~1.5 MB) + pure search helpers
src/lib/ncVariables.test.js       unit tests for the dataset + helpers
src/components/s7/NcVarTab.jsx     the tab: dynamic import(), loading state, search UI
src/components/S7Converter.jsx     +1 tab entry, +1 lazy-rendered block
```

### Module boundaries

- `extract.py` knows nothing about React; it reads the manual's `pdftotext -layout` output
  and emits `ncVariables.js`.
- `ncVariables.js` is pure data + filter functions, React-free.
- `NcVarTab.jsx` is a thin UI that dynamically imports the data and renders. It is the only
  module that pulls in the 1.5 MB, and only on first open.

### Per-variable schema

```js
{
  id: "N-Y-anLanguageOnHmi",       // `${area}-${block}-${name}`, stable; a numeric suffix
                                    // is appended on the rare within-block name collision
                                    // so ids stay unique (enforced by an integrity test)
  area: "N",                        // N/C/A/T/B/H/V (NCK, Channel, Axis, Tool, Mode group, drives)
  block: "Y",                       // Y/S/TO/TD/...
  section: "Global system data",    // human label from the block header
  name: "anLanguageOnHmi",
  sysvar: "$AN_LANGUAGE_ON_HMI",    // null where the variable has only a /LinkItem/, never ""
  description: "Current language set on HMI ... 1 German 3 English ...",
}
```

### Module contract (`ncVariables.js`)

```js
export const SECTIONS;   // [{ area, block, section, count }] for the filter dropdown
export const VARIABLES;  // the full array of entries above
export function searchVars({ query, area, block });
//   query : matched case-insensitively against name + sysvar + description
//   area  : optional area filter (e.g. "C")
//   block : optional block filter (e.g. "TO")
//   returns at most 200 matches (UI cap); [] for no match
```

## 4. Extraction pipeline

### Parse anchors (from the manual's own structure)

- **Section boundary:** `3.x.y  Area <A>, Block <B> : <label>` starts each block (~128 in the ch.3 body).
- **Variable start:** a `shortName  $SYSTEM_VAR` header line, or `shortName  /LinkItem/`
  where there is no `$var`.
- **Variable end:** the `Multi-line: yes/no` marker, which occurs exactly once per variable
  (2,759 times). Text between the header and this marker is the description.

### Messiness handled (each observed in the prototype)

| Problem | Fix |
|---|---|
| Section regex caught only a fraction of sections | Segment on the per-variable `Multi-line:` anchor and track the current `Area/Block` header; assert every block heading in the ch.3 body is represented, fail loudly otherwise |
| Only 569/2,759 variables captured | Handle `$var` on the following line and `/LinkItem/`-only variables; anchor on the `Multi-line:` delimiter rather than a single-line header |
| Same variable captured twice at page breaks | Strip running headers / footers / page numbers before parsing; dedup by `(area, block, name)` |
| Enum lists and prose wrap across many lines | Join everything between header and `Multi-line:` into one whitespace-collapsed description |

### Verification gates (the extractor exits non-zero on failure)

1. **Count reconciliation** — captured count within a small tolerance of the 2,759
   `Multi-line:` markers; the shortfall is written to `unparsed-report.txt`, never dropped
   silently.
2. **All body sections present** (~128) — every `Area/Block` heading in the ch.3 body is represented in the output.
3. **No empty required fields** — every entry has area, block, name; `sysvar` is null or a
   non-empty `$...` string.
4. **Spot-checks** — a handful of known variables assert exact values (enforced in the unit
   tests, see section 6).

### Accuracy policy (load-bearing)

Every field comes from the manual's text; nothing is inferred. A variable the parser cannot
cleanly capture goes to `unparsed-report.txt` for manual review — it never receives a
guessed description. The dataset header cites the manual
(*840D sl List Manual "NC variables and interface signals", 05/2017, A5E40870419, ch.3*),
and the extractor is committed so any entry can be traced and regenerated. Expect a residue
of genuinely-messy variables the automated pass will not get perfectly; the goal is to
capture the cleanly-parseable majority, report the rest explicitly, and never let an
uncertain entry look verified.

## 5. Tab UI (`NcVarTab.jsx`)

- **On first open:** `import("../../lib/ncVariables.js")` with a "Loading NC variables…"
  state; cached thereafter so re-opening is instant.
- **Search box:** matches across name, `$SYSTEM_VAR`, and description, case-insensitive.
- **Section filter:** a dropdown of the ~128 sections, grouped by area (NCK / Channel / Axis
  / Tool / Mode group / Drives), to browse a single block.
- **Results:** each row shows `name` + `$SYSTEM_VAR` (mono) + a section badge + the
  description clamped to ~2 lines; clicking expands the full text with its enum list.
- **Result cap:** render up to 200 matches with a "refine to see more" note; search narrows
  quickly.
- **Empty / error states:** honest "no variables match"; if the dynamic import fails, a clear
  "couldn't load the dataset" message rather than a blank tab.

Reuses the existing `ErrorBox` / `Row` / tab-button patterns from `src/components/s7/`.

## 6. Testing

- **Extractor** (`extract.py`): count reconciliation, all-sections check, and the
  unparsed report run at extract time; the script exits non-zero if any gate fails.
- **`ncVariables.js`** (Vitest): dataset integrity (every entry has area/block/name; ids
  unique; `sysvar` null or `$`-prefixed), and `searchVars` behavior (finds by name, `$var`,
  and description fragment; section filter works; case-insensitive; respects the 200 cap; `[]`
  for no match). Spot-checks assert known variables — e.g. `$AN_LANGUAGE_ON_HMI` resolves to
  section "Global system data" with a description containing "language".
- **`NcVarTab.jsx`:** thin by design; verified in the browser (open tab → data loads → search
  → section filter → expand a description → console clean), not unit-tested.

## 7. Implementation order

1. Commit `scripts/ncvars/extract.py` with the four verification gates; produce
   `ncVariables.js` + `unparsed-report.txt`; iterate the parser until the gates pass.
2. `ncVariables.js` search/lookup helpers + unit tests (integrity, search, spot-checks).
3. `NcVarTab.jsx` with the dynamic import, loading state, search and section filter.
4. Wire the tab into `S7Converter.jsx` (lazy-rendered).
5. Browser verification across search, filter, expand, and both themes; confirm the main
   bundle is unaffected (data only loads on tab open).

Steps 1–2 are the data core and must pass their gates before any UI. Step 3 is the first
point the tab is usable.

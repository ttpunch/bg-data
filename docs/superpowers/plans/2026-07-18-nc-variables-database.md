# NC Variables Database Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "NC Variables" tab to the shipped Siemens PLC Data & Address Converter that searches the ~2,759 SINUMERIK NC variables (name, `$SYSTEM_VAR`, description) transcribed from chapter 3 of the 840D sl Lists Manual, grouped by the manual's ~128 Area/Block sections.

**Architecture:** A committed Python extractor parses the manual's `pdftotext -layout` output into a generated `src/lib/ncVariables.js` (data array + pure search helpers, ~1.5 MB). A thin `NcVarTab.jsx` dynamically imports that module only when the tab is opened, so the large dataset never enters the main bundle. Same accuracy policy as the shipped signal dataset: transcribe from the manual, report the unparseable residue, never guess.

**Tech Stack:** Python 3 (extractor, offline), `pdftotext -layout` (poppler), React 18 + Vite (dynamic `import()`), Vitest, Tailwind, existing `src/components/s7/` UI patterns.

**Spec:** `docs/superpowers/specs/2026-07-18-nc-variables-database-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Accuracy policy (load-bearing):** every field comes from the manual's text; nothing is inferred or guessed. A variable that cannot be cleanly parsed goes to `scripts/ncvars/unparsed-report.txt` for review — it never receives a fabricated description.
- **Source of truth:** SINUMERIK 840D sl List Manual "NC variables and interface signals", 05/2017, **A5E40870419**, chapter 3. The dataset file header must cite it.
- **Schema, exactly:** `{ id, area, block, section, name, sysvar, description }`. `sysvar` is a `$…` string or `null` — **never `""`**. `id` is `${area}-${block}-${name}` with a numeric suffix appended on collision so ids are unique.
- **`src/lib/ncVariables.js` imports nothing** and contains no React. It is generated: a fixed helper preamble plus a generated `ROWS` array.
- **Lazy loading:** `NcVarTab.jsx` is the only module that imports `ncVariables.js`, via dynamic `import()`. It must not be a static top-level import anywhere, or the bundle-weight goal is defeated.
- **Search cap:** `searchVars` returns at most **200** matches.
- **Follow existing patterns:** reuse `ErrorBox` and `Row` from `src/components/s7/Shared.jsx`, the tab-button pattern in `S7Converter.jsx`, and the generated-dataset style of `src/lib/s7Signals.js`.
- **Do not modify** the Number, Address, Pointer, Signal, or REAL/Time tabs, or `s7.js` / `s7Signals.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/ncvars/extract.py` | **Create.** Committed parser: manual text → `ncVariables.js` + `unparsed-report.txt`. Runs the verification gates. Task 1. |
| `scripts/ncvars/README.md` | **Create.** How to regenerate (download manual, `pdftotext`, run). Task 1. |
| `src/lib/ncVariables.js` | **Create (generated).** `SECTIONS`, `VARIABLES`, `searchVars`. Task 1. |
| `src/lib/ncVariables.test.js` | **Create.** Unit tests for the dataset + helpers. Task 2. |
| `src/components/s7/NcVarTab.jsx` | **Create.** The tab: dynamic import, loading/error state, search, section filter, expandable rows. Task 3. |
| `src/components/S7Converter.jsx` | **Modify.** Add the tab entry + lazy-rendered block. Task 4. |

---

## Task 1: Extractor script + generated dataset

The extractor and the dataset it produces are one deliverable — a reviewer cannot judge the dataset without the script that made it, nor the script without its output. This task iterates the parser until the verification gates pass; the gates are the definition of done.

**Files:**
- Create: `scripts/ncvars/extract.py`
- Create: `scripts/ncvars/README.md`
- Create (generated): `src/lib/ncVariables.js`
- Create (generated, git-ignored scratch is fine, but commit it for traceability): `scripts/ncvars/unparsed-report.txt`

**Interfaces:**
- Consumes: nothing (offline script reading a local `lis2.txt`).
- Produces: `src/lib/ncVariables.js` exporting `SECTIONS` (`[{area, block, section, count}]`), `VARIABLES` (`[{id, area, block, section, name, sysvar, description}]`), and `searchVars({query, area, block}) → match[]` (≤200).

- [ ] **Step 1: Obtain the manual text layer**

The extractor reads a `pdftotext -layout` dump named `lis2.txt` next to the script. Document this in `README.md` and support a `--txt` path argument. Commands to produce it:

```bash
cd scripts/ncvars
curl -sL -o lis2.pdf "https://cache.industry.siemens.com/dl/files/365/109748365/att_922986/v1/840Dsl_ncvar_plc_sig_lists_man_0517_en-US.pdf"
pdftotext -layout lis2.pdf lis2.txt   # poppler; 1208 pages, ~3.4 MB text
```

`lis2.pdf` and `lis2.txt` are build inputs, not source — add them to `.gitignore` (see Step 6).

- [ ] **Step 2: Write the extractor with the segmentation strategy**

Create `scripts/ncvars/extract.py`. The proven strategy: the `Multi-line: yes/no` marker occurs once per variable (2,759×). Restrict to the chapter-3 body, segment into chunks ending at each marker, track the current `Area/Block` section header, and parse `name` + `$sysvar` from each chunk's header line (the line containing the `$var`, else the first content line). Strip page-break header echoes; join the rest as the description.

```python
#!/usr/bin/env python3
"""Extract SINUMERIK NC variables (ch.3) from the 840D sl Lists Manual text layer.

Anchor: "Multi-line: yes/no" occurs once per variable. Segment the ch.3 body
into per-variable chunks at each marker, tracking the current Area/Block header.
Emits src/lib/ncVariables.js and unparsed-report.txt. Nothing is guessed.
"""
import re, json, sys, argparse
from collections import Counter, OrderedDict

ap = argparse.ArgumentParser()
ap.add_argument("--txt", default="lis2.txt")
ap.add_argument("--out", default="../../src/lib/ncVariables.js")
ap.add_argument("--report", default="unparsed-report.txt")
args = ap.parse_args()

RAW = open(args.txt, encoding="utf-8", errors="replace").read().splitlines()

# Chapter-3 BODY only. The TOC contains copies of these headings, so pick the
# body occurrence (no dot leaders) and end just past the last Multi-line marker.
start = max(i for i, l in enumerate(RAW)
            if re.match(r"^\s*3\.1\.1\s+NC areas\s*$", l) and "...." not in l)
end = max(i for i, l in enumerate(RAW) if "Multi-line:" in l) + 1
BODY = RAW[start:end]

SEC   = re.compile(r"Area\s+([A-Z]{1,2}),\s+Block\s+([A-Z0-9]+)\s*:\s*(.+?)\s*$")
END   = re.compile(r"Multi-line:\s*(yes|no)", re.I)
SYS   = re.compile(r"(\$[A-Z][A-Za-z0-9_\[\].]+)")
NAME  = re.compile(r"^\s*([a-zA-Z][A-Za-z0-9_]{1,40})\b")
NOISE = re.compile(
    r"^\s*$"
    r"|^List Manual,\s*05/2017"
    r"|^\s*NC variables and interface signals\s*$"
    r"|^\s*\d{1,4}\s*$"
    r"|^\s*3\.\d+\s+[A-Z]"            # running "3.2 System data" header echoes
    r"|^\s*NC variables\s*$"
)

def parse_chunk(lines, sec):
    body = [l for l in lines if not NOISE.search(l) and not SEC.search(l)]
    if not body:
        return None
    # header line = the first line carrying a $VAR; else the first content line
    hdr_i = next((i for i, l in enumerate(body) if SYS.search(l)), 0)
    hdr = body[hdr_i].strip()
    nm = NAME.match(hdr)
    if not nm:
        return None
    name = nm.group(1)
    sv = SYS.search(hdr)
    sysvar = sv.group(1) if sv else None
    # description = every line except the header, with echoes of the header removed
    desc = []
    for i, l in enumerate(body):
        if i == hdr_i:
            continue
        s = l.strip()
        if s == hdr or s == name or (sysvar and s == sysvar):
            continue
        desc.append(s)
    return {**sec, "name": name, "sysvar": sysvar,
            "description": re.sub(r"\s+", " ", " ".join(desc)).strip()}

records, chunk, sec, markers, unparsed = [], [], None, 0, []
for l in BODY:
    m = SEC.search(l)
    if m and not END.search(l):
        sec = {"area": m.group(1), "block": m.group(2), "section": m.group(3).strip()}
    chunk.append(l)
    if END.search(l):
        markers += 1
        rec = parse_chunk(chunk, sec) if sec else None
        if rec and rec["name"]:
            records.append(rec)
        else:
            unparsed.append(" ".join(x.strip() for x in chunk)[:200])
        chunk = []

# dedup (area, block, name); keep the longest description (page-split fragments)
best = OrderedDict()
for r in records:
    k = (r["area"], r["block"], r["name"])
    if k not in best or len(r["description"]) > len(best[k]["description"]):
        best[k] = r
records = list(best.values())

# stable unique ids
seen = set()
for r in records:
    base, i, k = f'{r["area"]}-{r["block"]}-{r["name"]}', 0, f'{r["area"]}-{r["block"]}-{r["name"]}'
    while k in seen:
        i += 1; k = f"{base}-{i}"
    seen.add(k); r["id"] = k

# section index
sec_index = OrderedDict()
for r in records:
    key = (r["area"], r["block"])
    if key not in sec_index:
        sec_index[key] = {"area": r["area"], "block": r["block"],
                          "section": r["section"], "count": 0}
    sec_index[key]["count"] += 1
sections = list(sec_index.values())

emit(records, sections, args.out)   # defined in Step 3
open(args.report, "w").write("\n".join(unparsed))

# ── verification gates ───────────────────────────────────────────────────────
def gate(cond, msg):
    if not cond:
        print("GATE FAILED:", msg); sys.exit(1)

captured = len(records)
gate(markers >= 2700, f"expected ~2759 Multi-line markers, saw {markers}")
gate(captured >= 2600, f"captured only {captured}/{markers} variables (need >=2600)")
gate(len(sections) >= 120, f"only {len(sections)} sections (need >=120)")
gate(all(r["area"] and r["block"] and r["name"] for r in records), "empty required field")
gate(all(r["sysvar"] is None or r["sysvar"].startswith("$") for r in records), "bad sysvar")
gate(len({r["id"] for r in records}) == captured, "duplicate id")
# spot checks — known variables must resolve correctly
idx = {r["name"]: r for r in records}
gate(idx.get("anLanguageOnHmi", {}).get("sysvar") == "$AN_LANGUAGE_ON_HMI", "anLanguageOnHmi wrong")
gate("language" in idx.get("anLanguageOnHmi", {}).get("description", "").lower(), "anLanguageOnHmi desc")

print(f"OK  markers={markers}  captured={captured}  sections={len(sections)} "
      f"sysvar={sum(1 for r in records if r['sysvar'])}  unparsed={len(unparsed)}")
```

- [ ] **Step 3: Add the `emit()` writer that generates `ncVariables.js`**

Add this function to `extract.py` (called in Step 2). It writes a fixed helper preamble plus the generated `ROWS` array — mirroring how `src/lib/s7Signals.js` interleaves generated data with static helper code.

```python
def js_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'

def emit(records, sections, out_path):
    rows = []
    for r in records:
        sv = js_str(r["sysvar"]) if r["sysvar"] else "null"
        rows.append(
            f'[{js_str(r["id"])},{js_str(r["area"])},{js_str(r["block"])},'
            f'{js_str(r["section"])},{js_str(r["name"])},{sv},{js_str(r["description"])}]'
        )
    secs = ",\n  ".join(
        f'{{area:{js_str(s["area"])},block:{js_str(s["block"])},'
        f'section:{js_str(s["section"])},count:{s["count"]}}}'
        for s in sections
    )
    header = (
        "// ============================================================================\n"
        "//  ncVariables.js - SINUMERIK 840D NC variables (OPI/BTSS system variables).\n"
        "//\n"
        "//  GENERATED by scripts/ncvars/extract.py from the manual's text layer.\n"
        "//  Do not edit ROWS by hand - regenerate. Pure data + helpers; imports nothing.\n"
        "//\n"
        "//  SOURCE (every row): SINUMERIK 840D sl List Manual 'NC variables and interface\n"
        "//  signals', 05/2017, A5E40870419, chapter 3. Names and descriptions are the\n"
        "//  manual's; nothing is inferred. Variables the parser could not cleanly capture\n"
        "//  are listed in scripts/ncvars/unparsed-report.txt, not guessed.\n"
        "// ============================================================================\n\n"
    )
    body = (
        f"export const SECTIONS = [\n  {secs}\n];\n\n"
        "// [id, area, block, section, name, sysvar|null, description]\n"
        "const ROWS = [\n" + ",\n".join(rows) + "\n];\n\n"
        "export const VARIABLES = ROWS.map(([id, area, block, section, name, sysvar, description]) => ({\n"
        "    id, area, block, section, name, sysvar, description,\n"
        "}));\n\n"
        "/** Case-insensitive search over name + sysvar + description, optional area/block\n"
        " *  filter. Returns at most 200 matches (UI cap); [] for no match. */\n"
        "export function searchVars({ query, area, block } = {}) {\n"
        "    const q = String(query || '').trim().toLowerCase();\n"
        "    if (q === '' && !area && !block) return [];\n"
        "    const out = [];\n"
        "    for (const v of VARIABLES) {\n"
        "        if (area && v.area !== area) continue;\n"
        "        if (block && v.block !== block) continue;\n"
        "        if (q) {\n"
        "            const hay = (v.name + ' ' + (v.sysvar || '') + ' ' + v.description).toLowerCase();\n"
        "            if (!hay.includes(q)) continue;\n"
        "        }\n"
        "        out.push(v);\n"
        "        if (out.length >= 200) break;\n"
        "    }\n"
        "    return out;\n"
        "}\n"
    )
    open(out_path, "w").write(header + body)
```

- [ ] **Step 4: Run the extractor and iterate until every gate passes**

Run: `cd scripts/ncvars && python3 extract.py`
Expected on success: a line beginning `OK  markers=...  captured=...`. On failure it prints `GATE FAILED: …` and exits 1.

If a gate fails, refine the parser (most likely `parse_chunk`'s header-line detection or the `NOISE` filter) and re-run. Do not lower a gate threshold to force a pass — the thresholds encode "captured the clean majority." The known-hard cases to get right: variables whose `$var` sits a line below the name; `/LinkItem/`-only config variables with no `$var` (e.g. `accessLevel`) — these keep `sysvar: null`; and very long enum descriptions (e.g. `$AN_LANGUAGE_ON_HMI`) that span pages.

- [ ] **Step 5: Sanity-check the generated file loads and parses as JS**

Run: `node -e "import('./src/lib/ncVariables.js').then(m => console.log('sections', m.SECTIONS.length, 'vars', m.VARIABLES.length, 'sample', m.searchVars({query:'language'})[0]?.name))"`
Expected: prints section and variable counts and a sample match name (non-crashing) — confirms the generated JS is syntactically valid and the helpers run.

- [ ] **Step 6: Write the README and .gitignore the build inputs**

Create `scripts/ncvars/README.md` documenting the three regeneration commands (curl, pdftotext, python) and the gate meanings. Append to the repo `.gitignore`:

```
scripts/ncvars/lis2.pdf
scripts/ncvars/lis2.txt
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ncvars/extract.py scripts/ncvars/README.md scripts/ncvars/unparsed-report.txt src/lib/ncVariables.js .gitignore
git commit -m "feat: extract SINUMERIK NC variables into a generated dataset

Committed Python extractor parses ch.3 of the 840D sl Lists Manual
(A5E40870419) into src/lib/ncVariables.js: name, \$SYSTEM_VAR and
description per variable, grouped by Area/Block section, with a
searchVars helper. Segments on the per-variable Multi-line: anchor;
verification gates fail the build rather than ship bad data. Variables
that could not be cleanly parsed are listed in unparsed-report.txt, not
guessed."
```

---

## Task 2: Dataset unit tests

**Files:**
- Create: `src/lib/ncVariables.test.js`

**Interfaces:**
- Consumes: `SECTIONS`, `VARIABLES`, `searchVars` from `src/lib/ncVariables.js` (Task 1).
- Produces: nothing (test-only).

- [ ] **Step 1: Write the tests**

Create `src/lib/ncVariables.test.js`:

```js
import { describe, it, expect } from "vitest";
import { SECTIONS, VARIABLES, searchVars } from "./ncVariables";

describe("VARIABLES integrity", () => {
  it("has the bulk of the manual's variables", () => {
    expect(VARIABLES.length).toBeGreaterThan(2600);
  });
  it("gives every entry area, block and name", () => {
    for (const v of VARIABLES) {
      expect(v.area, v.id).toBeTruthy();
      expect(v.block, v.id).toBeTruthy();
      expect(v.name, v.id).toBeTruthy();
    }
  });
  it("never uses an empty-string sysvar (null or $-prefixed only)", () => {
    for (const v of VARIABLES) {
      expect(v.sysvar === null || v.sysvar.startsWith("$"), `${v.id}: ${v.sysvar}`).toBe(true);
    }
  });
  it("gives every entry a unique id", () => {
    expect(new Set(VARIABLES.map((v) => v.id)).size).toBe(VARIABLES.length);
  });
});

describe("SECTIONS", () => {
  it("indexes ~128 Area/Block sections", () => {
    expect(SECTIONS.length).toBeGreaterThan(100);
  });
  it("section counts sum to the variable total", () => {
    expect(SECTIONS.reduce((n, s) => n + s.count, 0)).toBe(VARIABLES.length);
  });
});

describe("searchVars", () => {
  it("finds a known variable by $system-var fragment", () => {
    const hits = searchVars({ query: "AN_LANGUAGE_ON_HMI" });
    expect(hits.some((v) => v.name === "anLanguageOnHmi")).toBe(true);
  });
  it("finds by description fragment, case-insensitively", () => {
    expect(searchVars({ query: "LANGUAGE SET ON HMI" }).length).toBeGreaterThan(0);
  });
  it("filters by area", () => {
    const hits = searchVars({ query: "", area: "C" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((v) => v.area === "C")).toBe(true);
  });
  it("filters by block", () => {
    const hits = searchVars({ query: "", area: "T", block: "TO" });
    expect(hits.every((v) => v.area === "T" && v.block === "TO")).toBe(true);
  });
  it("caps results at 200", () => {
    expect(searchVars({ query: "a" }).length).toBeLessThanOrEqual(200);
  });
  it("returns [] for an empty query with no filter", () => {
    expect(searchVars({ query: "" })).toEqual([]);
  });
  it("returns [] for no match", () => {
    expect(searchVars({ query: "zzzznotarealvariable" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/lib/ncVariables.test.js`
Expected: PASS — all assertions green. (If `VARIABLES.length` or `SECTIONS.length` assertions fail, the Task 1 extractor gates were too weak; fix the extractor, not the test thresholds.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ncVariables.test.js
git commit -m "test: dataset integrity and search for NC variables"
```

---

## Task 3: NcVarTab component

**Files:**
- Create: `src/components/s7/NcVarTab.jsx`

**Interfaces:**
- Consumes: `ErrorBox` from `src/components/s7/Shared.jsx`; `Input` from `src/components/ui/input.jsx`; `SECTIONS`, `VARIABLES`, `searchVars` from `src/lib/ncVariables.js` (via dynamic import).
- Produces: default-exported `NcVarTab()` (no props).

- [ ] **Step 1: Create the tab with a dynamic import and loading/error state**

Create `src/components/s7/NcVarTab.jsx`:

```jsx
import React, { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { ErrorBox } from "./Shared";

const AREA_LABELS = {
    N: "NCK", C: "Channel", A: "Axis", T: "Tool", B: "Mode group", H: "Drive (MSD)", V: "Drive (FDD)",
};

const VarRow = ({ v }) => {
    const [open, setOpen] = useState(false);
    return (
        <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors"
        >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="font-medium text-sm">{v.name}</span>
                {v.sysvar && <span className="font-mono text-xs text-primary">{v.sysvar}</span>}
                <span className="ml-auto text-[11px] font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                    {AREA_LABELS[v.area] || v.area} · {v.block}
                </span>
            </div>
            <p className={`text-xs text-muted-foreground mt-1.5 ${open ? "" : "line-clamp-2"}`}>
                {v.description || "(no description in the manual)"}
            </p>
        </button>
    );
};

const NcVarTab = () => {
    const [mod, setMod] = useState(null);      // loaded module
    const [loadErr, setLoadErr] = useState("");
    const [query, setQuery] = useState("");
    const [area, setArea] = useState("");
    const [block, setBlock] = useState("");

    useEffect(() => {
        let alive = true;
        import("../../lib/ncVariables.js")
            .then((m) => { if (alive) setMod(m); })
            .catch(() => { if (alive) setLoadErr("Couldn't load the NC variables dataset. Try reopening the tab."); });
        return () => { alive = false; };
    }, []);

    if (loadErr) return <ErrorBox msg={loadErr} />;
    if (!mod) {
        return <div className="text-sm text-muted-foreground py-8 text-center">Loading NC variables…</div>;
    }

    const { SECTIONS, searchVars } = mod;
    const blocksForArea = area ? SECTIONS.filter((s) => s.area === area) : [];
    const hits = searchVars({ query, area: area || undefined, block: block || undefined });
    const searched = query.trim() !== "" || area !== "";

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Search</label>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="name, $SYSTEM_VAR or description text"
                        className="mt-1"
                    />
                </div>
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Area</label>
                    <select
                        value={area}
                        onChange={(e) => { setArea(e.target.value); setBlock(""); }}
                        className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                        <option value="">All</option>
                        {[...new Set(SECTIONS.map((s) => s.area))].map((a) => (
                            <option key={a} value={a}>{AREA_LABELS[a] || a}</option>
                        ))}
                    </select>
                </div>
                {area && (
                    <div>
                        <label className="text-xs uppercase tracking-wide text-muted-foreground">Block</label>
                        <select
                            value={block}
                            onChange={(e) => setBlock(e.target.value)}
                            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm max-w-[260px]"
                        >
                            <option value="">All blocks</option>
                            {blocksForArea.map((s) => (
                                <option key={s.block} value={s.block}>{s.block} — {s.section} ({s.count})</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {!searched && (
                <p className="text-sm text-muted-foreground mt-6">
                    {mod.VARIABLES.length.toLocaleString("en-US")} NC variables from the 840D sl Lists
                    Manual. Search by name, <span className="font-mono">$SYSTEM_VAR</span>, or description —
                    or pick an area to browse.
                </p>
            )}

            {searched && (
                <div className="mt-5 space-y-2">
                    {hits.length === 0 && (
                        <p className="text-sm text-muted-foreground">No variables match.</p>
                    )}
                    {hits.map((v) => <VarRow key={v.id} v={v} />)}
                    {hits.length >= 200 && (
                        <p className="text-xs text-muted-foreground pt-1">
                            Showing the first 200 — refine your search to narrow.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default NcVarTab;
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds. Confirm code-splitting happened: the build output lists a separate chunk for `ncVariables` (Vite splits dynamic imports into their own chunk). If `ncVariables` is folded into the main bundle, a static import leaked in — find and remove it.

- [ ] **Step 3: Commit**

```bash
git add src/components/s7/NcVarTab.jsx
git commit -m "feat: add NC Variables tab (lazy-loaded search + section filter)"
```

---

## Task 4: Wire the tab into the converter + browser verification

**Files:**
- Modify: `src/components/S7Converter.jsx`

**Interfaces:**
- Consumes: default-exported `NcVarTab` from `src/components/s7/NcVarTab.jsx` (Task 3).
- Produces: nothing.

- [ ] **Step 1: Add the import**

In `src/components/S7Converter.jsx`, add after the `RealTimeTab` import:

```js
import NcVarTab from "./s7/NcVarTab";
```

- [ ] **Step 2: Add the tab entry**

In the `TABS` array, append after the `realtime` entry:

```js
    { id: "ncvars", label: "NC Variables" },
```

- [ ] **Step 3: Add the rendered block**

In `<CardContent>`, after the `realtime` block:

```jsx
                    {tab === "ncvars" && <NcVarTab />}
```

- [ ] **Step 4: Verify the build and tests**

Run: `npm run build`
Expected: succeeds.

Run: `npm test`
Expected: PASS — the full suite (s7, s7Signals, ncVariables) green.

- [ ] **Step 5: Commit**

```bash
git add src/components/S7Converter.jsx
git commit -m "feat: wire NC Variables tab into the S7 converter"
```

- [ ] **Step 6: Browser verification**

Use the preview tooling with the `dev` config. Log in is required (JWT gate in `Loginsuccess.jsx`); ask the user to log in if the app shows the login screen — never enter credentials.

Navigate to `/knowledge/s7-converter` and:
1. Click the **NC Variables** tab. Expected: a brief "Loading NC variables…" then the intro line with the variable count.
2. Search `AN_LANGUAGE_ON_HMI`. Expected: a hit named `anLanguageOnHmi`; clicking it expands the full description with the language list.
3. Search `tool offset`. Expected: multiple hits across Tool-area blocks.
4. Set **Area = Tool**, **Block = TO**. Expected: results narrow to that block; the block dropdown shows section labels and counts.
5. Confirm the 200-cap note appears for a broad query (e.g. `a`).
6. Check the console: no errors. Confirm via the network panel that `ncVariables` loads as its own chunk only after the tab is first opened (not on initial page load).
7. Toggle dark mode; confirm rows, selects, and badges remain legible.

- [ ] **Step 7: Commit any fixes**

If verification surfaces a defect, fix it, add a regression test to `src/lib/ncVariables.test.js` if the fault was in the data/helpers, and commit. If nothing needed fixing, skip — no empty commit.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Extract every ch.3 NC variable, grouped by Area/Block | 1 |
| Fields: name, `$SYSTEM_VAR`, description | 1 (schema + `emit`) |
| Committed reproducible extractor + README | 1 |
| Generated `ncVariables.js` with `SECTIONS`/`VARIABLES`/`searchVars` | 1 |
| Lazy-loaded (dynamic import, own chunk) | 3 (dynamic `import()`), verified 3-step2 & 4-step6 |
| NC Variables tab: search, section filter, expandable descriptions | 3 |
| 200-result cap | 1 (`searchVars`), 2 (test), 3 (note) |
| Loading + error states | 3 |
| Accuracy policy: unparsed report, no guessing, source cited | 1 (gates, `emit` header, `unparsed-report.txt`) |
| Verification gates fail the build | 1 (Step 4 `gate()`), 2 (unit tests) |
| Testing: extractor gates + dataset units + browser | 1, 2, 4 |
| Don't touch other tabs / s7.js / s7Signals.js | Global Constraints; only `S7Converter.jsx` is modified |

No gaps.

**2. Placeholder scan**

No "TBD"/"TODO"/"handle edge cases". Every code step carries complete code. The extractor's iterative Step 4 is not a placeholder — it names the concrete hard cases (`$var` on the next line, `/LinkItem/` no-`$var` vars, page-spanning enums) and the gate thresholds that define done.

**3. Type consistency**

- Schema `{id, area, block, section, name, sysvar, description}` is identical in the spec, `emit()` output, the `VARIABLES.map` reconstruction, the tests, and `VarRow`. ✓
- `searchVars({query, area, block})` signature matches across `emit()` (definition), Task 2 tests, and Task 3 call site (`area: area || undefined`). ✓
- `SECTIONS` element shape `{area, block, section, count}` matches between `emit()`, the `SECTIONS.reduce` test, and the block dropdown (`s.block`, `s.section`, `s.count`). ✓
- `sysvar` is `$…`-string-or-`null` everywhere; the "never empty string" rule is asserted in Task 2 and honored by `emit()` (`null` when falsy). ✓

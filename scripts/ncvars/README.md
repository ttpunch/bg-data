# scripts/ncvars

Generates `src/lib/ncVariables.js` — the SINUMERIK 840D sl NC-variable
reference dataset (OPI/BTSS system variables: `$AA_...`, `$AN_...`, etc.) —
by parsing chapter 3 ("NC variables") of the manual's text layer.

**Source:** SINUMERIK 840D sl List Manual "NC variables and interface
signals", 05/2017, A5E40870419, chapter 3.

## Regenerating from scratch

```bash
cd scripts/ncvars

# 1. Download the manual PDF (~1208 pages)
curl -sL -o lis2.pdf "https://cache.industry.siemens.com/dl/files/365/109748365/att_922986/v1/840Dsl_ncvar_plc_sig_lists_man_0517_en-US.pdf"

# 2. Extract the text layer with poppler's pdftotext, preserving column layout
pdftotext -layout lis2.pdf lis2.txt   # ~3.4 MB text

# 3. Run the extractor
python3 extract.py
```

`lis2.pdf` and `lis2.txt` are build inputs, not source — both are
git-ignored (see the repo's `.gitignore`). Only `extract.py` and the
generated `src/lib/ncVariables.js` are committed.

`extract.py` accepts:

- `--txt PATH` — input text-layer dump (default `lis2.txt`)
- `--out PATH` — output JS file (default `../../src/lib/ncVariables.js`)
- `--report PATH` — unparsed-entries report (default `unparsed-report.txt`)

## Segmentation strategy

Every NC variable in chapter 3 ends with a `Multi-line: yes/no` line — this
occurs exactly once per variable (2,759 times in the 05/2017 edition) and is
the anchor the extractor segments on:

1. Restrict to the chapter-3 **body** (the real "3.2 System data" heading
   onward — not the table of contents, which repeats the same headings with
   dot leaders, and not section 3.1's introductory text about the table
   format itself, which contains illustrative example variables and a
   literal `Multi-line: Yes/no` inside its own field-legend prose).
2. Walk the body line by line, tracking the current `Area X, Block Y : Title`
   section header.
3. Chunk the body at each `Multi-line:` marker. A chunk's trailing
   dimension-description text can wrap onto the following lines (e.g. a long
   machine-data cross-reference) — those are swallowed into the same chunk,
   up to the next blank line, so they aren't mistaken for the next
   variable's header.
4. Within a chunk, find the first line that *looks like* a table row — a
   bare identifier in column 1 (optionally followed, after a wide gap, by a
   `$SYSVAR` or other second-column value). This is deliberately not just
   "the first content line": a section's opening chunk usually carries
   boilerplate first (an `OEM-MMC: Linkitem /Path/...` note and/or an
   explanatory paragraph), which must be skipped rather than mis-captured as
   the variable itself.
5. The variable's `sysvar` is read only from that header line, never scanned
   for elsewhere in the body — descriptions routinely cross-reference
   unrelated machine data (e.g. "see: $MN_MM_NUM_FILES_PER_DIR"), and picking
   that up as the header would silently mis-name the variable.
6. Everything else in the chunk becomes the description, with running
   page-top header echoes (the same "name $sysvar" reprinted at whatever
   column spacing that page's layout produced) stripped by whitespace-
   normalized comparison.

Some variables genuinely have no OPI `$` system variable — only a
`/LinkItem/` config path (e.g. `accessLevel`) — these keep `sysvar: null`
rather than having one guessed. A handful of variables (4, all in section
"Area M, Block S : Internal status data HMI") are named as bare LinkItem
paths themselves (e.g. `/Nck/Nck/ActBag`) rather than camelCase identifiers;
the extractor doesn't recognize that naming style as a header and leaves
them out rather than guessing — they, and a few page-break artifacts, are
listed in `unparsed-report.txt` for manual review. Nothing that lands there
is fabricated into the dataset.

Two more real sections (`Area H, Block S` and `Area V, Block S`, both
drive-specific state data) are documented in the manual but list no
individually named variables at all — they appear in `SECTIONS` with
`count: 0`, which is accurate, not a parsing gap.

## Output schema

`src/lib/ncVariables.js` exports:

- `SECTIONS: [{ area, block, section, count }]` — every `Area/Block` heading
  found in the body, in document order, including sections with `count: 0`.
- `VARIABLES: [{ id, area, block, section, name, sysvar, description }]` —
  `sysvar` is a `$...` string or `null`, never `""`. `id` is
  `` `${area}-${block}-${name}` ``, with a numeric suffix appended on
  collision so ids are always unique.
- `searchVars({ query, area, block }) → match[]` — case-insensitive search
  over name/sysvar/description with optional area/block filters, capped at
  200 matches.

The file imports nothing and contains no React — it's pure generated data
plus a few small helper functions, in the same generated-dataset style as
`src/lib/s7Signals.js`. Do not hand-edit `ROWS`; re-run the extractor.

## Verification gates

`extract.py` exits non-zero (`GATE FAILED: ...`) rather than emit a dataset
that fails any of:

- `markers >= 2700` — the `Multi-line:` anchor count is in the expected
  ballpark (2,759 in the 05/2017 edition).
- `captured >= 2600` — at least that many variables parsed cleanly out of
  the markers found.
- `sections >= 120` — at least that many `Area/Block` sections were indexed.
- every captured record has non-empty `area`/`block`/`name`.
- every `sysvar` is `null` or starts with `$`.
- every `id` is unique.
- spot checks: `anLanguageOnHmi` resolves to sysvar `$AN_LANGUAGE_ON_HMI`
  and its description contains "language" (this variable's entry spans
  several pages of an enum table, so it's a good check that page-spanning
  descriptions are captured and de-duplicated correctly).

On success it prints one line, e.g.:

```
OK  markers=2759  captured=2755  sections=128 sysvar=1234  unparsed=4
```

If a gate fails, the fix belongs in the parser (most likely
`is_header_line`'s column-1 detection or the `NOISE` filter for a new
page-furniture shape) — never in lowering a threshold to force a pass.

## Sanity-checking the generated file

```bash
node -e "import('./src/lib/ncVariables.js').then(m => console.log('sections', m.SECTIONS.length, 'vars', m.VARIABLES.length, 'sample', m.searchVars({query:'language'})[0]?.name))"
```

This confirms the generated JS is syntactically valid and the helpers run,
without pulling in a bundler or the app itself.

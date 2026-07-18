#!/usr/bin/env python3
"""Extract SINUMERIK NC variables (ch.3) from the 840D sl Lists Manual text layer.

Anchor: "Multi-line: yes/no" occurs once per variable. Segment the ch.3 body
into per-variable chunks at each marker, tracking the current Area/Block header.
Emits src/lib/ncVariables.js and unparsed-report.txt. Nothing is guessed.
"""
import re, sys, argparse
from collections import OrderedDict

ap = argparse.ArgumentParser()
ap.add_argument("--txt", default="lis2.txt")
ap.add_argument("--out", default="../../src/lib/ncVariables.js")
ap.add_argument("--report", default="unparsed-report.txt")
args = ap.parse_args()

RAW = open(args.txt, encoding="utf-8", errors="replace").read().splitlines()

# Chapter-3 BODY only, starting at the real "3.2 System data" heading (the
# body occurrence: flush left, wide column gap - the running-header echoes of
# the same title elsewhere are indented with only a single space). Sections
# 3.1.x before it are explanatory text about the table format itself (data
# types, table-field legend, illustrative example variables like numMachAxes/
# actFeedRate/ParameterNo, and a literal "Multi-line: Yes/no" appearing inside
# the field-legend prose) - not real variable entries, and their stray
# "Multi-line:" occurrences are not part of the 2,759 real per-variable
# markers. End just past the last real Multi-line marker.
start = max(i for i, l in enumerate(RAW)
            if re.match(r"^3\.2\s{5,}System data\s*$", l))
end = max(i for i, l in enumerate(RAW) if "Multi-line:" in l) + 1
BODY = RAW[start:end]

SEC   = re.compile(r"Area\s+([A-Z]{1,2}),\s+Block\s+([A-Z0-9]+)\s*:\s*(.+?)\s*$")
END   = re.compile(r"Multi-line:\s*(yes|no)", re.I)
SYS   = re.compile(r"(\$[A-Z][A-Za-z0-9_]+(?:\[[^\]]*\])?)")
NAME  = re.compile(r"^\s*([a-zA-Z][A-Za-z0-9_]{1,40})\b")
# The manual's variable table has the NC variable name alone in the first
# column, e.g. "accessLevel" or "anLanguageOnHmi   $AN_LANGUAGE_ON_HMI" - name,
# then a wide (2+ space) column gap, then an optional 2nd-column value. Section
# intro prose ("OEM-MMC: Linkitem  /NckConfiguration/...", or a plain running
# paragraph with no wide gap at all) never has a bare identifier as that first
# column, so this distinguishes a real header line from section boilerplate.
FIELD_SPLIT = re.compile(r"\s{2,}")
IDENT = re.compile(r"^[a-zA-Z][A-Za-z0-9_]{1,40}$")

def is_header_line(line):
    first = FIELD_SPLIT.split(line.strip(), 1)[0]
    return bool(IDENT.match(first))
NOISE = re.compile(
    r"^\s*$"
    r"|^List Manual,\s*05/2017"
    r"|^\s*\d{1,4}\s+List Manual,\s*05/2017"   # even-page footer: "<pagenum>  List Manual, 05/2017, ..."
    r"|^\s*NC variables and interface signals\s*$"
    r"|^\s*\d{1,4}\s*$"
    r"|^\s*3\.\d+\s+[A-Z]"            # running "3.2 System data" header echoes
    r"|^\s*NC variables\s*$"
)

def parse_chunk(lines, sec):
    body = [l for l in lines if not NOISE.search(l) and not SEC.search(l)]
    if not body:
        return None
    # header line = the first line that *looks like* a table row (a bare
    # identifier in column 1), not simply body[0]. A section's opening chunk
    # often carries boilerplate before its first real variable - a
    # "OEM-MMC: Linkitem  /Path/..." note and/or an explanatory paragraph -
    # and blindly taking body[0] mis-captures that prose as the variable
    # (e.g. name "OEM" swallowing "accessLevel"). Scanning the whole body for
    # *any* $-bearing line is equally unsound: descriptions routinely
    # cross-reference unrelated machine data (e.g. "Maximum number of files
    # per directory (see: $MN_MM_NUM_FILES_PER_DIR)"), so the sysvar itself is
    # only ever read off the header line once it's correctly located.
    hdr_i = next((i for i, l in enumerate(body) if is_header_line(l)), None)
    if hdr_i is None:
        return None
    hdr = body[hdr_i].strip()
    nm = NAME.match(hdr)
    if not nm:
        return None
    name = nm.group(1)
    sv = SYS.search(hdr)
    sysvar = sv.group(1) if sv else None
    # description = every line except the header, with echoes of the header
    # removed. Long entries that span page breaks get this same "name  $sysvar"
    # pair reprinted as a running page-top header on every continuation page,
    # at whatever column spacing that page's layout happened to produce - so
    # compare on whitespace-collapsed text, not the raw padded string.
    hdr_norm = re.sub(r"\s+", " ", hdr)
    name_sv_norm = f"{name} {sysvar}" if sysvar else name
    desc = []
    for i, l in enumerate(body):
        if i == hdr_i:
            continue
        s = l.strip()
        s_norm = re.sub(r"\s+", " ", s)
        if s_norm in (hdr_norm, name, name_sv_norm) or (sysvar and s_norm == sysvar):
            continue
        desc.append(s)
    return {**sec, "name": name, "sysvar": sysvar,
            "description": re.sub(r"\s+", " ", " ".join(desc)).strip()}

records, chunk, sec, markers, unparsed = [], [], None, 0, []
# every "Area X, Block Y : Title" heading encountered, in document order - even
# ones with zero captured variables (e.g. the GD1-GD9 global-user-data blocks,
# which are documented but have no individually named variables at all). This
# is the section INDEX; captured-variable counts are filled in after the loop.
sec_seen = OrderedDict()
i, n = 0, len(BODY)
while i < n:
    l = BODY[i]
    m = SEC.search(l)
    if m and not END.search(l):
        sec = {"area": m.group(1), "block": m.group(2), "section": m.group(3).strip()}
        sec_seen.setdefault((sec["area"], sec["block"]), sec["section"])
    chunk.append(l)
    if END.search(l):
        # The "Multi-line:" field's index/dimension description can wrap onto
        # the following lines (e.g. a long machine-data cross-reference like
        # "NCK machine axis image (machine data 10002 $MN_AXCONF_LOGIC_MACHAX_TAB)").
        # Those wrapped lines belong to THIS field, not the next variable's
        # header - swallow them (up to the next blank line) into this chunk so
        # they don't get mistaken for the next variable's $var header line.
        j = i + 1
        while j < n and BODY[j].strip() != "":
            chunk.append(BODY[j])
            j += 1
        i = j
        markers += 1
        rec = parse_chunk(chunk, sec) if sec else None
        # A sysvar with an unbalanced bracket count means the "[...]" index
        # block was not captured cleanly (e.g. cut off by a page break or an
        # unexpected character SYS didn't anticipate). Per policy, a field
        # that can't be captured cleanly is reported as unparsed, never
        # shipped truncated or silently nulled out.
        if rec and rec["sysvar"] and rec["sysvar"].count("[") != rec["sysvar"].count("]"):
            unparsed.append(" ".join(x.strip() for x in chunk)[:200])
        elif rec and rec["name"]:
            records.append(rec)
        else:
            unparsed.append(" ".join(x.strip() for x in chunk)[:200])
        chunk = []
        continue
    i += 1

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

# section index - seeded from every heading encountered (sec_seen), so
# variable-less sections (e.g. GD1-GD9 global user data) still appear with
# count:0 rather than silently vanishing from the index.
sec_index = OrderedDict()
for (area, block), title in sec_seen.items():
    sec_index[(area, block)] = {"area": area, "block": block, "section": title, "count": 0}
for r in records:
    key = (r["area"], r["block"])
    if key not in sec_index:
        sec_index[key] = {"area": r["area"], "block": r["block"],
                          "section": r["section"], "count": 0}
    sec_index[key]["count"] += 1
sections = list(sec_index.values())


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


emit(records, sections, args.out)
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
gate(all(r["sysvar"] is None or r["sysvar"].count("[") == r["sysvar"].count("]")
         for r in records), "unbalanced sysvar brackets (truncated $var index)")
gate(len({r["id"] for r in records}) == captured, "duplicate id")
# spot checks — known variables must resolve correctly
idx = {r["name"]: r for r in records}
gate(idx.get("anLanguageOnHmi", {}).get("sysvar") == "$AN_LANGUAGE_ON_HMI", "anLanguageOnHmi wrong")
gate("language" in idx.get("anLanguageOnHmi", {}).get("description", "").lower(), "anLanguageOnHmi desc")

print(f"OK  markers={markers}  captured={captured}  sections={len(sections)} "
      f"sysvar={sum(1 for r in records if r['sysvar'])}  unparsed={len(unparsed)}")

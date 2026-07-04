import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { ArrowLeft, Repeat, ArrowRight, Copy, Check, AlertTriangle, Info } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  SAMPLE PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════
const SAMPLE_SIEMENS = `; TAPER_SHAFT.MPF
G71 G90 G54
T="ROUGH_80" D1 M6
G96 S180 LIMS=2500 M4
G0 X52 Z2
G1 Z0 F0.2
G1 X30 Z-40
G1 X54
G0 Z2
G4 F1.5
MCALL CYCLE81(5,0,2,-8)
X20
X40
MCALL
M5
M30`;

const SAMPLE_FANUC = `O0001
(DRILL PLATE)
G21 G90 G54
T01 M06
S900 M03
G00 X20. Y20. Z5. M08
G81 Z-8. R2. F120
X40.
X60.
G80
G04 P500
G28 Z0.
M98 P1000 L2
M05
M30`;

// ═══════════════════════════════════════════════════════════════════════════════
//  CONVERTER
//  Applies the mechanical transforms automatically; collects "review" warnings for
//  anything that has no safe 1:1 mapping (cycles, macros, frames, ref moves, etc.).
// ═══════════════════════════════════════════════════════════════════════════════
function convertProgram(src, dir, opts) {
    const lines = src.split(/\r?\n/);
    const warnings = [];
    const warn = (line, msg) => warnings.push({ line, msg });
    let applied = 0;

    const outLines = lines.map((raw, i) => {
        const ln = i + 1;

        // ── split code / comment ──────────────────────────────────────────────
        let code = raw, commentText = "";
        if (dir === "s2f") {
            const semi = raw.indexOf(";");
            if (semi >= 0) { code = raw.slice(0, semi); commentText = raw.slice(semi + 1).trim(); }
        } else {
            const parts = [];
            code = raw.replace(/\(([^)]*)\)/g, (m, c) => { parts.push(c.trim()); return " "; });
            commentText = parts.join(" ").trim();
        }

        const before = code;
        let c = code;

        if (dir === "s2f") {
            // ── SIEMENS → FANUC ──────────────────────────────────────────────
            c = c.replace(/\bG710\b/gi, "G21").replace(/\bG700\b/gi, "G20");
            c = c.replace(/\bG71\b/gi, "G21").replace(/\bG70\b/gi, "G20");

            c = c.replace(/\bLIMS\s*=\s*(\d+(?:\.\d+)?)/gi, (m, v) => {
                warn(ln, "LIMS= became G50 S — confirm G50 isn't also used for coordinate setting on your control.");
                return `G50 S${v}`;
            });

            if (/\bG0?4\b/i.test(c)) {
                c = c.replace(/\bG0?4\b/i, "G04");
                c = c.replace(/\bF(\d+(?:\.\d+)?)/i, "X$1"); // Siemens dwell F(sec) → Fanuc X(sec)
            }

            c = c.replace(/\bRET\b/gi, "M99").replace(/\bM17\b/gi, "M99");

            if (/\bT\s*=\s*"/.test(c)) warn(ln, 'Tool called by name (T="…") — Fanuc needs a tool number (e.g. T01).');
            if (/\bCYCLE\d+/i.test(c)) warn(ln, "CYCLE… call — rewrite as a Fanuc canned cycle (G81/G82/G83/G84…) with G80 to cancel.");
            if (/\bMCALL\b/i.test(c)) warn(ln, "MCALL (modal cycle) — on Fanuc a canned cycle is modal until G80; restructure manually.");
            if (/\b(A?TRANS|A?ROT|SCALE|MIRROR)\b/i.test(c)) warn(ln, "Frame (TRANS/ROT/SCALE/MIRROR) — closest Fanuc is G52/G68/G51, converted manually.");
            if (/\bR\d+\s*=/.test(c) || /\b(DEF|WHILE|FOR|ENDWHILE|ENDFOR|GOTOB|GOTOF)\b/i.test(c))
                warn(ln, "Parametric / R-parameter code — convert to Fanuc macro B (#variables, [ ] math) manually.");

            c = c.replace(/\bM(\d)\b/g, "M0$1"); // single-digit M → two-digit
            if (opts.decimals) c = c.replace(/([XYZIJKABCUVW])([-+]?\d+)(?![\d.])/gi, "$1$2.");
        } else {
            // ── FANUC → SIEMENS ──────────────────────────────────────────────
            c = c.replace(/\bO(\d+)\b/gi, (m, n) => {
                warn(ln, `O-number ${n} — Siemens identifies a program by file name (e.g. PART_${n}.MPF), added as a comment.`);
                return `; O${n} (was program number)`;
            });

            c = c.replace(/\bG20\b/gi, "G70").replace(/\bG21\b/gi, "G71");

            if (/\bG0?4\b/i.test(c)) {
                c = c.replace(/\bG0?4\b/i, "G4");
                c = c.replace(/\bP(\d+)\b/i, (m, p) => `F${(+p) / 1000}`); // Fanuc dwell P(ms) → Siemens F(sec)
                c = c.replace(/\bX(\d+(?:\.\d+)?)\b/i, "F$1");             // Fanuc dwell X(sec) → Siemens F(sec)
            }

            c = c.replace(/\bM98\s+P(\d+)(?:\s+L(\d+))?/gi, (m, p, l) => {
                warn(ln, "M98 subprogram call — became a Siemens call by number; verify the subprogram name/file.");
                return l ? `L${p} P${l}` : `L${p}`;
            });
            c = c.replace(/\bM99\b/gi, "M17");

            if (/\bG28\b/i.test(c)) warn(ln, "G28 reference return — Siemens uses G74 with axis names (X1=0 Z1=0…); syntax differs, review it.");
            c = c.replace(/\bG50\b\s*S(\d+)/gi, (m, s) => {
                warn(ln, "G50 S became LIMS= — but G50 can also mean coordinate-system set on some Fanuc controls; confirm intent.");
                return `LIMS=${s}`;
            });
            if (/\bG8[1-9]\b/i.test(c)) warn(ln, "Canned cycle (G8x) — Siemens uses CYCLE8x(…) with different parameters; convert manually.");
            if (/#\d+/.test(c) || /[[\]]/.test(c)) {
                c = c.replace(/#(\d+)/g, "R$1").replace(/\[/g, "(").replace(/\]/g, ")");
                warn(ln, "Macro variables/[ ] were mapped to R-parameters/( ) — review the expressions.");
            }

            c = c.replace(/\bM0(\d)\b/gi, "M$1"); // two-digit M0x → single-digit
        }

        // normalise spacing, reattach comment
        let result = c.replace(/\s{2,}/g, " ").trimEnd();
        result = result.replace(/^\s+/, (m) => m); // keep leading indent if any (usually none)
        result = result.trim();
        if (commentText) {
            const cm = dir === "s2f" ? `(${commentText})` : `; ${commentText}`;
            result = result ? `${result} ${cm}` : cm;
        }
        if (before.trim() !== c.trim()) applied++;
        return result;
    });

    return { text: outLines.join("\n"), warnings, applied };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const CodeConverter = () => {
    const [dir, setDir] = useState("s2f");
    const [input, setInput] = useState(SAMPLE_SIEMENS);
    const [decimals, setDecimals] = useState(true);
    const [copied, setCopied] = useState(false);

    const { text: output, warnings } = useMemo(
        () => convertProgram(input, dir, { decimals }),
        [input, dir, decimals]
    );

    const switchDir = (next) => {
        if (next === dir) return;
        // if the box is still holding an untouched sample, swap it for the other one
        if (input.trim() === SAMPLE_SIEMENS.trim() || input.trim() === SAMPLE_FANUC.trim() || input.trim() === "") {
            setInput(next === "s2f" ? SAMPLE_SIEMENS : SAMPLE_FANUC);
        }
        setDir(next);
    };

    const loadSample = () => setInput(dir === "s2f" ? SAMPLE_SIEMENS : SAMPLE_FANUC);

    const copyOut = async () => {
        try {
            await navigator.clipboard.writeText(output);
            setCopied(true);
            toast.success("Converted program copied");
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error("Copy failed — select the text manually");
        }
    };

    const fromLabel = dir === "s2f" ? "Siemens (SINUMERIK)" : "Fanuc";
    const toLabel = dir === "s2f" ? "Fanuc" : "Siemens (SINUMERIK)";

    return (
        <div className="max-w-6xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Knowledge
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Repeat className="h-6 w-6 text-primary" />
                    Siemens ↔ Fanuc Program Converter
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Translates the mechanical parts of a part program between dialects — comments, units, M-codes,
                    dwell, spindle-speed limit and subprogram calls/returns. Cycles, macros, frames and reference
                    moves are flagged for manual review.
                </p>
            </div>

            {/* direction + options */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border overflow-hidden text-sm font-semibold">
                    <button
                        onClick={() => switchDir("s2f")}
                        className={`px-4 py-1.5 transition-colors ${dir === "s2f" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                        Siemens → Fanuc
                    </button>
                    <button
                        onClick={() => switchDir("f2s")}
                        className={`px-4 py-1.5 transition-colors ${dir === "f2s" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >
                        Fanuc → Siemens
                    </button>
                </div>

                {dir === "s2f" && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={decimals} onChange={(e) => setDecimals(e.target.checked)} className="accent-primary" />
                        Add decimal points to axis words
                    </label>
                )}

                <Button size="sm" variant="outline" onClick={loadSample} className="ml-auto">
                    Load example
                </Button>
            </div>

            {/* editor / output */}
            <div className="grid md:grid-cols-2 gap-5">
                <div>
                    <label className="text-sm font-medium">Input — {fromLabel}</label>
                    <textarea
                        spellCheck={false}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="mt-1.5 w-full h-96 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Output — {toLabel}</label>
                        <Button size="sm" variant="ghost" onClick={copyOut} className="h-7 gap-1.5">
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </div>
                    <pre className="mt-1.5 w-full h-96 overflow-auto rounded-md border bg-slate-900 text-slate-100 px-3 py-2 text-sm font-mono">{output}</pre>
                </div>
            </div>

            {/* warnings */}
            <div>
                <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    Manual review ({warnings.length})
                </h2>
                {warnings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing flagged — but always dry-run on the machine before cutting.</p>
                ) : (
                    <div className="rounded-lg border divide-y">
                        {warnings.map((w, i) => (
                            <div key={i} className="flex gap-3 px-4 py-2 text-sm">
                                <span className="font-mono text-muted-foreground shrink-0 w-16">Line {w.line}</span>
                                <span>{w.msg}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 text-sm flex gap-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-muted-foreground">
                    This is a helper, not a certified post-processor. It converts syntax it can map safely and leaves
                    everything else in place with a flag. Canned cycles, parametric programs, tool tables, work-offset
                    numbering and machine-specific M-codes still need an engineer's eye. Always verify on a dry run.
                </p>
            </div>
        </div>
    );
};

export default CodeConverter;

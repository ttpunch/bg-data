import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "./ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { ArrowLeft, BookOpenText, Search } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  G-CODES — Preparatory functions (generic Fanuc-style, applies broadly across
//  most CNC controls with minor variation by builder)
// ═══════════════════════════════════════════════════════════════════════════════
const G_CODES = [
    { code: "G00", desc: "Rapid positioning (non-cutting move)", category: "Motion" },
    { code: "G01", desc: "Linear interpolation (feed-rate move)", category: "Motion" },
    { code: "G02", desc: "Circular interpolation, clockwise", category: "Motion" },
    { code: "G03", desc: "Circular interpolation, counter-clockwise", category: "Motion" },
    { code: "G04", desc: "Dwell (pause for specified time)", category: "Motion" },
    { code: "G09", desc: "Exact stop check (non-modal)", category: "Motion" },
    { code: "G17", desc: "Select XY plane", category: "Plane Selection" },
    { code: "G18", desc: "Select ZX plane", category: "Plane Selection" },
    { code: "G19", desc: "Select YZ plane", category: "Plane Selection" },
    { code: "G20", desc: "Programming in inches", category: "Units" },
    { code: "G21", desc: "Programming in millimeters", category: "Units" },
    { code: "G28", desc: "Return to machine reference (home) position", category: "Reference" },
    { code: "G29", desc: "Return from reference position", category: "Reference" },
    { code: "G40", desc: "Cutter compensation cancel", category: "Compensation" },
    { code: "G41", desc: "Cutter compensation left", category: "Compensation" },
    { code: "G42", desc: "Cutter compensation right", category: "Compensation" },
    { code: "G43", desc: "Tool length compensation, positive direction", category: "Compensation" },
    { code: "G44", desc: "Tool length compensation, negative direction", category: "Compensation" },
    { code: "G49", desc: "Tool length compensation cancel", category: "Compensation" },
    { code: "G54–G59", desc: "Work coordinate system selection (1–6)", category: "Coordinate System" },
    { code: "G73", desc: "Peck drilling cycle (high-speed)", category: "Canned Cycle" },
    { code: "G74", desc: "Left-hand tapping cycle", category: "Canned Cycle" },
    { code: "G76", desc: "Fine boring cycle", category: "Canned Cycle" },
    { code: "G80", desc: "Canned cycle cancel", category: "Canned Cycle" },
    { code: "G81", desc: "Drilling cycle", category: "Canned Cycle" },
    { code: "G82", desc: "Drilling cycle with dwell (spot facing)", category: "Canned Cycle" },
    { code: "G83", desc: "Peck drilling cycle", category: "Canned Cycle" },
    { code: "G84", desc: "Tapping cycle", category: "Canned Cycle" },
    { code: "G85", desc: "Boring cycle (feed in, feed out)", category: "Canned Cycle" },
    { code: "G90", desc: "Absolute positioning", category: "Positioning Mode" },
    { code: "G91", desc: "Incremental positioning", category: "Positioning Mode" },
    { code: "G92", desc: "Set/shift work coordinate system (or thread cutting on lathes)", category: "Coordinate System" },
    { code: "G94", desc: "Feed per minute mode", category: "Feed Mode" },
    { code: "G95", desc: "Feed per revolution mode", category: "Feed Mode" },
    { code: "G96", desc: "Constant surface speed (CSS) on", category: "Spindle" },
    { code: "G97", desc: "Constant surface speed cancel (constant RPM)", category: "Spindle" },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  M-CODES — Miscellaneous / auxiliary functions
// ═══════════════════════════════════════════════════════════════════════════════
const M_CODES = [
    { code: "M00", desc: "Program stop (unconditional)", category: "Program Control" },
    { code: "M01", desc: "Optional stop (only if stop switch is on)", category: "Program Control" },
    { code: "M02", desc: "End of program", category: "Program Control" },
    { code: "M03", desc: "Spindle start, clockwise (CW)", category: "Spindle" },
    { code: "M04", desc: "Spindle start, counter-clockwise (CCW)", category: "Spindle" },
    { code: "M05", desc: "Spindle stop", category: "Spindle" },
    { code: "M06", desc: "Tool change", category: "Tool Change" },
    { code: "M07", desc: "Coolant on (mist)", category: "Coolant" },
    { code: "M08", desc: "Coolant on (flood)", category: "Coolant" },
    { code: "M09", desc: "Coolant off", category: "Coolant" },
    { code: "M10", desc: "Chuck / clamp open", category: "Workholding" },
    { code: "M11", desc: "Chuck / clamp close", category: "Workholding" },
    { code: "M19", desc: "Spindle orientation (oriented stop)", category: "Spindle" },
    { code: "M30", desc: "End of program, reset to start (with rewind)", category: "Program Control" },
    { code: "M41", desc: "Spindle gear range 1 (low)", category: "Spindle" },
    { code: "M42", desc: "Spindle gear range 2 (high)", category: "Spindle" },
    { code: "M48", desc: "Feed rate/spindle speed override enable", category: "Override" },
    { code: "M49", desc: "Feed rate/spindle speed override disable/cancel", category: "Override" },
    { code: "M98", desc: "Call subprogram", category: "Program Control" },
    { code: "M99", desc: "Return from subprogram / loop in main program", category: "Program Control" },
];

const CATEGORY_COLORS = {
    "Motion": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    "Plane Selection": "bg-purple-500/10 text-purple-700 dark:text-purple-300",
    "Units": "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    "Reference": "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    "Compensation": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    "Coordinate System": "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    "Canned Cycle": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    "Positioning Mode": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    "Feed Mode": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    "Spindle": "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    "Program Control": "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    "Tool Change": "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    "Coolant": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    "Workholding": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    "Override": "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

const CategoryBadge = ({ category }) => (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground"}`}>
        {category}
    </span>
);

const CodeTable = ({ rows }) => (
    <Table>
        <TableHeader>
            <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-48">Category</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {rows.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                        No codes match your search.
                    </TableCell>
                </TableRow>
            ) : (
                rows.map((row) => (
                    <TableRow key={row.code}>
                        <TableCell className="font-mono font-semibold text-primary">{row.code}</TableCell>
                        <TableCell>{row.desc}</TableCell>
                        <TableCell><CategoryBadge category={row.category} /></TableCell>
                    </TableRow>
                ))
            )}
        </TableBody>
    </Table>
);

const GMCodeGuide = () => {
    const [tab, setTab] = useState("G");
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const source = tab === "G" ? G_CODES : M_CODES;
        const q = query.trim().toLowerCase();
        if (!q) return source;
        return source.filter(
            (row) =>
                row.code.toLowerCase().includes(q) ||
                row.desc.toLowerCase().includes(q) ||
                row.category.toLowerCase().includes(q)
        );
    }, [tab, query]);

    return (
        <div className="max-w-4xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Knowledge
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BookOpenText className="h-6 w-6 text-primary" />
                    G-Code & M-Code Guide
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Quick reference for common CNC preparatory (G) and miscellaneous (M) codes. Exact behavior can vary by machine builder/control — always confirm against your machine's manual.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border overflow-hidden text-sm font-semibold">
                    {[
                        { key: "G", label: "G-Codes" },
                        { key: "M", label: "M-Codes" },
                    ].map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-1.5 transition-colors ${tab === t.key
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:bg-muted"
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search code, description, or category..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            <div className="rounded-lg border">
                <CodeTable rows={filtered} />
            </div>
        </div>
    );
};

export default GMCodeGuide;

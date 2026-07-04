import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import {
    ArrowLeft, Crosshair, Play, Pause, StepForward, StepBack,
    RotateCcw, ArrowLeftRight, AlertTriangle, GraduationCap,
    TriangleRight, Spline, Gauge,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  SAMPLE PROGRAMS (ISO / Fanuc-style syntax)
// ═══════════════════════════════════════════════════════════════════════════════
const SAMPLES = [
    {
        name: "Square with corner radius (G01 + G02)",
        code: `; Square 60x60 with R10 corners
G21 G90 G17
G00 X-40 Y-40 Z5
S1200 M03
G00 X-30 Y-20
G01 Z-2 F200 M08
G01 Y20 F400
G02 X-20 Y30 I10 J0
G01 X20
G02 X30 Y20 I0 J-10
G01 Y-20
G02 X20 Y-30 I-10 J0
G01 X-20
G02 X-30 Y-20 I0 J10
G01 Z5 F200
G00 X-40 Y-40 M09
M05
M30`,
    },
    {
        name: "Full circle (G03 with I J)",
        code: `; Circular boundary dia 60
G21 G90 G17
G00 X0 Y-30 Z5
S1500 M03
G01 Z-1 F150 M08
G03 X0 Y-30 I0 J30 F350
G01 Z5 F200
G00 X0 Y0 M09
M05
M30`,
    },
    {
        name: "Slot with 180-degree arcs",
        code: `; Closed slot 50 x R8
G21 G90 G17
G00 X-25 Y-8 Z5
S1000 M03
G01 Z-1.5 F150 M08
G01 X25 F350
G03 X25 Y8 I0 J8
G01 X-25
G03 X-25 Y-8 I0 J-8
G01 Z5 F200
G00 X0 Y0 M09
M05
M30`,
    },
    {
        name: "Bolt-hole circle drilling (G81)",
        code: `; 6 holes on dia 50 PCD
G21 G90 G17
G00 X0 Y0 Z5
S900 M03
G81 X25 Y0 Z-5 R2 F120
X12.5 Y21.65
X-12.5 Y21.65
X-25 Y0
X-12.5 Y-21.65
X12.5 Y-21.65
G80
G00 X0 Y0
M05
M30`,
    },
    {
        name: "Angled ramp — linear interpolation (G01)",
        code: `; Both axes move together in one G01 = an angled straight cut.
; This is exactly how a taper is produced (simultaneous axes).
G21 G90 G17
G00 X-30 Y-30 Z5
S1200 M03
G01 Z-1 F150 M08
G01 X30 Y30 F350   ; X and Y interpolated together -> 45 deg line
G01 X30 Y-30
G01 X-30 Y30
G01 X-30 Y-30
G01 Z5 F200
G00 X0 Y0 M09
M05
M30`,
    },
    {
        name: "Incremental moves (G91)",
        code: `; Staircase using incremental mode
G21 G90 G17
G00 X-30 Y-30 Z5
S1000 M03
G01 Z-1 F150
G91
G01 X15 F300
G01 Y15
G01 X15
G01 Y15
G01 X15
G01 Y15
G01 X15
G90
G01 Z5 F200
G00 X0 Y0
M05
M30`,
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  G-CODE PARSER → list of animatable segments
//  Each segment: { pts: [[x,y,z]...], cum: [..], len, rapid, drill, line, state }
// ═══════════════════════════════════════════════════════════════════════════════
function sampleArc(x0, y0, z0, x1, y1, z1, cx, cy, ccw) {
    const r = Math.hypot(x0 - cx, y0 - cy);
    let a0 = Math.atan2(y0 - cy, x0 - cx);
    let a1 = Math.atan2(y1 - cy, x1 - cx);
    const fullCircle = Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9;
    if (ccw) {
        if (fullCircle) a1 = a0 + 2 * Math.PI;
        else if (a1 <= a0) a1 += 2 * Math.PI;
    } else {
        if (fullCircle) a1 = a0 - 2 * Math.PI;
        else if (a1 >= a0) a1 -= 2 * Math.PI;
    }
    const sweep = a1 - a0;
    const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 32)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = a0 + sweep * t;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * t]);
    }
    return pts;
}

function buildSegment(pts, rapid, drill, line, state) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(
            pts[i][0] - pts[i - 1][0],
            pts[i][1] - pts[i - 1][1],
            pts[i][2] - pts[i - 1][2],
        ));
    }
    return { pts, cum, len: cum[cum.length - 1], rapid, drill, line, state };
}

function parseProgram(text) {
    const rawLines = text.split(/\r?\n/);
    const segments = [];
    const errors = [];
    const pos = { x: 0, y: 0, z: 5 };
    const st = {
        units: "mm", abs: true, motion: null, feed: 0,
        spindle: 0, dir: "OFF", coolant: "OFF", tool: 0, wcs: "G54",
        cycle: null, cycleZ: -5, cycleR: 2,
    };

    rawLines.forEach((raw, idx) => {
        const line = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim().toUpperCase();
        if (!line || line.startsWith("%") || /^O\d+/.test(line)) return;

        const words = {};
        const gCodes = [];
        const mCodes = [];
        for (const m of line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g) ?? []) {
            const letter = m[1];
            const val = parseFloat(m[2]);
            if (Number.isNaN(val)) continue;
            if (letter === "G") gCodes.push(Math.round(val * 10) / 10);
            else if (letter === "M") mCodes.push(Math.round(val));
            else if (letter !== "N") words[letter] = val;
        }

        let isG28 = false;
        for (const g of gCodes) {
            if (g >= 0 && g <= 3) st.motion = g;
            else if (g === 20) st.units = "inch";
            else if (g === 21) st.units = "mm";
            else if (g === 28) isG28 = true;
            else if (g === 80) st.cycle = null;
            else if (g === 81 || g === 82 || g === 83) st.cycle = g;
            else if (g === 90) st.abs = true;
            else if (g === 91) st.abs = false;
            else if (g >= 54 && g <= 59) st.wcs = `G${g}`;
            else if (g === 18 || g === 19) errors.push({ line: idx + 1, msg: `G${g}: only G17 (XY plane) is visualized` });
        }
        for (const m of mCodes) {
            if (m === 3) st.dir = "CW (M03)";
            else if (m === 4) st.dir = "CCW (M04)";
            else if (m === 5) st.dir = "OFF";
            else if (m === 7) st.coolant = "MIST (M07)";
            else if (m === 8) st.coolant = "FLOOD (M08)";
            else if (m === 9) st.coolant = "OFF";
        }
        if (words.F !== undefined) st.feed = words.F;
        if (words.S !== undefined) st.spindle = words.S;
        if (words.T !== undefined) st.tool = words.T;

        const snap = { ...st };
        const hasXY = words.X !== undefined || words.Y !== undefined;
        const hasCoord = hasXY || words.Z !== undefined;

        if (isG28) {
            segments.push(buildSegment([[pos.x, pos.y, pos.z], [0, 0, pos.z], [0, 0, 5]], true, false, idx, snap));
            pos.x = 0; pos.y = 0; pos.z = 5;
            return;
        }

        // Canned drilling cycle: each line with X/Y drills a hole
        if (st.cycle && hasXY) {
            if (words.Z !== undefined) st.cycleZ = words.Z;
            if (words.R !== undefined) st.cycleR = words.R;
            const tx = words.X !== undefined ? (st.abs ? words.X : pos.x + words.X) : pos.x;
            const ty = words.Y !== undefined ? (st.abs ? words.Y : pos.y + words.Y) : pos.y;
            if (tx !== pos.x || ty !== pos.y) {
                segments.push(buildSegment([[pos.x, pos.y, pos.z], [tx, ty, pos.z]], true, false, idx, snap));
            }
            const zTop = Math.max(pos.z, st.cycleR);
            segments.push(buildSegment(
                [[tx, ty, zTop], [tx, ty, st.cycleZ], [tx, ty, zTop]],
                false, true, idx, snap,
            ));
            pos.x = tx; pos.y = ty; pos.z = zTop;
            return;
        }

        if (!hasCoord && words.I === undefined && words.J === undefined) return;
        if (st.motion === null) {
            errors.push({ line: idx + 1, msg: "Coordinates given before any motion mode (G00–G03)" });
            return;
        }

        const tx = words.X !== undefined ? (st.abs ? words.X : pos.x + words.X) : pos.x;
        const ty = words.Y !== undefined ? (st.abs ? words.Y : pos.y + words.Y) : pos.y;
        const tz = words.Z !== undefined ? (st.abs ? words.Z : pos.z + words.Z) : pos.z;

        if (st.motion === 0 || st.motion === 1) {
            if (tx !== pos.x || ty !== pos.y || tz !== pos.z) {
                segments.push(buildSegment(
                    [[pos.x, pos.y, pos.z], [tx, ty, tz]],
                    st.motion === 0, false, idx, snap,
                ));
            }
        } else {
            // G02 / G03 arc
            const ccw = st.motion === 3;
            let cx, cy;
            if (words.I !== undefined || words.J !== undefined) {
                cx = pos.x + (words.I ?? 0);
                cy = pos.y + (words.J ?? 0);
            } else if (words.R !== undefined) {
                const dx = tx - pos.x, dy = ty - pos.y;
                const d = Math.hypot(dx, dy);
                const r = Math.abs(words.R);
                if (d < 1e-9 || d > 2 * r + 1e-6) {
                    errors.push({ line: idx + 1, msg: "Invalid R arc: radius too small for chord (or start = end)" });
                    return;
                }
                const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
                const side = (ccw ? 1 : -1) * (words.R > 0 ? 1 : -1);
                cx = pos.x + dx / 2 + (-dy / d) * h * side;
                cy = pos.y + dy / 2 + (dx / d) * h * side;
            } else {
                errors.push({ line: idx + 1, msg: "Arc needs I/J or R" });
                return;
            }
            segments.push(buildSegment(sampleArc(pos.x, pos.y, pos.z, tx, ty, tz, cx, cy, ccw), false, false, idx, snap));
        }
        pos.x = tx; pos.y = ty; pos.z = tz;
    });

    // Bounds over all points (fallback box if empty)
    let minX = -10, minY = -10, maxX = 10, maxY = 10;
    if (segments.length) {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
        for (const s of segments) for (const p of s.pts) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
        }
    }
    const starts = [0];
    for (const s of segments) starts.push(starts[starts.length - 1] + s.len);
    return { segments, errors, bounds: { minX, minY, maxX, maxY }, starts, total: starts[starts.length - 1] };
}

function positionAt(prog, dist) {
    const { segments, starts } = prog;
    if (!segments.length) return { x: 0, y: 0, z: 0, segIdx: -1 };
    let i = segments.length - 1;
    for (let k = 0; k < segments.length; k++) {
        if (dist < starts[k + 1] || k === segments.length - 1) { i = k; break; }
    }
    const seg = segments[i];
    const local = Math.min(Math.max(dist - starts[i], 0), seg.len);
    let j = 1;
    while (j < seg.cum.length - 1 && seg.cum[j] < local) j++;
    const p0 = seg.pts[j - 1], p1 = seg.pts[j];
    const span = seg.cum[j] - seg.cum[j - 1] || 1;
    const t = (local - seg.cum[j - 1]) / span;
    return {
        x: p0[0] + (p1[0] - p0[0]) * t,
        y: p0[1] + (p1[1] - p0[1]) * t,
        z: p0[2] + (p1[2] - p0[2]) * t,
        segIdx: i,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CANVAS RENDERER — machine-DRO style dark viewport (same in light/dark theme)
// ═══════════════════════════════════════════════════════════════════════════════
const CANVAS = 600;

function drawScene(ctx, prog, dist) {
    const { segments, bounds, starts } = prog;
    const W = CANVAS, H = CANVAS, pad = 44;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    const dx = Math.max(bounds.maxX - bounds.minX, 1);
    const dy = Math.max(bounds.maxY - bounds.minY, 1);
    const scale = Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy);
    const ox = (W - dx * scale) / 2 - bounds.minX * scale;
    const oy = (H - dy * scale) / 2 - bounds.minY * scale;
    const X = (x) => ox + x * scale;
    const Y = (y) => H - (oy + y * scale);

    // Grid with a "nice" step
    const span = Math.max(dx, dy);
    const rough = span / 6;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = "#475569";
    const gx0 = Math.floor((bounds.minX - step) / step) * step;
    const gy0 = Math.floor((bounds.minY - step) / step) * step;
    for (let x = gx0; x <= bounds.maxX + step; x += step) {
        ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); ctx.stroke();
        ctx.fillText(String(Math.round(x * 100) / 100), X(x) + 2, H - 4);
    }
    for (let y = gy0; y <= bounds.maxY + step; y += step) {
        ctx.beginPath(); ctx.moveTo(0, Y(y)); ctx.lineTo(W, Y(y)); ctx.stroke();
        ctx.fillText(String(Math.round(y * 100) / 100), 2, Y(y) - 2);
    }
    // Axes
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

    // Toolpath up to `dist`
    const drawPoly = (pts, upto) => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (let i = 1; i < upto; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    };
    segments.forEach((seg, i) => {
        const end = starts[i + 1];
        if (starts[i] >= dist) return;
        const complete = end <= dist;
        let pts = seg.pts;
        let upto = pts.length;
        if (!complete) {
            const local = dist - starts[i];
            let j = 1;
            while (j < seg.cum.length - 1 && seg.cum[j] < local) j++;
            const p0 = seg.pts[j - 1], p1 = seg.pts[j];
            const spanL = seg.cum[j] - seg.cum[j - 1] || 1;
            const t = (local - seg.cum[j - 1]) / spanL;
            pts = seg.pts.slice(0, j).concat([[
                p0[0] + (p1[0] - p0[0]) * t,
                p0[1] + (p1[1] - p0[1]) * t,
                p0[2] + (p1[2] - p0[2]) * t,
            ]]);
            upto = pts.length;
        }
        if (seg.drill) {
            // Drill mark at the hole position
            const [hx, hy] = seg.pts[0];
            ctx.strokeStyle = complete ? "#4ade80" : "#facc15";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(X(hx), Y(hy), 6, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(X(hx) - 9, Y(hy)); ctx.lineTo(X(hx) + 9, Y(hy));
            ctx.moveTo(X(hx), Y(hy) - 9); ctx.lineTo(X(hx), Y(hy) + 9);
            ctx.stroke();
            return;
        }
        if (seg.rapid) {
            ctx.strokeStyle = "#f87171";
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 5]);
        } else {
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
        }
        drawPoly(pts, upto);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // Tool marker
    const p = positionAt(prog, dist);
    if (p.segIdx >= 0) {
        const cutting = p.z <= 0;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 7, 0, 2 * Math.PI);
        ctx.fillStyle = cutting ? "#facc15" : "#94a3b8";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Legend
    ctx.font = "11px monospace";
    ctx.fillStyle = "#f87171"; ctx.fillText("- - rapid (G00)", W - 130, 18);
    ctx.fillStyle = "#38bdf8"; ctx.fillText("— feed (G01/02/03)", W - 130, 32);
    ctx.fillStyle = "#4ade80"; ctx.fillText("⊕ drilled hole", W - 130, 46);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRAINER TAB
// ═══════════════════════════════════════════════════════════════════════════════
const SPEEDS = [0.5, 1, 2, 4];

const TrainerTab = () => {
    const [code, setCode] = useState(SAMPLES[0].code);
    const [sampleIdx, setSampleIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [, setFrame] = useState(0); // re-render tick for readouts

    const canvasRef = useRef(null);
    const distRef = useRef(0);
    const playRef = useRef(false);
    const speedRef = useRef(1);

    const prog = useMemo(() => parseProgram(code), [code]);
    const progRef = useRef(prog);
    progRef.current = prog;

    const diag = Math.hypot(
        prog.bounds.maxX - prog.bounds.minX,
        prog.bounds.maxY - prog.bounds.minY,
    ) || 1;

    const redraw = () => {
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawScene(ctx, progRef.current, distRef.current);
    };

    // Reset when program changes
    useEffect(() => {
        distRef.current = 0;
        setPlaying(false);
        playRef.current = false;
        redraw();
        setFrame((f) => f + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prog]);

    // Animation loop
    useEffect(() => {
        playRef.current = playing;
        speedRef.current = speed;
        if (!playing) return;
        let last = performance.now();
        let raf;
        const tick = (now) => {
            if (!playRef.current) return;
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            const p = progRef.current;
            const pos = positionAt(p, distRef.current);
            const seg = p.segments[pos.segIdx];
            const rate = seg?.rapid ? diag * 0.9 : diag * 0.22;
            distRef.current = Math.min(distRef.current + rate * speedRef.current * dt, p.total);
            redraw();
            setFrame((f) => f + 1);
            if (distRef.current >= p.total) {
                setPlaying(false);
                playRef.current = false;
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, speed]);

    const pos = positionAt(prog, distRef.current);
    const curSeg = pos.segIdx >= 0 ? prog.segments[pos.segIdx] : null;
    const stateNow = curSeg?.state;
    const curLine = curSeg?.line ?? -1;
    const codeLines = code.split(/\r?\n/);
    const done = prog.total > 0 && distRef.current >= prog.total;

    const jumpToLine = (lineIdx) => {
        const i = prog.segments.findIndex((s) => s.line === lineIdx);
        if (i < 0) return;
        distRef.current = prog.starts[i] + 0.001;
        setPlaying(false);
        redraw();
        setFrame((f) => f + 1);
    };
    const stepFwd = () => {
        if (pos.segIdx < 0) return;
        distRef.current = Math.min(prog.starts[pos.segIdx + 1] + 0.001, prog.total);
        setPlaying(false);
        redraw();
        setFrame((f) => f + 1);
    };
    const stepBack = () => {
        if (pos.segIdx < 0) return;
        const atStart = distRef.current - prog.starts[pos.segIdx] < 0.01;
        const target = atStart ? Math.max(pos.segIdx - 1, 0) : pos.segIdx;
        distRef.current = prog.starts[target] + 0.001;
        setPlaying(false);
        redraw();
        setFrame((f) => f + 1);
    };
    const reset = () => {
        distRef.current = 0;
        setPlaying(false);
        redraw();
        setFrame((f) => f + 1);
    };

    return (
        <div className="grid lg:grid-cols-2 gap-6">
            {/* LEFT: editor + program listing */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium shrink-0">Sample:</label>
                    <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={sampleIdx}
                        onChange={(e) => {
                            const i = parseInt(e.target.value, 10);
                            setSampleIdx(i);
                            setCode(SAMPLES[i].code);
                        }}
                    >
                        {SAMPLES.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className="text-sm font-medium">Program editor <span className="text-muted-foreground font-normal">(edit and it re-parses live)</span></label>
                    <textarea
                        spellCheck={false}
                        className="mt-1.5 w-full h-56 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                </div>

                {prog.errors.length > 0 && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive space-y-1">
                        {prog.errors.map((er, i) => (
                            <p key={i} className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Line {er.line}: {er.msg}
                            </p>
                        ))}
                    </div>
                )}

                <div>
                    <p className="text-sm font-medium mb-1.5">Program steps <span className="text-muted-foreground font-normal">(click a motion line to jump there)</span></p>
                    <div className="rounded-md border bg-muted/30 max-h-64 overflow-y-auto font-mono text-xs">
                        {codeLines.map((ln, i) => {
                            const hasMotion = prog.segments.some((s) => s.line === i);
                            const active = i === curLine;
                            return (
                                <div
                                    key={i}
                                    onClick={() => jumpToLine(i)}
                                    className={`px-3 py-0.5 flex gap-3 ${hasMotion ? "cursor-pointer hover:bg-muted" : "opacity-50"} ${active ? "bg-primary text-primary-foreground hover:bg-primary" : ""}`}
                                >
                                    <span className={`w-7 text-right shrink-0 ${active ? "" : "text-muted-foreground"}`}>{i + 1}</span>
                                    <span className="whitespace-pre">{ln || " "}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* RIGHT: viewport + controls + DRO */}
            <div className="space-y-4">
                <canvas
                    ref={canvasRef}
                    width={CANVAS}
                    height={CANVAS}
                    className="w-full h-auto rounded-lg border"
                />

                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => setPlaying(!playing)} disabled={prog.total === 0 || done}>
                        {playing ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                        {playing ? "Pause" : done ? "Finished" : "Play"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={stepBack} disabled={prog.total === 0}>
                        <StepBack className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Button size="sm" variant="outline" onClick={stepFwd} disabled={prog.total === 0}>
                        <StepForward className="h-4 w-4 mr-1" /> Step
                    </Button>
                    <Button size="sm" variant="outline" onClick={reset} disabled={prog.total === 0}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Reset
                    </Button>
                    <div className="flex rounded-md border overflow-hidden text-xs font-semibold ml-auto">
                        {SPEEDS.map((s) => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                className={`px-2.5 py-1.5 transition-colors ${speed === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                            >
                                {s}×
                            </button>
                        ))}
                    </div>
                </div>

                {/* DRO / modal state panel */}
                <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm font-mono">
                    <div><span className="text-muted-foreground">X </span><span className="font-bold">{pos.x.toFixed(2)}</span></div>
                    <div><span className="text-muted-foreground">Y </span><span className="font-bold">{pos.y.toFixed(2)}</span></div>
                    <div><span className="text-muted-foreground">Z </span><span className={`font-bold ${pos.z <= 0 ? "text-yellow-600 dark:text-yellow-400" : ""}`}>{pos.z.toFixed(2)}</span></div>
                    <div><span className="text-muted-foreground">Mode </span><span className="font-bold">{stateNow ? (stateNow.cycle ? `G${stateNow.cycle}` : `G0${stateNow.motion ?? 0}`) : "—"}</span></div>
                    <div><span className="text-muted-foreground">Feed </span><span className="font-bold">F{stateNow?.feed ?? 0}</span></div>
                    <div><span className="text-muted-foreground">Spindle </span><span className="font-bold">S{stateNow?.spindle ?? 0}</span></div>
                    <div><span className="text-muted-foreground">Dir </span><span className="font-bold">{stateNow?.dir ?? "OFF"}</span></div>
                    <div><span className="text-muted-foreground">Coolant </span><span className="font-bold">{stateNow?.coolant ?? "OFF"}</span></div>
                    <div><span className="text-muted-foreground">{stateNow?.abs === false ? "G91 INC" : "G90 ABS"}</span> <span className="font-bold">{stateNow?.units ?? "mm"}</span></div>
                </div>

                {curSeg && (
                    <div className="rounded-md border px-3 py-2 text-sm font-mono bg-background">
                        <span className="text-muted-foreground mr-2">Executing N{curLine + 1}:</span>
                        <span className="font-semibold">{codeLines[curLine]?.trim()}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  FANUC vs SIEMENS COMPARISON TAB
// ═══════════════════════════════════════════════════════════════════════════════
const G_DIFF = [
    { fn: "Inch / metric input", fanuc: "G20 / G21", siemens: "G70 / G71 (G700/G710 incl. feed)", note: "⚠ On a Fanuc LATHE, G70/G71 are finishing/roughing canned cycles — classic cross-control trap." },
    { fn: "Tool length compensation", fanuc: "G43 H01 (H = offset register)", siemens: "Automatic via D number (T1 D1)", note: "Siemens needs no G43 — length comes from the tool edge data." },
    { fn: "Cutter radius compensation", fanuc: "G41 / G42 / G40 + D register", siemens: "G41 / G42 / G40 + D edge data", note: "Same G-codes, different offset storage." },
    { fn: "Work offsets", fanuc: "G54–G59, extended G54.1 P1…", siemens: "G54–G57, G505–G599 + TRANS/ATRANS frames", note: "Siemens frames allow programmable shift/rotate/mirror/scale." },
    { fn: "Drilling cycles", fanuc: "G81 / G82 / G83 / G84 (modal)", siemens: "CYCLE81 / 82 / 83 / 84 (+ MCALL for modal)", note: "Siemens cycles are parameterized subprogram calls, not G-codes." },
    { fn: "Dwell", fanuc: "G04 P (ms) or X (sec)", siemens: "G4 F (sec) or S (spindle rev)", note: "" },
    { fn: "Reference point return", fanuc: "G28 (via intermediate point)", siemens: "G74 (reference approach), G75 (fixed point)", note: "⚠ On Fanuc, G74 is a tapping/grooving cycle and G75 a grooving cycle." },
    { fn: "Constant surface speed (lathe)", fanuc: "G96 / G97, limit via G50 S", siemens: "G96 / G97, limit via LIMS=", note: "" },
    { fn: "Coordinate rotate / scale / mirror", fanuc: "G68 / G51 / G50.1–G51.1", siemens: "ROT / SCALE / MIRROR (frame ops)", note: "" },
    { fn: "Diameter programming (lathe)", fanuc: "X is diameter by parameter setting", siemens: "DIAMON / DIAMOF / DIAM90", note: "" },
    { fn: "Polar coordinates", fanuc: "G15 / G16", siemens: "AP= / RP= words, POLAR", note: "" },
    { fn: "Set position / thread (lathe)", fanuc: "G92 (coordinate set / thread cycle)", siemens: "Threads via CYCLE97; frames instead of G92", note: "" },
];

const M_DIFF = [
    { fn: "Program stop / optional stop", fanuc: "M00 / M01", siemens: "M0 / M1", same: true },
    { fn: "Program end", fanuc: "M02 or M30", siemens: "M2 or M30", same: true },
    { fn: "Spindle CW / CCW / stop", fanuc: "M03 / M04 / M05", siemens: "M3 / M4 / M5", same: true },
    { fn: "Tool change", fanuc: "T01 M06", siemens: 'T1 M6 or T="DRILL_12" M6', same: true },
    { fn: "Coolant mist / flood / off", fanuc: "M07 / M08 / M09", siemens: "M7 / M8 / M9", same: true },
    { fn: "Subprogram call", fanuc: "M98 P1234 L5", siemens: "Direct name call: L10 or MYSUB P5", same: false },
    { fn: "Subprogram end / return", fanuc: "M99", siemens: "M17 or RET", same: false },
    { fn: "Gear range", fanuc: "M41 / M42 (builder-defined)", siemens: "M41–M45 (builder-defined)", same: true },
];

const STRUCT_DIFF = [
    { topic: "Program identity", fanuc: "O-number (O1234) at program head", siemens: "File name: PART1.MPF (main) / .SPF (sub)" },
    { topic: "Comments", fanuc: "(text in parentheses)", siemens: "; text after a semicolon" },
    { topic: "Block numbers", fanuc: "N words optional, often sparse", siemens: "N words optional; labels LABEL: for jumps" },
    { topic: "Variables / macros", fanuc: "Macro B: #1–#33 local, #100/#500 common, GOTO / IF […] THEN", siemens: "R-parameters R0–R99 + high-level language: DEF, IF/ELSE, WHILE, FOR, CASE" },
    { topic: "Arithmetic", fanuc: "#1 = #2 * SIN[#3]  (square brackets)", siemens: "R1 = R2 * SIN(R3)  (round brackets)" },
    { topic: "Modal cycle call", fanuc: "Cycle stays modal until G80", siemens: "MCALL CYCLE81(…) … MCALL (empty cancels)" },
];

const CompareTab = () => (
    <div className="space-y-8">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
            <p>
                Both controls execute ISO-style part programs, and the core motion codes
                (<span className="font-mono">G00 G01 G02 G03</span>, <span className="font-mono">G90/G91</span>,{" "}
                <span className="font-mono">G41/G42</span>, <span className="font-mono">M3/M5/M8</span>) behave the same.
                The differences concentrate in four areas: <strong>units &amp; compensation handling</strong>,{" "}
                <strong>canned cycles</strong> (Fanuc uses modal G-codes, Siemens uses CYCLE… subprogram calls),{" "}
                <strong>program structure &amp; parametric language</strong> (Macro B vs Siemens high-level language),
                and a handful of <strong>same-number-different-meaning codes</strong> that cause real crashes when
                operators move between machines.
            </p>
        </div>

        <div className="rounded-lg border-2 border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 p-4 text-sm">
            <p className="font-bold flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-2">
                <AlertTriangle className="h-4 w-4" /> Same code, different meaning — memorize these
            </p>
            <ul className="space-y-1.5 text-orange-900 dark:text-orange-200">
                <li><span className="font-mono font-bold">G70/G71</span> — Siemens: inch/metric selection. Fanuc lathe: finishing / stock-removal roughing cycles.</li>
                <li><span className="font-mono font-bold">G74</span> — Siemens: reference-point approach. Fanuc: left-hand tapping (mill) / peck face grooving (lathe).</li>
                <li><span className="font-mono font-bold">G75</span> — Siemens: fixed-point approach. Fanuc lathe: grooving cycle.</li>
                <li><span className="font-mono font-bold">G92</span> — Fanuc: coordinate-system set / thread cycle. Siemens: spindle speed limit context (G92 S… on some versions); frames are used instead.</li>
            </ul>
        </div>

        <section className="space-y-3">
            <h2 className="text-lg font-bold">Program structure &amp; language</h2>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Topic</TableHead>
                            <TableHead>Fanuc</TableHead>
                            <TableHead>Siemens (SINUMERIK)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {STRUCT_DIFF.map((r) => (
                            <TableRow key={r.topic}>
                                <TableCell className="font-medium">{r.topic}</TableCell>
                                <TableCell className="font-mono text-xs">{r.fanuc}</TableCell>
                                <TableCell className="font-mono text-xs">{r.siemens}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </section>

        <section className="space-y-3">
            <h2 className="text-lg font-bold">G-code differences</h2>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Function</TableHead>
                            <TableHead>Fanuc</TableHead>
                            <TableHead>Siemens</TableHead>
                            <TableHead>Notes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {G_DIFF.map((r) => (
                            <TableRow key={r.fn}>
                                <TableCell className="font-medium">{r.fn}</TableCell>
                                <TableCell className="font-mono text-xs">{r.fanuc}</TableCell>
                                <TableCell className="font-mono text-xs">{r.siemens}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{r.note}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </section>

        <section className="space-y-3">
            <h2 className="text-lg font-bold">M-code comparison</h2>
            <p className="text-sm text-muted-foreground">
                M-codes are mostly identical because they follow the ISO convention — the differences are in subprogram handling.
                Above M30, all M-codes are machine-builder defined on both controls.
            </p>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Function</TableHead>
                            <TableHead>Fanuc</TableHead>
                            <TableHead>Siemens</TableHead>
                            <TableHead className="w-24">Same?</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {M_DIFF.map((r) => (
                            <TableRow key={r.fn}>
                                <TableCell className="font-medium">{r.fn}</TableCell>
                                <TableCell className="font-mono text-xs">{r.fanuc}</TableCell>
                                <TableCell className="font-mono text-xs">{r.siemens}</TableCell>
                                <TableCell>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.same ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                                        {r.same ? "Same" : "Differs"}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </section>

        <section className="space-y-3">
            <h2 className="text-lg font-bold">Same part, both dialects</h2>
            <div className="grid md:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Fanuc — drill 3 holes</CardTitle>
                        <CardDescription className="text-xs">Modal G81, cancelled by G80</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs font-mono bg-muted/60 rounded-md p-3 overflow-x-auto">{`O0001
(DRILL PLATE)
G21 G90 G54
T01 M06
S900 M03
G00 X20. Y20. Z5. M08
G81 Z-8. R2. F120
X40.
X60.
G80
G00 Z50. M09
M05
M30`}</pre>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Siemens — drill 3 holes</CardTitle>
                        <CardDescription className="text-xs">MCALL makes CYCLE81 modal</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-xs font-mono bg-muted/60 rounded-md p-3 overflow-x-auto">{`; DRILL_PLATE.MPF
G71 G90 G54
T="DRILL_8" M6
S900 M3
G0 X20 Y20 Z5 M8
MCALL CYCLE81(5,0,2,-8)
X20 Y20
X40
X60
MCALL
G0 Z50 M9
M5
M30`}</pre>
                    </CardContent>
                </Card>
            </div>
        </section>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERACTIVE CONCEPTS TAB — taper, interpolation, constant surface speed
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = (n, d = 2) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : "∞");

const Slider = ({ label, value, set, min, max, step = 1, unit = "" }) => (
    <div>
        <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{label}</span>
            <span className="font-mono text-primary font-semibold">{value}{unit}</span>
        </div>
        <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={(e) => set(parseFloat(e.target.value))}
            className="w-full accent-primary cursor-pointer"
        />
    </div>
);

const CodeBlock = ({ children }) => (
    <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-md p-3 overflow-x-auto leading-relaxed">{children}</pre>
);

// ── Taper turning ───────────────────────────────────────────────────────────────
const TaperWidget = () => {
    const [d1, setD1] = useState(50);
    const [d2, setD2] = useState(30);
    const [len, setLen] = useState(40);

    const big = Math.max(d1, d2);
    const small = Math.min(d1, d2);
    const dd = big - small;
    const halfAngle = (Math.atan2(dd / 2, len) * 180) / Math.PI; // from centreline
    const included = halfAngle * 2;
    const taperOnDia = dd / len;                                  // mm per mm
    const ratio = dd > 0 ? len / dd : Infinity;                  // 1 : ratio

    // schematic (uniform scale so the angle is truthful)
    const W = 380, H = 210, cy = H / 2;
    const s = Math.min((W - 90) / len, (H - 40) / big);
    const zpx = len * s, x0 = (W - zpx) / 2, x1 = x0 + zpx;
    const r1 = (big / 2) * s, r2 = (small / 2) * s;

    const prog = `( Taper  O${big} -> O${small}  over ${len} mm )
G0 X${big} Z2          ; rapid to large dia, 2mm clear
G1 Z0 F0.2            ; touch the face
G1 X${small} Z-${len}       ; X and Z move together = the taper
G1 X${big + 2}           ; retract clear
G0 Z2`;

    return (
        <div className="grid md:grid-cols-2 gap-5 items-start">
            <div className="space-y-4">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border bg-slate-900">
                    {/* stock as a trapezoid mirrored about the centreline */}
                    <polygon
                        points={`${x0},${cy - r1} ${x1},${cy - r2} ${x1},${cy + r2} ${x0},${cy + r1}`}
                        fill="#1e3a5f" stroke="#38bdf8" strokeWidth="1"
                    />
                    {/* taper cut edge highlighted */}
                    <line x1={x0} y1={cy - r1} x2={x1} y2={cy - r2} stroke="#facc15" strokeWidth="2.5" />
                    <line x1={x0} y1={cy + r1} x2={x1} y2={cy + r2} stroke="#facc15" strokeWidth="2.5" />
                    {/* centreline */}
                    <line x1={x0 - 20} y1={cy} x2={x1 + 20} y2={cy} stroke="#64748b" strokeWidth="1" strokeDasharray="6 4" />
                    {/* dimension text */}
                    <text x={x0 - 6} y={cy - r1 - 6} fill="#e2e8f0" fontSize="11" textAnchor="middle" fontFamily="monospace">{"Ø" + big}</text>
                    <text x={x1 + 6} y={cy - r2 - 6} fill="#e2e8f0" fontSize="11" textAnchor="middle" fontFamily="monospace">{"Ø" + small}</text>
                    <text x={(x0 + x1) / 2} y={cy + Math.max(r1, r2) + 18} fill="#94a3b8" fontSize="11" textAnchor="middle" fontFamily="monospace">Z = {len} mm</text>
                    <text x={x1 - 4} y={cy - 6} fill="#facc15" fontSize="11" textAnchor="end" fontFamily="monospace">{fmt(halfAngle, 1)}&#176;</text>
                </svg>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm rounded-lg border bg-muted/30 p-3">
                    <div><span className="text-muted-foreground">Included angle </span><span className="font-mono font-bold">{fmt(included, 2)}&#176;</span></div>
                    <div><span className="text-muted-foreground">Half angle </span><span className="font-mono font-bold">{fmt(halfAngle, 2)}&#176;</span></div>
                    <div><span className="text-muted-foreground">Taper / length </span><span className="font-mono font-bold">{fmt(taperOnDia, 3)}</span></div>
                    <div><span className="text-muted-foreground">Ratio </span><span className="font-mono font-bold">1 : {fmt(ratio, 1)}</span></div>
                </div>
            </div>

            <div className="space-y-4">
                <Slider label="Large diameter" value={d1} set={setD1} min={10} max={80} unit=" mm" />
                <Slider label="Small diameter" value={d2} set={setD2} min={4} max={80} unit=" mm" />
                <Slider label="Taper length (Z)" value={len} set={setLen} min={10} max={120} unit=" mm" />
                <CodeBlock>{prog}</CodeBlock>
                <p className="text-xs text-muted-foreground">
                    The whole taper is a single <span className="font-mono text-foreground">G01</span> block where
                    X (diameter) and Z (length) are commanded at once. The control interpolates them together so the
                    tool travels a straight, angled line &mdash; that angled line is the taper.
                </p>
            </div>
        </div>
    );
};

// ── Linear vs circular interpolation ────────────────────────────────────────────
const InterpWidget = () => {
    const [mode, setMode] = useState("G02");
    const [R, setR] = useState(30);
    const [sweep, setSweep] = useState(120);
    const [ex, setEx] = useState(40);
    const [ey, setEy] = useState(25);

    const W = 340, H = 300, cx = W / 2, cyp = H / 2, s = 1.9;
    const P = (x, y) => [cx + x * s, cyp - y * s];
    const isArc = mode !== "G01";

    // Build geometry
    let start, end, pts = [], I = 0, J = 0;
    if (isArc) {
        const a0 = Math.PI; // start at 180deg -> (-R, 0)
        const dir = mode === "G03" ? 1 : -1;
        const a1 = a0 + dir * (sweep * Math.PI) / 180;
        start = [R * Math.cos(a0), R * Math.sin(a0)];
        end = [R * Math.cos(a1), R * Math.sin(a1)];
        I = 0 - start[0]; J = 0 - start[1];
        const n = 72;
        for (let i = 0; i <= n; i++) {
            const a = a0 + (a1 - a0) * (i / n);
            pts.push(P(R * Math.cos(a), R * Math.sin(a)));
        }
    } else {
        start = [-40, -20];
        end = [ex, ey];
        pts = [P(start[0], start[1]), P(end[0], end[1])];
    }
    const [sx, sy] = P(start[0], start[1]);
    const [epx, epy] = P(end[0], end[1]);
    const [ccx, ccy] = P(0, 0);

    const grid = [];
    for (let g = -60; g <= 60; g += 20) {
        grid.push(<line key={"v" + g} x1={P(g, -70)[0]} y1={0} x2={P(g, 70)[0]} y2={H} stroke="#1e293b" strokeWidth="1" />);
        grid.push(<line key={"h" + g} x1={0} y1={P(-70, g)[1]} x2={W} y2={P(70, g)[1]} stroke="#1e293b" strokeWidth="1" />);
    }

    const prog = isArc
        ? `G0 X${fmt(start[0])} Y${fmt(start[1])}
${mode} X${fmt(end[0])} Y${fmt(end[1])} I${fmt(I)} J${fmt(J)}
;      ^ end point        ^ vector start -> centre`
        : `G0 X${fmt(start[0])} Y${fmt(start[1])}
G01 X${fmt(end[0])} Y${fmt(end[1])} F300
;   straight line, both axes interpolated together`;

    return (
        <div className="grid md:grid-cols-2 gap-5 items-start">
            <div className="space-y-3">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border bg-slate-900">
                    {grid}
                    <line x1={ccx} y1={0} x2={ccx} y2={H} stroke="#334155" strokeWidth="1.2" />
                    <line x1={0} y1={ccy} x2={W} y2={ccy} stroke="#334155" strokeWidth="1.2" />
                    {isArc && (
                        <>
                            {/* radius + I/J vector */}
                            <line x1={sx} y1={sy} x2={ccx} y2={ccy} stroke="#f472b6" strokeWidth="1.5" strokeDasharray="4 3" />
                            <circle cx={ccx} cy={ccy} r="3" fill="#f472b6" />
                            <text x={(sx + ccx) / 2} y={(sy + ccy) / 2 - 4} fill="#f472b6" fontSize="10" fontFamily="monospace">I,J</text>
                        </>
                    )}
                    <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                    <circle cx={sx} cy={sy} r="5" fill="#4ade80" />
                    <text x={sx + 7} y={sy + 4} fill="#4ade80" fontSize="10" fontFamily="monospace">start</text>
                    <circle cx={epx} cy={epy} r="5" fill="#f87171" />
                    <text x={epx + 7} y={epy + 4} fill="#f87171" fontSize="10" fontFamily="monospace">end</text>
                </svg>
                <div className="flex rounded-md border overflow-hidden text-xs font-semibold">
                    {[
                        { k: "G01", t: "G01 line" },
                        { k: "G02", t: "G02 CW arc" },
                        { k: "G03", t: "G03 CCW arc" },
                    ].map((m) => (
                        <button key={m.k} onClick={() => setMode(m.k)}
                            className={`flex-1 px-2 py-1.5 transition-colors ${mode === m.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                            {m.t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                {isArc ? (
                    <>
                        <Slider label="Arc radius (R)" value={R} set={setR} min={10} max={60} unit=" mm" />
                        <Slider label="Sweep angle" value={sweep} set={setSweep} min={20} max={340} unit="&#176;" />
                    </>
                ) : (
                    <>
                        <Slider label="End X" value={ex} set={setEx} min={-60} max={60} unit=" mm" />
                        <Slider label="End Y" value={ey} set={setEy} min={-60} max={60} unit=" mm" />
                    </>
                )}
                <CodeBlock>{prog}</CodeBlock>
                <p className="text-xs text-muted-foreground">
                    {isArc ? (
                        <>Circular interpolation cuts an arc. You give the <strong>end point</strong> (X, Y) plus{" "}
                            <strong>I, J</strong> &mdash; the vector <em>from the start point to the arc centre</em>.
                            Watch the pink dashed I/J vector: it always points at the centre, never at the end point.
                            <span className="font-mono"> G02</span> = clockwise, <span className="font-mono">G03</span> = counter-clockwise.</>
                    ) : (
                        <>Linear interpolation cuts a straight line from the current position to the end point at the
                            programmed feed. When more than one axis changes, the control moves them in proportion so the
                            tool follows one straight, coordinated line.</>
                    )}
                </p>
            </div>
        </div>
    );
};

// ── Constant surface speed (G96 / G97) ──────────────────────────────────────────
const CSSWidget = () => {
    const [vc, setVc] = useState(180);
    const [dia, setDia] = useState(60);
    const [clamp, setClamp] = useState(3000);

    const rpmRaw = (1000 * vc) / (Math.PI * dia);
    const rpm = Math.min(rpmRaw, clamp);
    const clampedNow = rpmRaw > clamp;

    // chart: rpm vs diameter
    const W = 380, H = 200, pad = 34;
    const Dmax = 200, Dmin = 2;
    const yMax = clamp * 1.15;
    const px = (D) => pad + ((D - Dmin) / (Dmax - Dmin)) * (W - pad - 10);
    const py = (r) => H - pad - (Math.min(r, yMax) / yMax) * (H - pad - 12);
    const rpmAt = (D) => Math.min((1000 * vc) / (Math.PI * D), clamp);

    const curve = [];
    for (let D = Dmin; D <= Dmax; D += 2) curve.push(`${px(D)},${py(rpmAt(D))}`);

    return (
        <div className="grid md:grid-cols-2 gap-5 items-start">
            <div className="space-y-4">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border bg-slate-900">
                    {/* clamp line */}
                    <line x1={pad} y1={py(clamp)} x2={W - 10} y2={py(clamp)} stroke="#f87171" strokeWidth="1" strokeDasharray="5 4" />
                    <text x={W - 12} y={py(clamp) - 4} fill="#f87171" fontSize="10" textAnchor="end" fontFamily="monospace">rpm limit {clamp}</text>
                    {/* axes */}
                    <line x1={pad} y1={H - pad} x2={W - 10} y2={H - pad} stroke="#475569" strokeWidth="1" />
                    <line x1={pad} y1={12} x2={pad} y2={H - pad} stroke="#475569" strokeWidth="1" />
                    {/* curve */}
                    <polyline points={curve.join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                    {/* current point */}
                    <line x1={px(dia)} y1={12} x2={px(dia)} y2={H - pad} stroke="#facc15" strokeWidth="1" strokeDasharray="3 3" />
                    <circle cx={px(dia)} cy={py(rpm)} r="5" fill="#facc15" />
                    <text x={pad + 4} y={22} fill="#94a3b8" fontSize="10" fontFamily="monospace">spindle rpm</text>
                    <text x={W - 12} y={H - pad + 14} fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="monospace">diameter (mm) &rarr;</text>
                </svg>
                <div className="rounded-lg border bg-muted/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Spindle speed at &#8960;{dia} mm</p>
                    <p className="text-3xl font-mono font-bold">{fmt(rpm, 0)} <span className="text-base font-normal text-muted-foreground">rpm</span></p>
                    {clampedNow && <p className="text-xs text-red-600 dark:text-red-400 mt-1">Clamped by rpm limit (would be {fmt(rpmRaw, 0)} rpm)</p>}
                </div>
            </div>

            <div className="space-y-4">
                <Slider label="Cutting speed Vc" value={vc} set={setVc} min={30} max={400} unit=" m/min" />
                <Slider label="Current diameter" value={dia} set={setDia} min={2} max={200} unit=" mm" />
                <Slider label="Max rpm clamp" value={clamp} set={setClamp} min={500} max={6000} step={100} unit=" rpm" />
                <div className="rounded-md bg-muted/60 p-3 text-xs font-mono text-muted-foreground">
                    <p className="text-foreground font-semibold mb-1">rpm = (1000 &times; Vc) / (&#960; &times; D)</p>
                    <p>= (1000 &times; {vc}) / (&#960; &times; {dia}) = {fmt(rpmRaw, 0)} rpm</p>
                </div>
                <CodeBlock>{`Fanuc:
  G96 S${vc}        ; constant surface speed ${vc} m/min
  G50 S${clamp}      ; spindle rpm limit
  ...
  G97 S${fmt(rpm, 0)}       ; cancel CSS -> fixed rpm

Siemens:
  G96 S${vc} LIMS=${clamp}
  ...
  G97               ; back to constant rpm`}</CodeBlock>
                <p className="text-xs text-muted-foreground">
                    Under <span className="font-mono text-foreground">G96</span> the control holds the cutting speed at the
                    tool edge constant. As a facing tool moves toward centre the diameter shrinks, so the spindle rpm rises
                    (the curve climbs) until it hits the <span className="font-mono text-foreground">G50 / LIMS</span> clamp.
                    Constant surface speed is what keeps the <strong>surface finish</strong> even across a face.
                </p>
            </div>
        </div>
    );
};

const ConceptSection = ({ icon: Icon, title, blurb, children }) => (
    <section className="space-y-4">
        <div className="flex items-start gap-2 border-b pb-3">
            <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
                <h2 className="text-lg font-bold">{title}</h2>
                <p className="text-sm text-muted-foreground">{blurb}</p>
            </div>
        </div>
        {children}
    </section>
);

const ConceptsTab = () => (
    <div className="space-y-10">
        <ConceptSection
            icon={Spline}
            title="Interpolation — how the machine draws lines and arcs"
            blurb="Interpolation is the control moving several axes together in a coordinated way. G01 gives straight lines; G02/G03 give arcs. Change the mode and drag the sliders."
        >
            <InterpWidget />
        </ConceptSection>

        <ConceptSection
            icon={TriangleRight}
            title="Taper turning — a taper is just linear interpolation"
            blurb="Command X (diameter) and Z (length) in the same G01 block and the tool cuts a straight angled line. Adjust the diameters and length to see the angle and program update live."
        >
            <TaperWidget />
        </ConceptSection>

        <ConceptSection
            icon={Gauge}
            title="Constant surface speed (G96 / G97) — even surface finish"
            blurb="G96 holds cutting speed constant at the tool edge, so rpm changes with diameter. This is the mode that keeps surface finish uniform when facing."
        >
            <CSSWidget />
        </ConceptSection>

        <div className="rounded-lg border-2 border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm">
            <p className="font-bold text-blue-700 dark:text-blue-300 mb-1">Don&apos;t confuse G96 with G91</p>
            <p className="text-blue-900 dark:text-blue-200">
                <span className="font-mono font-bold">G96</span> is constant <em>surface speed</em> (a spindle mode that
                affects finish). <span className="font-mono font-bold">G91</span> is <em>incremental positioning</em>
                &mdash; a completely different thing, where every coordinate is measured from the current point instead of
                from the work zero. You can see G91 in action in the &ldquo;Incremental moves&rdquo; sample on the Visual Trainer tab.
            </p>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const GCodeTrainer = () => {
    const [tab, setTab] = useState("trainer");

    return (
        <div className="max-w-6xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Knowledge
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Crosshair className="h-6 w-6 text-primary" />
                    G-Code Trainer &amp; Simulator
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Write ISO/Fanuc-style G-code and watch the toolpath execute live — rapids, feeds, arcs and drilling cycles.
                    Plus a Fanuc ↔ Siemens dialect comparison.
                </p>
            </div>

            <div className="flex rounded-lg border overflow-hidden text-sm font-semibold w-fit">
                {[
                    { key: "trainer", label: "Visual Trainer", icon: Play },
                    { key: "concepts", label: "Concepts (Taper, Arcs, CSS)", icon: GraduationCap },
                    { key: "compare", label: "Fanuc vs Siemens", icon: ArrowLeftRight },
                ].map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2 inline-flex items-center gap-1.5 transition-colors ${tab === t.key
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:bg-muted"
                                }`}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === "trainer" ? <TrainerTab /> : tab === "concepts" ? <ConceptsTab /> : <CompareTab />}
        </div>
    );
};

export default GCodeTrainer;

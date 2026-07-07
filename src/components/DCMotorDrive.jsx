import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft, Zap, Cog, Gauge, TrendingUp, Magnet, AlertTriangle,
    Cpu, ClipboardList, ShieldAlert, CheckCircle2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS  (same look & feel as the G-Code trainer concepts)
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = (n, d = 1) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : "∞");
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const round1 = (n) => Math.round(n * 10) / 10;

const Slider = ({ label, value, set, min, max, step = 1, unit = "", disabled }) => (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{label}</span>
            <span className="font-mono text-primary font-semibold">{value}{unit}</span>
        </div>
        <input
            type="range" min={min} max={max} step={step} value={value} disabled={disabled}
            onChange={(e) => set(parseFloat(e.target.value))}
            className="w-full accent-primary cursor-pointer disabled:cursor-not-allowed"
        />
    </div>
);

const Stat = ({ label, value, unit, tone = "" }) => (
    <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-mono font-bold ${tone}`}>
            {value}<span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
        </p>
    </div>
);

// ── Motor nameplate → machine constants ─────────────────────────────────────────
// Everything the Playground and DC Drive tabs compute is scaled from the nameplate,
// exactly like a real drive scales its model from the entered motor data.
const DEFAULT_NAMEPLATE = { vRated: 440, iRated: 100, nBase: 1500, nMax: 3000, ra: 0.5, ifRated: 1.5 };

const NAMEPLATE_PRESETS = [
    { name: "40 kW · 440 V · 1500 rpm", np: { vRated: 440, iRated: 100, nBase: 1500, nMax: 3000, ra: 0.5, ifRated: 1.5 } },
    { name: "7.5 kW · 400 V · 1750 rpm", np: { vRated: 400, iRated: 21, nBase: 1750, nMax: 2600, ra: 2.6, ifRated: 0.9 } },
    { name: "150 kW · 600 V · 1000 rpm", np: { vRated: 600, iRated: 270, nBase: 1000, nMax: 2000, ra: 0.12, ifRated: 6.0 } },
];

function deriveMotor(np) {
    const omegaBase = (2 * Math.PI * np.nBase) / 60;                 // rad/s
    const kRated = omegaBase > 0 ? (np.vRated - np.iRated * np.ra) / omegaBase : 0; // kφ at full flux
    const tRated = kRated * np.iRated;                              // N·m
    const pRated = tRated * omegaBase;                              // W
    const fwRatio = np.nBase > 0 ? np.nMax / np.nBase : 1;
    return { omegaBase, kRated, tRated, pRated, fwRatio };
}

// Magnetization curve: flux vs field current, normalised so φ = 100% at rated field
// current. The curve saturates near rated (small drops in I_f barely change flux),
// then falls faster below the knee — which is exactly how field weakening behaves.
const IF_SAT = 0.7;
const fluxPctFromIf = (ifCur, ifRated) => {
    const x = ifRated > 0 ? ifCur / ifRated : 0;
    const pu = ((1 + IF_SAT) * x) / (1 + IF_SAT * x);
    return clamp(pu * 100, 0, 200);
};

const NumField = ({ label, value, set, min, max, step = 1, unit }) => (
    <div>
        <label className="text-xs text-muted-foreground">{label}{unit ? ` (${unit})` : ""}</label>
        <input
            type="number" value={value} min={min} max={max} step={step}
            onChange={(e) => { const v = parseFloat(e.target.value); set(Number.isFinite(v) ? v : 0); }}
            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
    </div>
);

const Nameplate = ({ np, setNp, derived }) => {
    const upd = (k, v) => setNp((p) => ({ ...p, [k]: v }));   // pure input — nothing is auto-adjusted
    return (
        <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-sm flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Motor nameplate
                    <span className="text-muted-foreground font-normal">— drives the Playground, DC Drive &amp; Commissioning tools</span>
                </p>
                <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value=""
                    onChange={(e) => { const p = NAMEPLATE_PRESETS[+e.target.value]; if (p) setNp({ ...p.np }); }}
                >
                    <option value="" disabled>Load a preset…</option>
                    {NAMEPLATE_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <NumField label="Armature voltage" unit="V" value={np.vRated} set={(v) => upd("vRated", v)} min={12} max={1000} step={5} />
                <NumField label="Armature current" unit="A" value={np.iRated} set={(v) => upd("iRated", v)} min={1} max={3000} step={1} />
                <NumField label="Field current" unit="A" value={np.ifRated} set={(v) => upd("ifRated", v)} min={0.1} max={50} step={0.1} />
                <NumField label="Base speed" unit="rpm" value={np.nBase} set={(v) => upd("nBase", v)} min={100} max={4000} step={10} />
                <NumField label="Max speed" unit="rpm" value={np.nMax} set={(v) => upd("nMax", v)} min={np.nBase} max={8000} step={10} />
                <NumField label="Armature R" unit="Ω" value={np.ra} set={(v) => upd("ra", v)} min={0} max={20} step={0.01} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                    ["kφ (full field)", `${fmt(derived.kRated, 2)}`],
                    ["Rated torque", `${fmt(derived.tRated, 0)} N·m`],
                    ["Rated power", `${fmt(derived.pRated / 1000, 1)} kW`],
                    ["Field weakening", `${fmt(derived.fwRatio, 2)} : 1`],
                ].map(([k, v]) => (
                    <div key={k} className="rounded-md bg-background border p-2">
                        <span className="text-muted-foreground">{k} </span>
                        <span className="font-mono font-bold">{v}</span>
                    </div>
                ))}
            </div>
            {derived.kRated <= 0 && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Check nameplate — computed kφ is not positive (armature voltage too low vs IₐRₐ, or base speed too high).
                </p>
            )}
            {np.nMax < np.nBase && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Max speed is below base speed — field-weakening range is less than 1 : 1.
                </p>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — HOW A DC MOTOR WORKS  (construction + principle, illustrative SVG)
// ═══════════════════════════════════════════════════════════════════════════════
const MotorDiagram = () => (
    <svg viewBox="0 0 460 300" className="w-full rounded-lg border bg-slate-900">
        {/* Field poles */}
        <path d="M40,90 Q40,150 40,210 L100,190 Q80,150 100,110 Z" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M420,90 Q420,150 420,210 L360,190 Q380,150 360,110 Z" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1.5" />
        <text x="58" y="155" fill="#93c5fd" fontSize="20" fontFamily="monospace" fontWeight="bold">N</text>
        <text x="388" y="155" fill="#fca5a5" fontSize="20" fontFamily="monospace" fontWeight="bold">S</text>
        <text x="55" y="235" fill="#64748b" fontSize="10" fontFamily="monospace">field pole</text>
        <text x="345" y="235" fill="#64748b" fontSize="10" fontFamily="monospace">field pole</text>

        {/* Flux lines N -> S */}
        {[120, 150, 180].map((y) => (
            <g key={y}>
                <line x1="105" y1={y} x2="352" y2={y} stroke="#475569" strokeWidth="1" strokeDasharray="6 5" />
                <polygon points={`352,${y} 344,${y - 3} 344,${y + 3}`} fill="#475569" />
            </g>
        ))}

        {/* Rotor (armature) */}
        <circle cx="230" cy="150" r="52" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
        {/* Coil */}
        <rect x="205" y="108" width="50" height="84" rx="4" fill="none" stroke="#facc15" strokeWidth="3" />
        {/* Current: out of page on left side (⊙), into page on right side (⊗) */}
        <circle cx="205" cy="150" r="9" fill="#0f172a" stroke="#4ade80" strokeWidth="2" />
        <circle cx="205" cy="150" r="2.5" fill="#4ade80" />
        <g stroke="#f87171" strokeWidth="2">
            <line x1="249" y1="144" x2="261" y2="156" />
            <line x1="261" y1="144" x2="249" y2="156" />
        </g>
        <text x="176" y="153" fill="#4ade80" fontSize="11" fontFamily="monospace">I⊙</text>
        <text x="266" y="153" fill="#f87171" fontSize="11" fontFamily="monospace">I⊗</text>

        {/* Force arrows -> a couple -> rotation */}
        <line x1="205" y1="108" x2="205" y2="82" stroke="#4ade80" strokeWidth="2.5" />
        <polygon points="205,74 200,86 210,86" fill="#4ade80" />
        <line x1="255" y1="192" x2="255" y2="218" stroke="#f87171" strokeWidth="2.5" />
        <polygon points="255,226 250,214 260,214" fill="#f87171" />
        <text x="150" y="90" fill="#4ade80" fontSize="10" fontFamily="monospace">F = B·I·L</text>
        <path d="M275,120 A40 40 0 0 1 275,180" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 3" />
        <polygon points="275,180 269,170 281,172" fill="#e2e8f0" />

        {/* Commutator + brushes */}
        <rect x="214" y="205" width="14" height="18" fill="#334155" stroke="#94a3b8" />
        <rect x="232" y="205" width="14" height="18" fill="#334155" stroke="#94a3b8" />
        <rect x="206" y="223" width="8" height="16" fill="#eab308" />
        <rect x="246" y="223" width="8" height="16" fill="#94a3b8" />
        <text x="196" y="250" fill="#eab308" fontSize="11" fontFamily="monospace">+</text>
        <text x="252" y="250" fill="#94a3b8" fontSize="11" fontFamily="monospace">−</text>
        <text x="188" y="270" fill="#64748b" fontSize="10" fontFamily="monospace">commutator &amp; brushes (DC supply Vₐ)</text>
    </svg>
);

const MotorBasicsTab = () => (
    <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6 items-start">
            <MotorDiagram />
            <div className="space-y-3 text-sm leading-relaxed">
                <p>
                    A DC motor turns electrical energy into rotation using one simple fact:
                    a <strong>current-carrying conductor placed in a magnetic field feels a force</strong>{" "}
                    (<span className="font-mono">F = B·I·L</span>).
                </p>
                <ul className="space-y-1.5 list-disc pl-5 text-muted-foreground">
                    <li><span className="text-foreground font-medium">Field system (stator):</span> poles that set up the magnetic flux <span className="font-mono">φ</span>. Fed by the <em>field winding</em> — this is what we later weaken.</li>
                    <li><span className="text-foreground font-medium">Armature (rotor):</span> coils carrying the armature current <span className="font-mono">Iₐ</span>, supplied at armature voltage <span className="font-mono">Vₐ</span>.</li>
                    <li><span className="text-foreground font-medium">Commutator &amp; brushes:</span> a rotary switch that flips the coil current every half-turn so the torque always pushes the <em>same way</em> and the motor keeps spinning.</li>
                </ul>
                <p>
                    The two coil sides carry current in opposite directions, so they feel opposite forces —
                    that pair of forces is a <strong>couple</strong> that spins the rotor.
                </p>
            </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
            {[
                { t: "Torque", f: "T = k · φ · Iₐ", d: "More flux or more armature current → more torque. This is why torque falls when we weaken the field." },
                { t: "Back-EMF", f: "Eₑ = k · φ · ω", d: "A spinning armature acts like a generator and pushes back against the supply. It rises with speed." },
                { t: "Speed", f: "ω = (Vₐ − Iₐ·Rₐ) / (k·φ)", d: "Speed rises with armature voltage and falls with flux — the two knobs a DC drive controls." },
            ].map((e) => (
                <div key={e.t} className="rounded-lg border p-4 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" />{e.t}</p>
                    <p className="font-mono text-sm bg-muted/60 rounded px-2 py-1">{e.f}</p>
                    <p className="text-xs text-muted-foreground">{e.d}</p>
                </div>
            ))}
        </div>

        <div className="rounded-lg border-2 border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 p-4 text-sm">
            <p className="font-bold text-blue-700 dark:text-blue-300 mb-1">The key balance</p>
            <p className="text-blue-900 dark:text-blue-200">
                In steady running, the supply voltage splits into back-EMF plus a small resistive drop:
                <span className="font-mono"> Vₐ = Eₑ + Iₐ·Rₐ</span>. Because <span className="font-mono">Eₑ = k·φ·ω</span>,
                the motor automatically settles at the speed where the back-EMF nearly balances the supply.
                Change <span className="font-mono">Vₐ</span> or <span className="font-mono">φ</span> and the speed
                moves to a new balance — try it in the <strong>Motor Playground</strong> tab.
            </p>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 2 — MOTOR PLAYGROUND  (interactive, animated rotor)
// ═══════════════════════════════════════════════════════════════════════════════
const MotorPlayground = ({ np, derived }) => {
    const { vRated, iRated, ra: RA, ifRated } = np;
    const K0 = derived.kRated;                    // back-EMF / torque constant at full flux (from nameplate)
    const iaMax = iRated * 1.6;                   // overload / trip threshold
    const loadMax = Math.max(50, Math.ceil((derived.tRated * 2) / 10) * 10);
    const ifMin = round1(ifRated * 0.25);         // deepest field weakening

    const [va, setVa] = useState(() => vRated);
    const [ifCur, setIfCur] = useState(() => ifRated);  // FIELD CURRENT is the control now
    const [load, setLoad] = useState(() => Math.round(derived.tRated));
    const [mode, setMode] = useState("armature"); // "armature" | "weaken"

    const fluxPct = fluxPctFromIf(ifCur, ifRated);      // flux comes from the magnetization curve

    // Only keep the sliders inside the ranges the nameplate allows — no auto-forcing of values.
    useEffect(() => { setVa((v) => clamp(v, 0, vRated)); }, [vRated]);
    useEffect(() => { setIfCur((f) => clamp(f, ifMin, ifRated)); }, [ifRated, ifMin]);
    useEffect(() => { setLoad((l) => clamp(l, 0, loadMax)); }, [loadMax]);

    // Switching mode pins the "other" knob so the active control is the teaching point
    const applyMode = (m) => {
        setMode(m);
        if (m === "armature") setIfCur(ifRated);     // full field, vary Vₐ  (below base speed)
        else setVa(vRated);                           // Vₐ at ceiling, weaken I_f (above base speed)
    };

    // Steady-state separately-excited DC motor model
    const kphi = K0 * (fluxPct / 100);
    const Ia = kphi > 0 ? load / kphi : Infinity; // Te = Tload  ⇒  Iₐ = T / (kφ)
    const Eb = va - Ia * RA;
    const omega = Eb > 0 ? Eb / kphi : 0;         // rad/s  (stalled if back-EMF can't be reached)
    const N = omega * 9.5493;                     // rpm
    const power = load * omega;                   // W
    const stalled = Eb <= 0 && load > 0;
    const overload = Ia > iaMax;

    // Field-weakening references — base speed is the NAMEPLATE spec
    // (speed at rated Vₐ + full field + rated load), not a value recomputed at the current load.
    const weakening = fluxPct < 99.5;             // field reduced below rated
    const torqueCap = kphi * iRated;              // torque available at rated current → falls with flux
    const Nbase = np.nBase;
    const aboveBase = N > Nbase + 5;

    // Animated rotor — rotate at a rate proportional to speed (visually scaled)
    const rotorRef = useRef(null);
    const angleRef = useRef(0);
    const speedRef = useRef(0);
    speedRef.current = N;
    useEffect(() => {
        let raf, last = performance.now();
        const tick = (now) => {
            const dt = (now - last) / 1000; last = now;
            // visual: cap so very high rpm is still watchable, keep it proportional
            const degPerSec = clamp((speedRef.current / 60) * 360 * 0.06, 0, 720);
            angleRef.current = (angleRef.current + degPerSec * dt) % 360;
            if (rotorRef.current) rotorRef.current.setAttribute("transform", `rotate(${angleRef.current} 90 90)`);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* LEFT: animated motor + live stats */}
            <div className="space-y-4">
                <svg viewBox="0 0 180 180" className="w-full max-w-[280px] mx-auto rounded-lg border bg-slate-900">
                    {/* stator poles */}
                    <path d="M8,60 L8,120 L46,105 Q34,90 46,75 Z" fill="#1e3a8a" stroke="#3b82f6" />
                    <path d="M172,60 L172,120 L134,105 Q146,90 134,75 Z" fill="#7f1d1d" stroke="#ef4444" />
                    <text x="18" y="95" fill="#93c5fd" fontSize="13" fontWeight="bold" fontFamily="monospace">N</text>
                    <text x="150" y="95" fill="#fca5a5" fontSize="13" fontWeight="bold" fontFamily="monospace">S</text>
                    {/* rotor */}
                    <circle cx="90" cy="90" r="42" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                    <g ref={rotorRef}>
                        <rect x="74" y="52" width="32" height="76" rx="4" fill="none" stroke="#facc15" strokeWidth="3" />
                        <line x1="90" y1="48" x2="90" y2="132" stroke="#38bdf8" strokeWidth="1.5" />
                        <circle cx="90" cy="90" r="5" fill="#38bdf8" />
                    </g>
                    <text x="90" y="172" fill={stalled ? "#f87171" : "#4ade80"} fontSize="11" textAnchor="middle" fontFamily="monospace">
                        {stalled ? "STALLED" : `${fmt(N, 0)} rpm`}
                    </text>
                </svg>

                <div className="grid grid-cols-2 gap-3">
                    <Stat label="Speed" value={fmt(N, 0)} unit="rpm" tone={stalled ? "text-red-500" : aboveBase ? "text-amber-500" : ""} />
                    <Stat label="Armature current Iₐ" value={fmt(Ia, 0)} unit="A" tone={overload ? "text-red-500" : ""} />
                    <Stat label="Field current I_f" value={fmt(ifCur, 2)} unit="A" tone={weakening ? "text-amber-500" : ""} />
                    <Stat label="Flux φ" value={fmt(fluxPct, 0)} unit="%" tone={weakening ? "text-amber-500" : ""} />
                    <Stat label="Back-EMF Eₑ" value={fmt(Math.max(Eb, 0), 0)} unit="V" />
                    <Stat label="Shaft power" value={fmt(power / 1000, 2)} unit="kW" />
                    <Stat label="Base speed (nameplate)" value={fmt(Nbase, 0)} unit="rpm" />
                    <Stat label="Torque capacity" value={fmt(torqueCap, 0)} unit="N·m" tone={weakening ? "text-amber-500" : ""} />
                </div>

                {/* Magnetization curve — flux vs field current, with the operating point */}
                <div className="rounded-lg border bg-slate-900 p-2">
                    <p className="text-[11px] text-slate-400 font-mono mb-1 px-1">Magnetization curve — φ vs field current I_f</p>
                    <svg viewBox="0 0 300 120" className="w-full">
                        {(() => {
                            const W = 300, H = 120, pl = 30, pb = 20, pt = 8, pr = 8;
                            const fx = (f) => pl + (f / ifRated) * (W - pl - pr);
                            const fy = (p) => H - pb - (clamp(p, 0, 120) / 120) * (H - pb - pt);
                            const pts = [];
                            for (let i = 0; i <= 60; i++) {
                                const f = (i / 60) * ifRated;
                                pts.push(`${fmt(fx(f), 1)},${fmt(fy(fluxPctFromIf(f, ifRated)), 1)}`);
                            }
                            return (
                                <>
                                    {[0, 50, 100].map((p) => (
                                        <g key={p}>
                                            <line x1={pl} y1={fy(p)} x2={W - pr} y2={fy(p)} stroke="#1e293b" />
                                            <text x={pl - 3} y={fy(p) + 3} fill="#64748b" fontSize="8" textAnchor="end" fontFamily="monospace">{p}%</text>
                                        </g>
                                    ))}
                                    <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#475569" />
                                    <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#475569" />
                                    <text x={W - pr} y={H - pb + 13} fill="#64748b" fontSize="8" textAnchor="end" fontFamily="monospace">I_f → {fmt(ifRated, 1)} A</text>
                                    <polyline points={pts.join(" ")} fill="none" stroke="#4ade80" strokeWidth="2" />
                                    <line x1={fx(ifCur)} y1={pt} x2={fx(ifCur)} y2={H - pb} stroke="#facc15" strokeWidth="1" strokeDasharray="3 3" />
                                    <circle cx={fx(ifCur)} cy={fy(fluxPct)} r="4" fill="#facc15" stroke="#0f172a" strokeWidth="1.5" />
                                </>
                            );
                        })()}
                    </svg>
                </div>

                {overload && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Iₐ = {fmt(Ia, 0)} A exceeds the {fmt(iaMax, 0)} A trip level (≈1.6× rated) — a real drive would current-limit or fault here.
                    </div>
                )}
                {stalled && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        The load torque is too high for this voltage/flux — back-EMF collapses and the motor stalls.
                    </div>
                )}
            </div>

            {/* RIGHT: controls + equations */}
            <div className="space-y-4">
                {/* Two-knob mode toggle */}
                <div className="flex rounded-md border overflow-hidden text-xs font-semibold">
                    {[
                        { k: "armature", t: "Armature-voltage control", icon: Gauge },
                        { k: "weaken", t: "Field weakening", icon: Magnet },
                    ].map((m) => {
                        const Icon = m.icon;
                        return (
                            <button key={m.k} onClick={() => applyMode(m.k)}
                                className={`flex-1 px-2.5 py-2 inline-flex items-center justify-center gap-1.5 transition-colors ${mode === m.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                                <Icon className="h-3.5 w-3.5" /> {m.t}
                            </button>
                        );
                    })}
                </div>

                <div className={`rounded-lg border-2 p-3 text-sm ${weakening ? "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200" : "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200"}`}>
                    <span className="flex items-center gap-2 font-semibold">
                        {weakening ? <Magnet className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
                        {weakening ? `Field weakening — I_f ${fmt(ifCur, 2)} A → φ ${fmt(fluxPct, 0)}%` : "Full field — armature-voltage region"}
                    </span>
                    <p className="text-xs mt-1 font-normal">
                        Nameplate base speed <span className="font-mono font-semibold">{fmt(Nbase, 0)} rpm</span>.{" "}
                        {aboveBase
                            ? `Running ${fmt(N / Nbase, 2)}× base by weakening the field — note torque capacity has dropped to ${fmt(torqueCap, 0)} N·m.`
                            : mode === "weaken"
                                ? "Lower I_f to weaken the field and push speed above base — watch torque capacity fall."
                                : `Raise Vₐ toward ${fmt(vRated, 0)} V to reach base speed, then switch to field weakening.`}
                    </p>
                </div>

                <Slider label="Armature voltage  Vₐ" value={Math.min(va, vRated)} set={setVa} min={0} max={vRated} unit=" V" disabled={mode === "weaken"} />
                <Slider label="Field current  I_f" value={round1(clamp(ifCur, ifMin, ifRated))} set={setIfCur} min={ifMin} max={ifRated} step={0.05} unit=" A" disabled={mode === "armature"} />
                <Slider label="Load torque  T" value={Math.min(load, loadMax)} set={setLoad} min={0} max={loadMax} unit=" N·m" />

                <div className="rounded-md bg-muted/60 p-3 text-xs font-mono text-muted-foreground space-y-1">
                    <p className="text-foreground font-semibold">Steady-state solution</p>
                    <p>φ(I_f) = φ({fmt(ifCur, 2)} A / {fmt(ifRated, 2)} A) = {fmt(fluxPct, 0)}%</p>
                    <p>kφ = {fmt(K0, 2)} × {fmt(fluxPct, 0)}% = {fmt(kphi, 2)}</p>
                    <p>Iₐ = T / kφ = {load} / {fmt(kphi, 2)} = {fmt(Ia, 1)} A</p>
                    <p>Eₑ = Vₐ − Iₐ·Rₐ = {va} − {fmt(Ia * RA, 1)} = {fmt(Eb, 1)} V</p>
                    <p>ω = Eₑ / kφ = {fmt(omega, 1)} rad/s → {fmt(N, 0)} rpm</p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Raise Vₐ</strong> → speed rises (armature-voltage control, below base speed).</p>
                    <p><strong className="text-foreground">Lower I_f</strong> → flux drops along the magnetization curve; speed rises but current climbs and torque capacity falls (field weakening).</p>
                    <p><strong className="text-foreground">Raise load</strong> → more current is drawn, speed droops slightly.</p>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 3 — DC DRIVE: SPEED CONTROL & FIELD WEAKENING  (characteristic charts)
// ═══════════════════════════════════════════════════════════════════════════════
// Normalised two-region model (per-unit of rated), the classic DC-drive envelope:
//   below base speed  → armature-voltage control : φ = 1, Vₐ rises, T const, P rises
//   above base speed  → field weakening          : Vₐ = 1, φ ∝ 1/N, T ∝ 1/N, P const
const puTorque = (N, Nb) => (N <= Nb ? 1 : Nb / N);        // ≡ flux
const puPower = (N, Nb) => (N <= Nb ? N / Nb : 1);         // ≡ armature voltage
const puFlux = (N, Nb) => (N <= Nb ? 1 : Nb / N);
const puVolt = (N, Nb) => (N <= Nb ? N / Nb : 1);
const puEb = (N, Nb) => (N <= Nb ? N / Nb : 1);            // ≈ Vₐ (IR drop ignored)

const Chart = ({ title, series, Nbase, Nmax, Nop }) => {
    const W = 460, H = 250, padL = 40, padB = 34, padT = 14, padR = 12;
    const yMax = 1.2;
    const px = (n) => padL + (n / Nmax) * (W - padL - padR);
    const py = (v) => H - padB - (Math.min(v, yMax) / yMax) * (H - padB - padT);

    const buildPath = (f) => {
        const pts = [];
        const steps = 160;
        for (let i = 0; i <= steps; i++) {
            const n = (i / steps) * Nmax;
            pts.push(`${fmt(px(n), 1)},${fmt(py(f(n, Nbase)), 1)}`);
        }
        return pts.join(" ");
    };

    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold">{title}</p>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border bg-slate-900">
                {/* region shading */}
                <rect x={padL} y={padT} width={px(Nbase) - padL} height={H - padB - padT} fill="#0ea5e9" opacity="0.07" />
                <rect x={px(Nbase)} y={padT} width={W - padR - px(Nbase)} height={H - padB - padT} fill="#f59e0b" opacity="0.08" />
                <text x={(padL + px(Nbase)) / 2} y={padT + 14} fill="#7dd3fc" fontSize="9.5" textAnchor="middle" fontFamily="monospace">constant torque</text>
                <text x={(px(Nbase) + W - padR) / 2} y={padT + 14} fill="#fcd34d" fontSize="9.5" textAnchor="middle" fontFamily="monospace">field weakening</text>

                {/* y gridlines / labels (%) */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((v) => (
                    <g key={v}>
                        <line x1={padL} y1={py(v)} x2={W - padR} y2={py(v)} stroke="#1e293b" strokeWidth="1" />
                        <text x={padL - 5} y={py(v) + 3} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="monospace">{v * 100}%</text>
                    </g>
                ))}
                {/* axes */}
                <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#475569" strokeWidth="1" />
                <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#475569" strokeWidth="1" />

                {/* base speed marker */}
                <line x1={px(Nbase)} y1={padT} x2={px(Nbase)} y2={H - padB} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="5 4" />
                <text x={px(Nbase)} y={H - padB + 12} fill="#cbd5e1" fontSize="9" textAnchor="middle" fontFamily="monospace">base {fmt(Nbase, 0)}</text>
                <text x={W - padR} y={H - padB + 12} fill="#cbd5e1" fontSize="9" textAnchor="end" fontFamily="monospace">full {fmt(Nmax, 0)} rpm</text>

                {/* series curves */}
                {series.map((s) => (
                    <polyline key={s.label} points={buildPath(s.f)} fill="none" stroke={s.color} strokeWidth="2.5" />
                ))}

                {/* operating point */}
                <line x1={px(Nop)} y1={padT} x2={px(Nop)} y2={H - padB} stroke="#facc15" strokeWidth="1" strokeDasharray="3 3" />
                {series.map((s) => (
                    <circle key={s.label} cx={px(Nop)} cy={py(s.f(Nop, Nbase))} r="4.5" fill={s.color} stroke="#0f172a" strokeWidth="1.5" />
                ))}

                {/* legend */}
                {series.map((s, i) => (
                    <g key={s.label}>
                        <rect x={padL + 6 + i * 118} y={padT + 2} width="10" height="10" fill={s.color} rx="2" />
                        <text x={padL + 20 + i * 118} y={padT + 11} fill="#e2e8f0" fontSize="9.5" fontFamily="monospace">{s.label}</text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

const DriveTab = ({ np, derived }) => {
    const [Nbase, setNbase] = useState(() => np.nBase);
    const [ratio, setRatio] = useState(() => clamp(derived.fwRatio, 1, 5)); // field-weakening range  N_full : N_base
    const [Nop, setNop] = useState(() => np.nBase);

    // Re-seed base speed and field-weakening range from the nameplate whenever it changes
    useEffect(() => { setNbase(np.nBase); setNop(np.nBase); }, [np.nBase]);
    useEffect(() => { setRatio(clamp(derived.fwRatio, 1, 5)); }, [derived.fwRatio]);

    const Nmax = Nbase * ratio;
    const opN = clamp(Nop, 0, Nmax);

    const region = opN <= Nbase ? "Armature-voltage control (constant torque)" : "Field weakening (constant power)";
    const Va = puVolt(opN, Nbase);
    const flux = puFlux(opN, Nbase);
    const torque = puTorque(opN, Nbase);
    const powerPu = puPower(opN, Nbase);
    const Eb = puEb(opN, Nbase);
    // Real engineering values scaled from the nameplate
    const actTorque = torque * derived.tRated;
    const actPower = powerPu * derived.pRated;

    return (
        <div className="space-y-6">
            <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                A DC drive controls speed with <strong>two independent knobs</strong>. Up to <em>base speed</em> it holds the
                field at full flux and raises the <strong>armature voltage</strong> — torque stays available but power grows.
                Once the armature voltage hits its ceiling, the only way to go faster is to <strong>weaken the field</strong>
                (reduce flux). Now speed keeps rising at constant power, but the available torque falls. Drag the operating
                speed and reshape the envelope below.
            </div>

            <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <Chart
                        title="Torque & Power vs Speed"
                        Nbase={Nbase} Nmax={Nmax} Nop={opN}
                        series={[
                            { label: "Torque", color: "#38bdf8", f: puTorque },
                            { label: "Power", color: "#f59e0b", f: puPower },
                        ]}
                    />
                    <Chart
                        title="Armature Voltage & Flux vs Speed"
                        Nbase={Nbase} Nmax={Nmax} Nop={opN}
                        series={[
                            { label: "Armature V", color: "#a78bfa", f: puVolt },
                            { label: "Flux φ", color: "#4ade80", f: puFlux },
                        ]}
                    />
                </div>

                <div className="space-y-4">
                    <Slider label="Base speed" value={Nbase} set={setNbase} min={200} max={4000} step={50} unit=" rpm" />
                    <Slider label="Field-weakening range (full : base)" value={fmt(ratio, 1)} set={setRatio} min={1} max={5} step={0.1} unit=" : 1" />
                    <Slider label="Operating speed" value={opN} set={setNop} min={0} max={Nmax} step={10} unit=" rpm" />

                    <div className={`rounded-lg border-2 p-3 text-sm font-semibold ${opN <= Nbase ? "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300" : "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"}`}>
                        <span className="flex items-center gap-2">
                            {opN <= Nbase ? <Gauge className="h-4 w-4" /> : <Magnet className="h-4 w-4" />}
                            {region}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Armature voltage" value={fmt(Va * 100, 0)} unit="%" />
                        <Stat label="Flux φ" value={fmt(flux * 100, 0)} unit="%" />
                        <Stat label="Max torque" value={fmt(torque * 100, 0)} unit="%" tone={opN > Nbase ? "text-amber-500" : ""} />
                        <Stat label="Max power" value={fmt(powerPu * 100, 0)} unit="%" />
                        <Stat label="≈ Torque" value={fmt(actTorque, 0)} unit="N·m" tone={opN > Nbase ? "text-amber-500" : ""} />
                        <Stat label="≈ Power" value={fmt(actPower / 1000, 1)} unit="kW" />
                        <Stat label="Back-EMF" value={fmt(Eb * 100, 0)} unit="%" />
                        <Stat label="Full speed" value={fmt(Nmax, 0)} unit="rpm" />
                    </div>

                    <div className="rounded-md bg-muted/60 p-3 text-xs font-mono text-muted-foreground space-y-1">
                        <p className="text-foreground font-semibold">Why the shapes?</p>
                        <p>ω = (Vₐ − IₐRₐ) / (k·φ)</p>
                        <p>below base: φ = 100%, Vₐ ↑ ⇒ ω ↑, T = k·φ·Iₐ const</p>
                        <p>above base: Vₐ = 100%, φ ∝ 1/N ⇒ ω ↑, T ∝ 1/N, P const</p>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border-2 border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 p-4 text-sm">
                <p className="font-bold flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-2">
                    <AlertTriangle className="h-4 w-4" /> Things to remember
                </p>
                <ul className="space-y-1.5 text-orange-900 dark:text-orange-200 list-disc pl-5">
                    <li><strong>Base speed</strong> is reached at <em>full armature voltage and full flux</em> — the boundary between the two regions.</li>
                    <li><strong>Full (max) speed</strong> is set by how far you can weaken the field before torque/commutation limits bite (typically 2:1 to 3:1).</li>
                    <li>Torque follows <strong>flux</strong>; power follows <strong>armature voltage</strong> — notice each pair of curves overlaps.</li>
                    <li>Never weaken the field on a stopped or heavily loaded motor — low flux with high current means very high torque demand and possible overspeed if load is lost.</li>
                </ul>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 4 — ABB DCS880 & SIEMENS 6RA80 : COMMISSIONING PARAMETERS
//  Parameter numbers depend on firmware version — always confirm against the
//  official manuals (ABB DCS880 FW manual 3ADW000462; Siemens 6RA80 SINAMICS DCM
//  List Manual). Values marked * should be double-checked for your firmware.
// ═══════════════════════════════════════════════════════════════════════════════
const COMMISSION_STEPS = [
    { t: "Hardware & power check", d: "Confirm mains/armature/field wiring, fuses, fan, and that the motor nameplate matches the converter rating before applying power." },
    { t: "Enter motor nameplate", d: "Armature voltage & current and rated field current. Everything the drive computes (EMF, limits, protection, tuning) is scaled from these." },
    { t: "Set field & field weakening", d: "Rated and minimum field current. Minimum field sets how far the field can be weakened — i.e. the maximum (full) speed and the constant-power range." },
    { t: "Select speed feedback", d: "EMF (armature-voltage) / analog tacho / pulse encoder. Get the source and its polarity right, or the drive runs away on the first start." },
    { t: "Set limits & ramps", d: "Current/torque limit, min/max speed, accel/decel ramp times. These protect the motor, converter and mechanics during the first moves." },
    { t: "Optimize current loops", d: "Auto-tune the armature and field current controllers so torque response is fast and stable and there is no current ripple or fuse tripping." },
    { t: "Optimize speed & field-weakening", d: "Tune the speed controller, then the EMF / field-weakening controller so the field folds back cleanly above base speed." },
    { t: "Test, tune & SAVE", d: "Run under load, fine-tune, then write parameters to non-volatile memory so nothing is lost at power-down." },
];

// Function | why it matters | ABB DCS880 | Siemens 6RA80
const PARAM_ROWS = [
    { fn: "Rated armature voltage", why: "Sets DC output ceiling and EMF scaling; wrong value corrupts field-weakening and protection.", abb: "99.03", sie: "p50101" },
    { fn: "Rated armature current", why: "Base for current limit, I²t motor protection and current-controller scaling.", abb: "99.04", sie: "p50100" },
    { fn: "Rated field current", why: "Sets full flux — the reference for torque and EMF. Must be right before any field weakening.", abb: "99.10*", sie: "p50102" },
    { fn: "Minimum field current", why: "Defines maximum field weakening → the full/max speed and constant-power range. Too low = overspeed / commutation limit.", abb: "field-exciter group*", sie: "p50103" },
    { fn: "Speed feedback source", why: "EMF vs tacho vs encoder. Wrong source or polarity causes runaway/overspeed on the very first start.", abb: "90.41", sie: "p50083" },
    { fn: "Encoder pulses / rev", why: "Encoder scaling — a wrong value scales speed and reference wrongly.", abb: "92.xx*", sie: "p50741" },
    { fn: "Min / max speed limits", why: "Boundaries that keep the mechanics and motor inside safe speed during commissioning.", abb: "30.11 / 30.12", sie: "p50180 / p50181*" },
    { fn: "Current / torque limit", why: "Protects motor and thyristor bridge from overcurrent during first torque tests.", abb: "30.x limits", sie: "p50171 / p50172*" },
    { fn: "Accel / decel ramp", why: "Ramp times for the speed reference — avoids current spikes and mechanical shock.", abb: "23.12 / 23.13", sie: "p50303 / p50304" },
    { fn: "Current-loop optimization", why: "Auto-tunes Rₐ/Lₐ so torque is fast and stable without ripple or fuse trips.", abb: "Autotune assistant (ID run)", sie: "p50051 = 25 (and 24)" },
    { fn: "Speed-loop optimization", why: "Tunes speed-controller gain/integral for a firm, non-oscillating speed response.", abb: "Autotune assistant", sie: "p50051 = 26" },
    { fn: "Field-weakening / EMF optimization", why: "Tunes the EMF controller so flux folds back correctly above base speed.", abb: "Autotune assistant", sie: "p50051 = 27" },
    { fn: "Save to non-volatile memory", why: "Persists the commissioned set so it survives power-off.", abb: "96.07 (param save)", sie: "p0977 = 1" },
];

const CommissionReference = () => (
    <div className="space-y-8">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
            The <strong>ABB DCS880</strong> and <strong>Siemens SINAMICS DC MASTER 6RA80</strong> are modern digital
            DC drives: a thyristor (SCR) armature converter plus a controlled field exciter, wrapped in a cascaded
            <strong> current → speed → EMF</strong> control structure. Commissioning means three things — tell the drive the
            <strong> motor nameplate</strong>, pick the <strong>speed feedback</strong>, and <strong>auto-tune the control loops</strong>.
            Both use assistants (ABB Drive Composer / operator panel; Siemens the BOP20/panel or Starter-DCC) that walk these steps.
        </div>

        <div className="rounded-lg border-2 border-red-400/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm">
            <p className="font-bold flex items-center gap-2 text-red-700 dark:text-red-300 mb-1">
                <ShieldAlert className="h-4 w-4" /> Verify every number against the manual
            </p>
            <p className="text-red-900 dark:text-red-200">
                Parameter numbers change between firmware versions and options. Treat the tables below as a map, not gospel —
                confirm against the <strong>ABB DCS880 Firmware Manual (3ADW000462)</strong> and the
                <strong> Siemens 6RA80 SINAMICS DCM List Manual</strong> for your exact firmware. Entries marked <span className="font-mono">*</span> especially.
            </p>
        </div>

        {/* Commissioning sequence */}
        <section className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Commissioning sequence (both drives)</h2>
            <div className="grid sm:grid-cols-2 gap-3">
                {COMMISSION_STEPS.map((s, i) => (
                    <div key={s.t} className="rounded-lg border p-3 flex gap-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{i + 1}</div>
                        <div>
                            <p className="font-semibold text-sm">{s.t}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.d}</p>
                        </div>
                    </div>
                ))}
            </div>
        </section>

        {/* Parameter comparison */}
        <section className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" />Key commissioning parameters &amp; why they matter</h2>
            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left">
                            <th className="p-2.5 font-semibold">Function</th>
                            <th className="p-2.5 font-semibold">Why it matters for commissioning</th>
                            <th className="p-2.5 font-semibold whitespace-nowrap">ABB DCS880</th>
                            <th className="p-2.5 font-semibold whitespace-nowrap">Siemens 6RA80</th>
                        </tr>
                    </thead>
                    <tbody>
                        {PARAM_ROWS.map((r) => (
                            <tr key={r.fn} className="border-b last:border-0 align-top">
                                <td className="p-2.5 font-medium">{r.fn}</td>
                                <td className="p-2.5 text-muted-foreground text-xs">{r.why}</td>
                                <td className="p-2.5 font-mono text-xs whitespace-nowrap text-red-600 dark:text-red-400">{r.abb}</td>
                                <td className="p-2.5 font-mono text-xs whitespace-nowrap text-sky-600 dark:text-sky-400">{r.sie}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>

        {/* Drive-specific cards */}
        <section className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border-2 border-red-400/40 p-4 space-y-2">
                <p className="font-bold flex items-center gap-2 text-red-600 dark:text-red-400"><Cpu className="h-4 w-4" />ABB DCS880 — the ABB way</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li>Parameters are <strong>grouped.number</strong> (e.g. <span className="font-mono">99.03</span>). Motor data lives in <span className="font-mono">group 99</span>.</li>
                    <li>Commission with the <strong>control-panel assistant</strong> or <strong>Drive Composer</strong> PC tool over the assistant flow.</li>
                    <li>Control loops are set by the built-in <strong>autotuning / ID run</strong> rather than typing gains by hand.</li>
                    <li>On-board field exciter (DCF) handles field current and field weakening automatically from the motor data.</li>
                    <li>Save changes with the <strong>parameter save</strong> (group 96); back up the full set via Drive Composer.</li>
                </ul>
            </div>
            <div className="rounded-lg border-2 border-sky-400/40 p-4 space-y-2">
                <p className="font-bold flex items-center gap-2 text-sky-600 dark:text-sky-400"><Cpu className="h-4 w-4" />Siemens 6RA80 — the SINAMICS way</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                    <li>Adjustable <span className="font-mono">p</span>-parameters, monitor <span className="font-mono">r</span>-parameters. DC-motor data is the <span className="font-mono">p501xx</span> block.</li>
                    <li>Motor: <span className="font-mono">p50100/101/102/103</span> (armature A/V, field A, min field).</li>
                    <li>Feedback source in <span className="font-mono">p50083</span> (1 tacho · 2 encoder · 3 EMF · 4 free).</li>
                    <li>Famous <strong>optimization runs</strong> via <span className="font-mono">p50051</span>: 24/25 current, 26 speed, 27 field weakening, 28 friction/inertia.</li>
                    <li>Save all with <span className="font-mono">p0977 = 1</span> (RAM → ROM); commission access via <span className="font-mono">p0010</span>.</li>
                </ul>
            </div>
        </section>

        {/* Pitfalls */}
        <div className="rounded-lg border-2 border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 p-4 text-sm">
            <p className="font-bold flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-2"><AlertTriangle className="h-4 w-4" />Common commissioning pitfalls</p>
            <ul className="space-y-1.5 text-orange-900 dark:text-orange-200 list-disc pl-5">
                <li><strong>Feedback polarity:</strong> a reversed tacho/encoder sign makes the loop positive-feedback → instant overspeed. Verify before enabling the speed loop.</li>
                <li><strong>Minimum field too low:</strong> over-aggressive field weakening causes overspeed and poor commutation. Respect the motor's max-speed rating.</li>
                <li><strong>Running optimization under load or stopped:</strong> current-controller tuning needs the correct condition (motor able to turn / field present) — follow each drive's prompt.</li>
                <li><strong>Forgetting to save:</strong> a perfectly tuned drive that was never written to ROM loses everything at the next power-off.</li>
                <li><strong>Field weakening on a light/lost load:</strong> low flux + torque demand can run the motor away — check overspeed protection first.</li>
            </ul>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Reference only — always follow the machine builder's commissioning instructions and the drive's official manual.
        </p>
    </div>
);

// ── Inverse magnetization curve: field current needed for a target flux % ─────────
const ifFromFluxPct = (pct, ifRated) => {
    const p = clamp(pct / 100, 0, 1);
    const x = p / (1 + IF_SAT * (1 - p));   // inverse of fluxPctFromIf
    return x * ifRated;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOL 2 — FIELD-WEAKENING / MINIMUM-FIELD CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════
const FieldWeakeningCalc = ({ np, derived }) => {
    const { vRated, iRated, ra, ifRated, nBase, nMax } = np;
    const ratio = nBase > 0 ? nMax / nBase : 1;
    const fluxAtMax = nMax > 0 ? (nBase / nMax) * 100 : 100;   // φ ∝ 1/n above base speed
    const ifMin = ifFromFluxPct(fluxAtMax, ifRated);
    const eRated = vRated - iRated * ra;                        // induced EMF at rated (control target)
    const emfSetpoint = 0.95 * eRated;                          // ~5% margin for the EMF controller
    const tqAtMax = derived.tRated * (nBase / nMax);            // available torque at max speed
    const deep = ifMin < 0.35 * ifRated;
    const wideRange = ratio > 3;

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
                Above base speed the drive holds EMF constant by weakening the field: flux must fall as{" "}
                <span className="font-mono">φ ∝ n_base / n</span>. This computes the <strong>minimum field current</strong>{" "}
                and <strong>EMF setpoint</strong> you enter, from the nameplate above.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Field-weakening range" value={`${fmt(ratio, 2)} : 1`} unit="" tone={wideRange ? "text-amber-500" : ""} />
                <Stat label="Flux needed at max speed" value={fmt(fluxAtMax, 0)} unit="%" />
                <Stat label="Min field current I_f,min" value={fmt(ifMin, 2)} unit="A" tone={deep ? "text-amber-500" : ""} />
                <Stat label="Torque at max speed" value={fmt(tqAtMax, 0)} unit="N·m" />
            </div>

            <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50 text-left"><th className="p-2.5">Set this</th><th className="p-2.5">Value</th><th className="p-2.5">ABB DCS880</th><th className="p-2.5">Siemens 6RA80</th></tr></thead>
                    <tbody className="[&_td]:p-2.5 [&_td]:border-b [&_tr:last-child_td]:border-0">
                        <tr><td className="font-medium">Rated field current</td><td className="font-mono">{fmt(ifRated, 2)} A</td><td className="font-mono text-xs text-red-600 dark:text-red-400">99.10*</td><td className="font-mono text-xs text-sky-600 dark:text-sky-400">p50102</td></tr>
                        <tr><td className="font-medium">Minimum field current</td><td className="font-mono">{fmt(ifMin, 2)} A</td><td className="font-mono text-xs text-red-600 dark:text-red-400">field-exciter min*</td><td className="font-mono text-xs text-sky-600 dark:text-sky-400">p50103</td></tr>
                        <tr><td className="font-medium">EMF setpoint (~95% of {fmt(eRated, 0)} V)</td><td className="font-mono">{fmt(emfSetpoint, 0)} V</td><td className="font-mono text-xs text-red-600 dark:text-red-400">EMF ctrl*</td><td className="font-mono text-xs text-sky-600 dark:text-sky-400">p50100 / EMF</td></tr>
                    </tbody>
                </table>
            </div>

            {(deep || wideRange || np.nMax < np.nBase) && (
                <div className="rounded-lg border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200 space-y-1">
                    {np.nMax < np.nBase && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />Max speed is below base speed — there is no field-weakening range. Check the nameplate.</p>}
                    {wideRange && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />Field-weakening range {fmt(ratio, 1)}:1 is wide — most DC motors are limited to 2:1–3:1 by commutation. Confirm the motor's max-speed rating.</p>}
                    {deep && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />Min field current is very low ({fmt(ifMin, 2)} A) — deep weakening risks poor commutation and overspeed on load loss.</p>}
                </div>
            )}
            <p className="text-xs text-muted-foreground">
                EMF at rated = Vₐ − Iₐ·Rₐ = {vRated} − {fmt(iRated * ra, 0)} = <span className="font-mono">{fmt(eRated, 0)} V</span>.
                The EMF controller holds this constant above base speed; flux (hence field current) is reduced to keep it there as speed rises.
            </p>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOL 5 — PI TUNING SIMULATOR (current & speed loop step response)
// ═══════════════════════════════════════════════════════════════════════════════
// Closed-loop step response of a PI controller on either a first-order lag (current
// loop) or an integrating plant (speed loop). Illustrative — shows how Kp / Ti shape
// overshoot and settling, i.e. what the p50051=25/26 optimization runs deliver.
function stepResponse(plant, Kp, Ti) {
    const dt = 0.004, steps = 375;
    const Tp = 0.06;          // lag plant time constant (current loop)
    const Kj = 6;             // integrator plant gain (speed loop)
    let y = 0, integ = 0;
    const ys = [];
    let ymax = 0, settleT = null;
    for (let i = 0; i <= steps; i++) {
        const t = i * dt;
        const e = 1 - y;                       // unit step reference
        integ = clamp(integ + e * dt, -50, 50); // simple anti-windup
        const u = clamp(Kp * (e + integ / Ti), -12, 12);
        if (plant === "current") y += ((-y + u) / Tp) * dt;   // Tp·dy/dt = -y + u
        else y += Kj * u * dt;                                 // dy/dt = Kj·u  (integrator)
        ys.push([t, y]);
        if (y > ymax) ymax = y;
        if (Math.abs(y - 1) <= 0.02) { if (settleT === null) settleT = t; } else settleT = null;
    }
    const overshoot = Math.max(0, (ymax - 1) * 100);
    const last = ys[ys.length - 1][1];
    const unstable = ymax > 3 || !Number.isFinite(last);
    return { ys, overshoot, settleT, unstable, horizon: steps * dt };
}

const PITuningSim = () => {
    const [plant, setPlant] = useState("current");
    const [Kp, setKp] = useState(3);
    const [Ti, setTi] = useState(0.12);

    const { ys, overshoot, settleT, unstable, horizon } = stepResponse(plant, Kp, Ti);
    const W = 460, H = 240, pl = 34, pb = 26, pt = 12, pr = 10;
    const yMax = 1.8;
    const px = (t) => pl + (t / horizon) * (W - pl - pr);
    const py = (v) => H - pb - (clamp(v, 0, yMax) / yMax) * (H - pb - pt);
    const path = ys.map(([t, v]) => `${fmt(px(t), 1)},${fmt(py(v), 1)}`).join(" ");

    const verdict = unstable ? { t: "Unstable — reduce gain", c: "text-red-500" }
        : overshoot > 25 ? { t: "Oscillatory — lower Kp or raise Ti", c: "text-amber-500" }
            : overshoot < 3 && settleT !== null ? { t: "Well damped", c: "text-emerald-500" }
                : settleT === null ? { t: "Sluggish — raise Kp / lower Ti", c: "text-sky-500" }
                    : { t: "Acceptable — mild overshoot", c: "text-emerald-500" };

    return (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-3">
                <div className="flex rounded-md border overflow-hidden text-xs font-semibold">
                    {[{ k: "current", t: "Current loop (fast, lag plant)" }, { k: "speed", t: "Speed loop (integrating plant)" }].map((p) => (
                        <button key={p.k} onClick={() => setPlant(p.k)}
                            className={`flex-1 px-2 py-1.5 transition-colors ${plant === p.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>{p.t}</button>
                    ))}
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border bg-slate-900">
                    <line x1={pl} y1={py(1)} x2={W - pr} y2={py(1)} stroke="#475569" strokeDasharray="5 4" />
                    <text x={W - pr} y={py(1) - 4} fill="#94a3b8" fontSize="9" textAnchor="end" fontFamily="monospace">setpoint</text>
                    {[0.02, -0.02].map((b, i) => <line key={i} x1={pl} y1={py(1 + b)} x2={W - pr} y2={py(1 + b)} stroke="#1e293b" />)}
                    <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#475569" />
                    <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#475569" />
                    <text x={W - pr} y={H - pb + 14} fill="#64748b" fontSize="8" textAnchor="end" fontFamily="monospace">time →</text>
                    {settleT !== null && <line x1={px(settleT)} y1={pt} x2={px(settleT)} y2={H - pb} stroke="#4ade80" strokeWidth="1" strokeDasharray="3 3" />}
                    <polyline points={path} fill="none" stroke={unstable ? "#f87171" : "#38bdf8"} strokeWidth="2.5" />
                </svg>
                <p className={`text-sm font-semibold ${verdict.c}`}>{verdict.t}</p>
            </div>
            <div className="space-y-4">
                <Slider label="Controller gain  Kp" value={fmt(Kp, 2)} set={setKp} min={0.2} max={10} step={0.1} />
                <Slider label="Integral (reset) time  Ti" value={fmt(Ti, 3)} set={setTi} min={0.01} max={0.6} step={0.005} unit=" s" />
                <div className="grid grid-cols-2 gap-3">
                    <Stat label="Overshoot" value={fmt(overshoot, 0)} unit="%" tone={overshoot > 25 ? "text-amber-500" : ""} />
                    <Stat label="Settling (±2%)" value={settleT !== null ? fmt(settleT, 2) : "—"} unit={settleT !== null ? "s" : ""} />
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
                    <p><strong className="text-foreground">Raise Kp</strong> → faster response, but too much brings overshoot and oscillation.</p>
                    <p><strong className="text-foreground">Lower Ti</strong> → integral acts harder (kills steady-state error faster) but can destabilise.</p>
                    <p>The drive finds these automatically: <span className="font-mono">p50051 = 25</span> tunes the current loop, <span className="font-mono">= 26</span> the speed loop. On DCS880 it's the autotuning / ID run.</p>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOL 6 — FEEDBACK SELECTION & POLARITY CHECK
// ═══════════════════════════════════════════════════════════════════════════════
const FeedbackCheck = ({ np }) => {
    const [source, setSource] = useState("tacho");
    const [kTacho, setKTacho] = useState(20);      // V per 1000 rpm
    const [ppr, setPpr] = useState(1024);          // encoder pulses / rev
    const [reversed, setReversed] = useState(false);
    const nMax = np.nMax;

    const tachoV = (kTacho * nMax) / 1000;
    const tachoHigh = tachoV > 10;
    const encHz = (ppr * nMax) / 60;               // A-channel pulse frequency at max speed
    const encHigh = encHz > 300000;

    // Small convergence/divergence demo for polarity
    const W = 300, H = 110, pl = 8, pb = 8, pt = 8, pr = 8;
    const N = 60;
    const pts = [];
    let y = 0;
    for (let i = 0; i <= N; i++) {
        if (reversed) y = y < 0.05 ? 0.05 : y * 1.09;   // positive feedback → exponential runaway (upward)
        else y += 0.09 * (1 - y);                        // negative feedback → settles at the setpoint
        pts.push(`${fmt(pl + (i / N) * (W - pl - pr), 1)},${fmt(H - pb - (clamp(y, 0, 2) / 2) * (H - pb - pt), 1)}`);
    }

    return (
        <div className="space-y-5">
            <div className="flex rounded-md border overflow-hidden text-xs font-semibold w-full max-w-md">
                {[{ k: "emf", t: "EMF (tacho-less)" }, { k: "tacho", t: "Analog tacho" }, { k: "encoder", t: "Pulse encoder" }].map((s) => (
                    <button key={s.k} onClick={() => setSource(s.k)}
                        className={`flex-1 px-2 py-1.5 transition-colors ${source === s.k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>{s.t}</button>
                ))}
            </div>

            {source === "emf" && (
                <div className="rounded-lg border p-4 text-sm space-y-2">
                    <p><strong>EMF feedback</strong> derives speed from the armature: <span className="font-mono">n ∝ (Vₐ − Iₐ·Rₐ) / φ</span> — no sensor, cheapest, but:</p>
                    <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1">
                        <li>Accuracy depends on knowing Rₐ and flux; typically ±1–2% and load-sensitive.</li>
                        <li>No usable feedback near zero speed → poor low-speed holding and no true standstill torque control.</li>
                        <li>Feedback source: <span className="font-mono text-red-600 dark:text-red-400">DCS880 90.41</span> / <span className="font-mono text-sky-600 dark:text-sky-400">6RA80 p50083 = 3</span>.</li>
                    </ul>
                </div>
            )}
            {source === "tacho" && (
                <div className="grid sm:grid-cols-2 gap-4 items-start">
                    <div className="space-y-4">
                        <Slider label="Tacho constant" value={kTacho} set={setKTacho} min={5} max={100} step={1} unit=" V/1000rpm" />
                        <div className="rounded-lg border bg-muted/30 p-3 text-xs font-mono text-muted-foreground space-y-1">
                            <p>V(max) = k × n_max / 1000</p>
                            <p>= {kTacho} × {nMax} / 1000 = <span className="text-foreground font-bold">{fmt(tachoV, 1)} V</span></p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Stat label="Tacho voltage at max speed" value={fmt(tachoV, 1)} unit="V" tone={tachoHigh ? "text-red-500" : ""} />
                        {tachoHigh
                            ? <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Exceeds the ±10 V analog input — add a divider or scale the input (<span className="font-mono">6RA80 p50083=1</span> + input scaling / <span className="font-mono">DCS880 90.xx</span>).</p>
                            : <p className="text-xs text-muted-foreground">Within a ±10 V analog input. Scale the tacho input so V(max) = full-scale = max speed.</p>}
                    </div>
                </div>
            )}
            {source === "encoder" && (
                <div className="grid sm:grid-cols-2 gap-4 items-start">
                    <div className="space-y-4">
                        <Slider label="Encoder pulses / rev" value={ppr} set={setPpr} min={100} max={5000} step={10} />
                        <div className="rounded-lg border bg-muted/30 p-3 text-xs font-mono text-muted-foreground space-y-1">
                            <p>f(max) = ppr × n_max / 60</p>
                            <p>= {ppr} × {nMax} / 60 = <span className="text-foreground font-bold">{fmt(encHz / 1000, 1)} kHz</span></p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Stat label="Pulse frequency at max speed" value={fmt(encHz / 1000, 1)} unit="kHz" tone={encHigh ? "text-red-500" : ""} />
                        {encHigh
                            ? <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Above ~300 kHz typical input limit — use a lower-resolution encoder or check the board spec.</p>
                            : <p className="text-xs text-muted-foreground">Within a typical ~300 kHz input limit. Enter pulses/rev at <span className="font-mono text-sky-600 dark:text-sky-400">6RA80 p50741</span> / <span className="font-mono text-red-600 dark:text-red-400">DCS880 92.xx</span>. Quadrature gives ×4 resolution.</p>}
                    </div>
                </div>
            )}

            {/* Polarity check */}
            <div className={`rounded-lg border-2 p-4 ${reversed ? "border-red-400/60 bg-red-50 dark:bg-red-950/30" : "border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/30"}`}>
                <div className="flex items-center justify-between gap-3 mb-2">
                    <p className={`font-semibold text-sm ${reversed ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                        Feedback polarity: {reversed ? "REVERSED — runaway!" : "correct"}
                    </p>
                    <button onClick={() => setReversed((r) => !r)} className="text-xs font-semibold rounded-md border px-2.5 py-1.5 bg-background hover:bg-muted">
                        Flip polarity
                    </button>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-slate-900">
                    <line x1={pl} y1={H - pb - ((1 / 2) * (H - pb - pt))} x2={W - pr} y2={H - pb - ((1 / 2) * (H - pb - pt))} stroke="#475569" strokeDasharray="4 4" />
                    <polyline points={pts.join(" ")} fill="none" stroke={reversed ? "#f87171" : "#4ade80"} strokeWidth="2.5" />
                </svg>
                <p className={`text-xs mt-2 ${reversed ? "text-red-700 dark:text-red-200" : "text-emerald-700 dark:text-emerald-200"}`}>
                    {reversed
                        ? "A reversed tacho/encoder sign turns the speed loop into positive feedback: the drive reads 'too slow', pushes more armature voltage, speed climbs, error grows — an instant overspeed. ALWAYS verify feedback sign at low speed before closing the loop."
                        : "Correct sign gives negative feedback: the drive corrects toward the setpoint and settles. Confirm by jogging at low speed and checking the actual-speed sign matches the command."}
                </p>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TOOL 8 — OPTIMIZATION-RUN GUIDE (Siemens 6RA80  p50051)
// ═══════════════════════════════════════════════════════════════════════════════
const OPT_RUNS = [
    { id: 24, title: "Current-controller pre-optimization", moves: "Standstill", motion: "safe", does: "Measures offsets and pre-controls the armature & field current controllers.", precond: "Line contactor on, field applied, motor at standstill and unable to turn.", result: "Current-loop offsets & precontrol set.", fail: "Faults if the motor rotates or no armature current can flow — check enable, contactor and mechanical brake." },
    { id: 25, title: "Armature & field current-controller optimization", moves: "Standstill", motion: "safe", does: "Records armature resistance & inductance, tunes both current controllers (Kp, Ti).", precond: "Standstill, field on; armature current is injected.", result: "Current-controller gains set — fast, ripple-free torque.", fail: "If Rₐ/Lₐ readings look wrong, check armature wiring and that the motor truly can't turn." },
    { id: 26, title: "Speed-controller optimization", moves: "Motor SPINS", motion: "danger", does: "Determines total moment of inertia and tunes the speed controller.", precond: "Machine coupled and free to rotate through the working range; guards in place.", result: "Speed-loop gain & integral time set.", fail: "Wrong inertia → sluggish/oscillatory speed. Ensure the load is representative and nothing is jammed." },
    { id: 27, title: "Field-weakening / EMF-controller optimization", moves: "Motor SPINS", motion: "danger", does: "Records the magnetization curve and tunes the EMF / field-weakening controller.", precond: "Motor able to run up to and above base speed; overspeed protection verified.", result: "Magnetization characteristic & EMF controller set — clean field weakening.", fail: "Runs the motor into field weakening — confirm max-speed rating and load first." },
    { id: 28, title: "Friction & inertia compensation", moves: "Motor SPINS", motion: "danger", does: "Measures friction and inertia across speed for the speed-loop feedforward.", precond: "Motor free to run across the full speed range with the real load.", result: "Friction/inertia feedforward set — better dynamic tracking.", fail: "Do last, after 26/27. Unrepresentative load gives poor compensation." },
];

const OptimizationRuns = () => (
    <div className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            On the <strong>6RA80</strong> you trigger each optimization by setting <span className="font-mono">p50051</span> to the run number,
            then giving an ON command — the drive performs the run and writes the results. Do them <strong>in order</strong>.
            On the <strong>DCS880</strong> the equivalent is the built-in <strong>autotuning / ID run</strong> assistant rather than a numbered parameter.
        </div>
        <div className="grid md:grid-cols-2 gap-3">
            {OPT_RUNS.map((r) => (
                <div key={r.id} className={`rounded-lg border-2 p-4 space-y-2 ${r.motion === "danger" ? "border-red-400/40" : "border-emerald-400/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm flex items-center gap-2">
                            <span className="font-mono rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs">p50051 = {r.id}</span>
                            {r.title}
                        </p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.motion === "danger" ? "bg-red-500/15 text-red-600 dark:text-red-300" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"}`}>{r.moves}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.does}</p>
                    <div className="text-xs space-y-1">
                        <p><span className="font-semibold">Precondition:</span> <span className="text-muted-foreground">{r.precond}</span></p>
                        <p><span className="font-semibold">Result:</span> <span className="text-muted-foreground">{r.result}</span></p>
                        <p><span className="font-semibold">If it fails:</span> <span className="text-muted-foreground">{r.fail}</span></p>
                    </div>
                </div>
            ))}
        </div>
        <div className="rounded-lg border-2 border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 p-4 text-sm text-orange-900 dark:text-orange-200">
            <p className="font-bold flex items-center gap-2 text-orange-700 dark:text-orange-300 mb-1"><ShieldAlert className="h-4 w-4" />Safety</p>
            Runs 26–28 <strong>rotate the motor</strong>, and 27 drives it above base speed. Clear the machine, verify E-stop and overspeed
            protection, and be ready to trip. After all runs, <strong>save</strong> — <span className="font-mono">6RA80 p0977 = 1</span> / <span className="font-mono">DCS880 group 96</span>.
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
//  COMMISSIONING TAB — wraps the reference + the interactive commissioning tools
// ═══════════════════════════════════════════════════════════════════════════════
const DrivesTab = ({ np, derived }) => {
    const [sub, setSub] = useState("reference");
    const SUBS = [
        { k: "reference", t: "Reference" },
        { k: "fw", t: "Field-weakening calc" },
        { k: "pi", t: "PI tuning" },
        { k: "feedback", t: "Feedback & polarity" },
        { k: "opt", t: "Optimization runs" },
    ];
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
                {SUBS.map((s) => (
                    <button key={s.k} onClick={() => setSub(s.k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${sub === s.k ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}>
                        {s.t}
                    </button>
                ))}
            </div>
            {sub === "reference" ? <CommissionReference />
                : sub === "fw" ? <FieldWeakeningCalc np={np} derived={derived} />
                    : sub === "pi" ? <PITuningSim />
                        : sub === "feedback" ? <FeedbackCheck np={np} />
                            : <OptimizationRuns />}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const DCMotorDrive = () => {
    const [tab, setTab] = useState("motor");
    const [np, setNp] = useState(DEFAULT_NAMEPLATE);
    const derived = useMemo(() => deriveMotor(np), [np]);
    const usesNameplate = tab === "playground" || tab === "drive" || tab === "commission";

    return (
        <div className="max-w-6xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <Link to="/knowledge" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Knowledge
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Zap className="h-6 w-6 text-primary" />
                    DC Motor &amp; DC Drive
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    How a DC motor works, an interactive motor playground, and the DC-drive speed-control envelope —
                    armature-voltage control, base speed, full speed, flux and field weakening.
                </p>
            </div>

            <div className="flex flex-wrap rounded-lg border overflow-hidden text-sm font-semibold w-fit">
                {[
                    { key: "motor", label: "The DC Motor", icon: Cog },
                    { key: "playground", label: "Motor Playground", icon: Gauge },
                    { key: "drive", label: "DC Drive & Field Weakening", icon: TrendingUp },
                    { key: "commission", label: "DCS880 & 6RA80 Commissioning", icon: Cpu },
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

            {usesNameplate && <Nameplate np={np} setNp={setNp} derived={derived} />}

            {tab === "motor" ? <MotorBasicsTab />
                : tab === "playground" ? <MotorPlayground np={np} derived={derived} />
                    : tab === "drive" ? <DriveTab np={np} derived={derived} />
                        : <DrivesTab np={np} derived={derived} />}
        </div>
    );
};

export default DCMotorDrive;

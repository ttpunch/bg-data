import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowRightLeft, AlertTriangle, Cpu } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const ErrorBox = ({ msg }) => (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mt-4">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{msg}</span>
    </div>
);

const Legend = () => (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2">
        <span className="flex items-center gap-1.5 text-sm">
            <span className="inline-block w-3 h-3 rounded-full bg-red-600" />
            <span className="text-red-600 font-medium">Red</span>
            <span className="text-muted-foreground">= FM / Fault Message — requires acknowledgement</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm">
            <span className="inline-block w-3 h-3 rounded-full bg-blue-600" />
            <span className="text-blue-600 font-medium">Blue</span>
            <span className="text-muted-foreground">= OM / Operator Message — clears when bit resets</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm">
            <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-orange-600 font-medium">Info</span>
            <span className="text-muted-foreground">MD14516 configures alarm response and cancel criteria</span>
        </span>
    </div>
);

const ResultCard = ({ result }) => {
    if (!result) return null;
    if (result.error) return <ErrorBox msg={result.error} />;
    const isFM = result.type === "FM" || result.type === "EM";
    const border = isFM
        ? "border-red-400/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
        : "border-blue-400/60 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300";
    const badge = isFM ? "bg-red-600 text-white" : "bg-blue-600 text-white";
    return (
        <div className={`rounded-lg border-2 px-4 py-3 mt-4 ${border}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${badge}`}>{result.type}</span>
                <span className="text-sm font-medium">{result.label}</span>
                {result.axis !== undefined && (
                    <span className="ml-auto text-xs font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                        Axis / Spindle {result.axis}
                    </span>
                )}
                {result.range !== undefined && (
                    <span className="ml-auto text-xs font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                        User Range {result.range}
                    </span>
                )}
            </div>
            <p className="text-2xl font-mono font-bold tracking-wide">{result.address ?? result.alarm}</p>
            {result.alarm && <p className="text-sm mt-1 opacity-80">Alarm No: <span className="font-semibold">{result.alarm}</span></p>}
            {result.byte !== undefined && (
                <p className="text-sm mt-0.5 opacity-80">
                    Byte: <span className="font-semibold">{result.byte}</span>{"  ·  "}Bit: <span className="font-semibold">{result.bit}</span>
                </p>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  700000 SERIES — User PLC Alarms (ExtendAlMsg = FALSE)
//  32 User Ranges (0–31). Range N base = 700000 + N×100
//    Offsets 00–31 → FM (bytes 1–4 of range) RED
//    Offsets 32–63 → OM (bytes 5–8 of range) BLUE
//    Offsets 64–99 → UNUSED
//  DB2 Byte = 180 + range×8 + ⌊offset÷8⌋   Byte range: 180–435
// ═══════════════════════════════════════════════════════════════════════════════
function alarm700toDb(str) {
    const alarm = parseInt(str, 10);
    if (isNaN(alarm) || alarm < 700000) return { error: "Alarm must start with 700000" };
    const rel = alarm - 700000;
    const range = Math.floor(rel / 100);
    const offset = rel % 100;
    if (offset > 63) return { error: `Offsets 64–99 unused. Valid: ${700000 + range * 100}–${700000 + range * 100 + 63}` };
    if (range > 31) return { error: "Only user ranges 0–31 are supported (max alarm ~703163)" };
    const byte_ = 180 + range * 8 + Math.floor(offset / 8);
    const bit = offset % 8;
    const isFM = offset < 32;
    return {
        byte: byte_, bit, address: `DB2.DBX${byte_}.${bit}`, range,
        type: isFM ? "FM" : "OM", label: isFM ? "Fault Message (FM)" : "Operator Message (OM)"
    };
}

function db700toAlarm(input) {
    const m = input.match(/(\d+)\.(\d)/);
    if (!m) return { error: 'Enter as "byte.bit" e.g. 180.0 or DB2.DBX184.0' };
    const byte_ = parseInt(m[1], 10);
    const bit = parseInt(m[2], 10);
    if (bit < 0 || bit > 7) return { error: "Bit must be 0–7" };
    if (byte_ < 180 || byte_ > 435) return { error: "Byte must be 180–435 for 700000 series" };
    const relByte = byte_ - 180;
    const range = Math.floor(relByte / 8);
    const bInR = relByte % 8;
    const isFM = bInR < 4;
    const offset = bInR * 8 + bit;
    const alarm = 700000 + range * 100 + offset;
    return {
        alarm, address: `DB2.DBX${byte_}.${bit}`, range,
        type: isFM ? "FM" : "OM", label: isFM ? "Fault Message (FM)" : "Operator Message (OM)"
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  600000 SERIES — Axis / Spindle Alarms
//
//  Two modes (FB1 parameter ExtendAlMsg):
//
//  FALSE → DB2 bytes start at 144
//    Axis N FM: Byte 144 + (N−1)×2   alarms 600{N×100+0}  – 600{N×100+7}
//    Axis N OM: Byte 145 + (N−1)×2   alarms 600{N×100+8}  – 600{N×100+15}
//
//  TRUE  → DB2 bytes start at 490
//    Axis N FM: Byte 490 + (N−1)×2   alarms 600{N×100+0}  – 600{N×100+7}
//    Axis N OM: Byte 491 + (N−1)×2   alarms 600{N×100+8}  – 600{N×100+15}
//
//  Alarm numbers are IDENTICAL in both modes — only the DB2 byte changes.
// ═══════════════════════════════════════════════════════════════════════════════
const MODES_600 = {
    FALSE: { startByte: 144, maxByte: 205, label: "ExtendAlMsg = FALSE", axes: "1–31" },
    TRUE: { startByte: 490, maxByte: 551, label: "ExtendAlMsg = TRUE", axes: "1–31" },
};

function alarm600toDb(str, startByte) {
    const alarm = parseInt(str, 10);
    if (isNaN(alarm) || alarm < 600100) return { error: "Alarm must start from 600100 (axis 1 minimum)" };
    const rel = alarm - 600000;
    const axis = Math.floor(rel / 100);
    const offset = rel % 100;
    if (axis < 1 || axis > 31) return { error: "Axis must be 1–31 (alarms 600100 – 603115)" };
    if (offset > 15) return { error: `Last 2 digits must be 00–15 (00-07=FM, 08-15=OM). Valid: ${600000 + axis * 100}–${600000 + axis * 100 + 15}` };
    const isFM = offset < 8;
    const byte_ = startByte + (axis - 1) * 2 + (isFM ? 0 : 1);
    const bit = offset % 8;
    return {
        byte: byte_, bit, address: `DB2.DBX${byte_}.${bit}`, axis,
        type: isFM ? "FM" : "OM", label: isFM ? "Fault Message (FM)" : "Operator Message (OM)"
    };
}

function db600toAlarm(input, startByte) {
    const m = input.match(/(\d+)\.(\d)/);
    if (!m) return { error: `Enter as "byte.bit" e.g. ${startByte}.0 or DB2.DBX${startByte}.0` };
    const byte_ = parseInt(m[1], 10);
    const bit = parseInt(m[2], 10);
    if (bit < 0 || bit > 7) return { error: "Bit must be 0–7" };
    const maxByte = startByte + 62; // 31 axes × 2 bytes
    if (byte_ < startByte || byte_ > maxByte)
        return { error: `Byte must be ${startByte}–${maxByte} for this mode` };
    const relByte = byte_ - startByte;
    const axis = Math.floor(relByte / 2) + 1;
    const byteInPair = relByte % 2;
    const isFM = byteInPair === 0;
    const offset = byteInPair * 8 + bit;
    const alarm = 600000 + axis * 100 + offset;
    return {
        alarm, address: `DB2.DBX${byte_}.${bit}`, axis,
        type: isFM ? "FM" : "OM", label: isFM ? "Fault Message (FM)" : "Operator Message (OM)"
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIEMENS 828D User Alarms (700000 - 700247)
//  Mapped to DB1600.DBX0.0 through DB1600.DBX30.7
// ═══════════════════════════════════════════════════════════════════════════════
function alarm828DToDb(str) {
    const alarm = parseInt(str, 10);
    if (isNaN(alarm) || alarm < 700000 || alarm > 700247)
        return { error: "Alarm must be between 700000 and 700247" };

    const offset = alarm - 700000;
    const byte_ = Math.floor(offset / 8);
    const bit = offset % 8;
    return {
        byte: byte_, bit, address: `DB1600.DBX${byte_}.${bit}`,
        type: "User Alarm", label: "Siemens 828D User Alarm"
    };
}

function db828DToAlarm(input) {
    const m = input.match(/(\d+)\.(\d)/);
    if (!m) return { error: 'Enter as "byte.bit" e.g. 0.0 or DB1600.DBX0.0' };

    let byte_ = parseInt(m[1], 10);
    const bit = parseInt(m[2], 10);

    if (byte_ === 1600) return { error: "Please enter the byte offset, not the DB number. E.g. '0.0' for DB1600.DBX0.0" };

    if (bit < 0 || bit > 7) return { error: "Bit must be 0–7" };
    if (byte_ < 0 || byte_ > 30) return { error: "Byte must be 0–30 for 828D 700000 series (DB1600)" };

    const offset = (byte_ * 8) + bit;
    const alarm = 700000 + offset;

    if (alarm > 700247) return { error: "Alarm exceeds 700247 (max 828D user alarm)" };

    return {
        alarm, address: `DB1600.DBX${byte_}.${bit}`,
        type: "User Alarm", label: "Siemens 828D User Alarm"
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  REUSABLE CALC SECTION (700000 series)
// ═══════════════════════════════════════════════════════════════════════════════
const CalcSection = ({ title, icon: Icon, description, leftLabel, leftPlaceholder, leftHint, leftFormula,
    rightLabel, rightPlaceholder, rightHint, rightFormula, onLeft, onRight }) => {
    const [leftVal, setLeftVal] = useState("");
    const [leftRes, setLeftRes] = useState(null);
    const [rightVal, setRightVal] = useState("");
    const [rightRes, setRightRes] = useState(null);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
                <Icon className="h-5 w-5 text-primary" />
                <div><h2 className="text-lg font-bold">{title}</h2>
                    <p className="text-xs text-muted-foreground">{description}</p></div>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
                <Card className="shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm">{leftLabel}</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => { e.preventDefault(); setLeftRes(onLeft(leftVal)); }} className="space-y-3">
                            <div className="grid gap-1.5">
                                <label className="text-sm font-medium">Alarm Number</label>
                                <Input placeholder={leftPlaceholder} value={leftVal} maxLength={7}
                                    onChange={(e) => { setLeftVal(e.target.value); setLeftRes(null); }} />
                                {leftHint && <p className="text-xs text-muted-foreground">{leftHint}</p>}
                            </div>
                            <Button type="submit" className="w-full">Calculate →</Button>
                        </form>
                        <ResultCard result={leftRes} />
                        <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
                            <p className="font-semibold text-foreground mb-1">Formula (official docs)</p>
                            {leftFormula.map((f, i) => <p key={i}>{f}</p>)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm">
                    <CardHeader className="pb-3"><CardTitle className="text-sm">{rightLabel}</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => { e.preventDefault(); setRightRes(onRight(rightVal)); }} className="space-y-3">
                            <div className="grid gap-1.5">
                                <label className="text-sm font-medium">DB Address</label>
                                <Input placeholder={rightPlaceholder} value={rightVal}
                                    onChange={(e) => { setRightVal(e.target.value); setRightRes(null); }} />
                                {rightHint && <p className="text-xs text-muted-foreground">{rightHint}</p>}
                            </div>
                            <Button type="submit" className="w-full">Calculate →</Button>
                        </form>
                        <ResultCard result={rightRes} />
                        <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
                            <p className="font-semibold text-foreground mb-1">Formula (official docs)</p>
                            {rightFormula.map((f, i) => <p key={i}>{f}</p>)}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  600000 SECTION — with ExtendAlMsg toggle
// ═══════════════════════════════════════════════════════════════════════════════
const Axis600Section = () => {
    const [mode, setMode] = useState("FALSE");
    const [leftVal, setLeftVal] = useState("");
    const [leftRes, setLeftRes] = useState(null);
    const [rightVal, setRightVal] = useState("");
    const [rightRes, setRightRes] = useState(null);

    const cfg = MODES_600[mode];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
                <Cpu className="h-5 w-5 text-primary" />
                <div>
                    <h2 className="text-lg font-bold">Axis / Spindle Alarms — 600000 to 603115</h2>
                    <p className="text-xs text-muted-foreground">
                        Axes 1–31. FM byte (offsets 00–07 = red), OM byte (offsets 08–15 = blue).
                    </p>
                </div>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">FB1 ExtendAlMsg:</span>
                <div className="flex rounded-lg border overflow-hidden text-sm font-semibold">
                    {["FALSE", "TRUE"].map((m) => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setLeftRes(null); setRightRes(null); }}
                            className={`px-4 py-1.5 transition-colors ${mode === m
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:bg-muted"
                                }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">
                    {mode === "FALSE"
                        ? `→ DB2 bytes 144–${144 + 62} (axis 1 = byte 144)`
                        : `→ DB2 bytes 490–551 (axis 1 = byte 490)`}
                </span>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
                {/* Alarm → DB */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Alarm No. → DB Address + Axis</CardTitle>
                        <CardDescription className="text-xs">
                            Format: 600[axis×100][00–07 FM / 08–15 OM]
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => { e.preventDefault(); setLeftRes(alarm600toDb(leftVal, cfg.startByte)); }} className="space-y-3">
                            <div className="grid gap-1.5">
                                <label className="text-sm font-medium">Alarm Number</label>
                                <Input placeholder="e.g. 600100 or 600108" value={leftVal} maxLength={7}
                                    onChange={(e) => { setLeftVal(e.target.value); setLeftRes(null); }} />
                                <p className="text-xs text-muted-foreground">
                                    e.g. 600100 = Axis 1 FM, 600108 = Axis 1 OM, 600200 = Axis 2 FM
                                </p>
                            </div>
                            <Button type="submit" className="w-full">Calculate →</Button>
                        </form>
                        <ResultCard result={leftRes} />
                        <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
                            <p className="font-semibold text-foreground mb-1">Formula — {cfg.label}</p>
                            <p>axis   = ⌊(Alarm − 600000) ÷ 100⌋</p>
                            <p>offset = (Alarm − 600000) mod 100  (0–15)</p>
                            <p>Byte   = <strong>{cfg.startByte}</strong> + (axis−1)×2 + (offset≥8 ? 1 : 0)</p>
                            <p>Bit    = offset mod 8</p>
                            <p>offset 0–7 → FM 🔴  |  8–15 → OM 🔵</p>
                        </div>
                    </CardContent>
                </Card>

                {/* DB → Alarm */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">DB Address → Alarm No. + Axis</CardTitle>
                        <CardDescription className="text-xs">
                            {cfg.label}: bytes {cfg.startByte}–{cfg.startByte + 62}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => { e.preventDefault(); setRightRes(db600toAlarm(rightVal, cfg.startByte)); }} className="space-y-3">
                            <div className="grid gap-1.5">
                                <label className="text-sm font-medium">DB Address</label>
                                <Input placeholder={`e.g. ${cfg.startByte}.0 or DB2.DBX${cfg.startByte + 1}.3`} value={rightVal}
                                    onChange={(e) => { setRightVal(e.target.value); setRightRes(null); }} />
                                <p className="text-xs text-muted-foreground">
                                    Type "byte.bit" or paste full address like DB2.DBX{cfg.startByte}.0
                                </p>
                            </div>
                            <Button type="submit" className="w-full">Calculate →</Button>
                        </form>
                        <ResultCard result={rightRes} />
                        <div className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
                            <p className="font-semibold text-foreground mb-1">Formula — {cfg.label}</p>
                            <p>axis       = ⌊(Byte − <strong>{cfg.startByte}</strong>) ÷ 2⌋ + 1</p>
                            <p>byteInPair = (Byte − <strong>{cfg.startByte}</strong>) mod 2</p>
                            <p>offset     = byteInPair×8 + Bit</p>
                            <p>Alarm      = 600000 + axis×100 + offset</p>
                            <p>byteInPair 0 → FM 🔴  |  1 → OM 🔵</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const AlarmCalculator = () => (
    <div className="max-w-4xl mx-auto space-y-10 mt-6 px-4 pb-12">
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ArrowRightLeft className="h-6 w-6 text-primary" />
                Siemens Alarm ↔ DB Calculator
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
                Bidirectional conversions for Siemens 840D and 828D.
            </p>
            <Legend />
        </div>

        {/* 840D 700000 User Alarms */}
        <CalcSection
            title="Siemens 840D: User PLC Alarms — 700000 to 703163"
            icon={ArrowRightLeft}
            description="32 User Ranges (0–31). Each range: offsets 00–31=FM (red), 32–63=OM (blue). Offsets 64–99 unused."
            leftLabel="Alarm No. → DB Address"
            leftPlaceholder="e.g. 700000 or 700032"
            leftHint="Range N: base = 700000 + N×100. Offsets 00–31=FM, 32–63=OM"
            leftFormula={[
                "range  = ⌊(Alarm − 700000) ÷ 100⌋",
                "offset = (Alarm − 700000) mod 100",
                "Byte   = 180 + range×8 + ⌊offset÷8⌋",
                "Bit    = offset mod 8",
                "offset 00–31 → FM 🔴  |  32–63 → OM 🔵",
            ]}
            rightLabel="DB Address → Alarm No."
            rightPlaceholder="e.g. 180.0 or DB2.DBX184.0"
            rightHint="Byte range: 180–435. Type byte.bit or paste full DB2 address"
            rightFormula={[
                "range       = ⌊(Byte − 180) ÷ 8⌋",
                "byteInRange = (Byte − 180) mod 8",
                "offset      = byteInRange×8 + Bit",
                "Alarm       = 700000 + range×100 + offset",
                "byteInRange 0–3 → FM 🔴  |  4–7 → OM 🔵",
            ]}
            onLeft={alarm700toDb}
            onRight={db700toAlarm}
        />

        <div className="border-t mt-8 mb-4 border-dashed" />

        {/* 828D 700000 User Alarms */}
        <CalcSection
            title="Siemens 828D: User PLC Alarms — 700000 to 700247"
            icon={ArrowRightLeft}
            description="248 User Alarms. Mapped sequentially starting from DB1600.DBX0.0."
            leftLabel="Alarm No. → DB Address"
            leftPlaceholder="e.g. 700000 or 700140"
            leftHint="Must be between 700000 and 700247"
            leftFormula={[
                "offset = Alarm − 700000",
                "Byte   = ⌊offset ÷ 8⌋",
                "Bit    = offset mod 8",
                "Address = DB1600.DBX[Byte].[Bit]"
            ]}
            rightLabel="DB Address → Alarm No."
            rightPlaceholder="e.g. 0.0 or DB1600.DBX0.0"
            rightHint="Byte offset 0–30 in DB1600"
            rightFormula={[
                "offset = (Byte × 8) + Bit",
                "Alarm  = 700000 + offset"
            ]}
            onLeft={alarm828DToDb}
            onRight={db828DToAlarm}
        />
        <div className="border-t" />

        {/* 600000 Axis/Spindle — with mode toggle */}
        <Axis600Section />

        <div className="border-t mt-8 mb-4 border-dashed" />

        {/* MD14516 Info Section */}
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-3">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                    <h2 className="text-lg font-bold">Siemens 828D Machine Data 14516: Alarm Response & Cancel Criteria</h2>
                    <p className="text-xs text-muted-foreground">
                        How the 828D system responds when a User PLC Alarm is triggered.
                    </p>
                </div>
            </div>

            <Card className="shadow-sm border-orange-200 dark:border-orange-950">
                <CardContent className="pt-6">
                    <p className="text-sm font-medium mb-3 pb-2 border-b">
                        Parameter: <code className="bg-muted px-1.5 py-0.5 rounded text-primary">MD14516[x]</code> (where x = Alarm No. − 700000)
                    </p>
                    <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
                        <div className="space-y-2">
                            <h3 className="font-bold text-foreground opacity-80 uppercase text-xs tracking-wider">Bit Meaning (Response)</h3>
                            <ul className="space-y-1.5 text-muted-foreground">
                                <li><span className="font-mono text-primary mr-2">Bit 0:</span> NC Start disable</li>
                                <li><span className="font-mono text-primary mr-2">Bit 1:</span> Read-in disable</li>
                                <li><span className="font-mono text-primary mr-2">Bit 2:</span> Feed disable for all axes</li>
                                <li><span className="font-mono text-primary mr-2">Bit 3:</span> Emergency stop</li>
                                <li><span className="font-mono text-primary mr-2">Bit 4:</span> PLC STOP</li>
                            </ul>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-lg flex flex-col justify-center">
                            <p className="italic text-muted-foreground">
                                "If no alarm response (bits 0 to 4) is activated for a specific user alarm, it functions merely as a <strong>Display message</strong> without triggering any system actions."
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

    </div>
);

export default AlarmCalculator;

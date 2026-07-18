import React, { useState } from "react";
import { Input } from "../ui/input";
import { isErr, parseNumber, realToBits, explainReal, parseS5Time, parseTime, formatTime } from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const hex = (n, digits) => "16#" + n.toString(16).toUpperCase().padStart(digits, "0");

const Special = ({ special }) =>
    special ? (
        <span className="text-orange-600 dark:text-orange-400">{special}</span>
    ) : (
        "— ordinary number"
    );

const RealSection = () => {
    const [raw, setRaw] = useState("1.0");
    const asFloat = Number(raw);
    const valid = raw.trim() !== "" && Number.isFinite(asFloat);
    const bits = valid ? realToBits(asFloat) : null;
    const info = valid ? explainReal(bits) : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">REAL value</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="1.0"
                    className="font-mono mt-1"
                />
            </div>

            {!valid && raw.trim() !== "" && <ErrorBox msg={`"${raw}" is not a number`} />}

            {valid && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="32-bit pattern" value={hex(bits, 8)} />
                    <Row
                        label="Binary"
                        value={bits.toString(2).padStart(32, "0").replace(/(.{8})/g, "$1 ").trim()}
                    />
                    <Row label="Sign" value={`${info.sign} (${info.sign ? "negative" : "positive"})`} />
                    <Row
                        label="Exponent"
                        value={`${info.exponent}`}
                        hint={`biased; unbiased ${info.exponent - 127}`}
                    />
                    <Row label="Mantissa" value={hex(info.mantissa, 6)} />
                    <Row label="Special" value={<Special special={info.special} />} />
                </div>
            )}
        </div>
    );
};

const BitsSection = () => {
    const [raw, setRaw] = useState("16#3F800000");
    const parsed = parseNumber(raw);
    const err = isErr(parsed) ? parsed.error : null;
    const info = err ? null : explainReal(parsed.value);

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                    32-bit pattern to REAL
                </label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="16#3F800000"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="REAL value" value={String(info.value)} />
                    <Row label="Special" value={<Special special={info.special} />} />
                </div>
            )}
        </div>
    );
};

const S5Section = () => {
    const [raw, setRaw] = useState("S5T#2s");
    const r = parseS5Time(raw);
    const err = isErr(r) ? r.error : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">S5TIME</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="S5T#2s"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <>
                    <div className="mt-4 rounded-lg border border-border p-4">
                        <Row label="Encoded word" value={hex(r.bits, 4)} />
                        <Row label="Time base" value={r.base} hint={`${r.baseMs} ms per count`} />
                        <Row label="Value (BCD)" value={`${r.value}`} hint={hex(r.bits % 4096, 3)} />
                        <Row label="Duration" value={`${r.ms.toLocaleString("en-US")} ms`} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        STEP7 picks the smallest time base that fits, for best resolution — so
                        S5T#2s is base 10ms with a count of 200, not base 1s with a count of 2.
                    </p>
                </>
            )}
        </div>
    );
};

const TimeSection = () => {
    const [raw, setRaw] = useState("T#1d2h3m4s5ms");
    const ms = parseTime(raw);
    const err = isErr(ms) ? ms.error : null;

    return (
        <div>
            <div className="max-w-xs">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">TIME</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="T#1d2h3m4s5ms"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}

            {!err && (
                <div className="mt-4 rounded-lg border border-border p-4">
                    <Row label="Milliseconds (DINT)" value={ms.toLocaleString("en-US")} />
                    <Row label="Hex" value={hex(ms, 8)} />
                    <Row label="Normalised" value={formatTime(ms)} />
                </div>
            )}
        </div>
    );
};

const SECTIONS = [
    { id: "real", label: "REAL → bits", render: () => <RealSection /> },
    { id: "bits", label: "bits → REAL", render: () => <BitsSection /> },
    { id: "s5time", label: "S5TIME", render: () => <S5Section /> },
    { id: "time", label: "TIME", render: () => <TimeSection /> },
];

const RealTimeTab = () => {
    const [section, setSection] = useState("real");
    return (
        <div>
            <div className="flex flex-wrap gap-1">
                {SECTIONS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setSection(s.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                            section === s.id
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
            <div className="mt-5">{SECTIONS.find((s) => s.id === section).render()}</div>
        </div>
    );
};

export default RealTimeTab;

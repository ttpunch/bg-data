import React from "react";
import { Input } from "../ui/input";
import { interpret, splitBE } from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const WIDTHS = [
    { bytes: 1, label: "BYTE (8)" },
    { bytes: 2, label: "WORD (16)" },
    { bytes: 4, label: "DWORD (32)" },
];

const SIGNED_NAME = { 1: "SINT", 2: "INT", 4: "DINT" };
const UNSIGNED_NAME = { 1: "BYTE", 2: "WORD", 4: "DWORD" };

// Siemens numbers bit 7 as the MSB within each byte.
const BitGrid = ({ value, widthBytes, onToggle }) => {
    const bytes = splitBE(value, widthBytes);
    return (
        <div className="flex flex-wrap gap-3 mt-4">
            {bytes.map((b, byteIdx) => (
                <div key={byteIdx} className="rounded-md border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 text-center">
                        Byte {byteIdx}
                        {byteIdx === 0 && widthBytes > 1 ? " (MSB)" : ""}
                    </div>
                    <div className="flex gap-1">
                        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => {
                            const on = Math.floor(b / 2 ** bit) % 2 === 1;
                            const absBit = (widthBytes - 1 - byteIdx) * 8 + bit;
                            return (
                                <button
                                    key={bit}
                                    type="button"
                                    onClick={() => onToggle(absBit)}
                                    title={`Bit ${bit} of byte ${byteIdx}`}
                                    className={`w-7 h-9 rounded text-xs font-mono border transition-colors ${
                                        on
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted/40 text-muted-foreground border-border hover:bg-accent"
                                    }`}
                                >
                                    {on ? 1 : 0}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex gap-1 mt-1">
                        {[7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (
                            <div
                                key={bit}
                                className="w-7 text-[10px] text-center text-muted-foreground font-mono"
                            >
                                {bit}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

const NumberTab = ({ value, widthBytes, raw, error, onRawChange, onValueChange, onWidthChange }) => {
    const r = interpret(value, widthBytes);

    // 2**absBit rather than a shift: a DWORD's top bit would go negative under <<.
    const toggleBit = (absBit) => {
        const on = Math.floor(value / 2 ** absBit) % 2 === 1;
        onValueChange(on ? value - 2 ** absBit : value + 2 ** absBit);
    };

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Value</label>
                    <Input
                        value={raw}
                        onChange={(e) => onRawChange(e.target.value)}
                        placeholder="16#FF, 0xFF, FFh, 2#1010 or 255"
                        className="font-mono mt-1"
                    />
                </div>
                <div className="flex gap-1">
                    {WIDTHS.map((w) => (
                        <button
                            key={w.bytes}
                            type="button"
                            onClick={() => onWidthChange(w.bytes)}
                            className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                                widthBytes === w.bytes
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:bg-accent"
                            }`}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && <ErrorBox msg={error} />}

            <div className="mt-5 rounded-lg border border-border p-4">
                <Row label="Hex" value={r.hex} />
                <Row
                    label="Decimal (unsigned)"
                    value={r.unsigned.toLocaleString("en-US")}
                    hint={UNSIGNED_NAME[widthBytes]}
                />
                <Row
                    label="Decimal (signed)"
                    value={r.signed.toLocaleString("en-US")}
                    hint={SIGNED_NAME[widthBytes]}
                />
                <Row label="Binary" value={r.binary.replace(/(.{8})/g, "$1 ").trim()} />
                <Row
                    label="BCD"
                    value={
                        typeof r.bcd === "object" ? (
                            <span className="text-destructive">{r.bcd.error}</span>
                        ) : (
                            r.bcd.toLocaleString("en-US")
                        )
                    }
                />
                {r.real !== undefined && <Row label="REAL" value={String(r.real)} />}
                <Row
                    label="Bytes (big-endian)"
                    value={r.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}
                />
            </div>

            <BitGrid value={value} widthBytes={widthBytes} onToggle={toggleBit} />
            <p className="text-xs text-muted-foreground mt-2">
                Click a bit to toggle it. Bit 7 is the MSB of each byte, per Siemens numbering.
            </p>
        </div>
    );
};

export default NumberTab;

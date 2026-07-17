import React, { useState } from "react";
import { Input } from "../ui/input";
import {
    isErr,
    parsePointer,
    encodeAreaPointer,
    encodeAnyPointer,
    AREA_IDS,
    ANY_TYPE_CODES,
} from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

const hex = (n, digits) => "16#" + n.toString(16).toUpperCase().padStart(digits, "0");

const ANY_BYTE_ROLES = [
    "ANY id", "type", "count hi", "count lo", "DB hi", "DB lo", "area", "off hi", "off mid", "off lo",
];

const PointerTab = () => {
    const [raw, setRaw] = useState("P#DB10.DBX20.0 BYTE 4");
    const p = parsePointer(raw);
    const err = isErr(p) ? p.error : null;

    const area = err ? null : encodeAreaPointer(p);
    const any = err ? null : encodeAnyPointer(p);
    const areaErr = area !== null && isErr(area) ? area.error : null;
    const anyErr = any !== null && isErr(any) ? any.error : null;
    const ok = !err && !areaErr && !anyErr;

    return (
        <div>
            <div className="max-w-md">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Pointer</label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="P#DB10.DBX20.0 BYTE 4"
                    className="font-mono mt-1"
                />
            </div>

            {err && <ErrorBox msg={err} />}
            {areaErr && <ErrorBox msg={areaErr} />}
            {anyErr && <ErrorBox msg={anyErr} />}

            {ok && (
                <>
                    <div className="mt-5 rounded-lg border border-border p-4">
                        <Row label="Area" value={`${p.area} (${hex(AREA_IDS[p.area], 2)})`} />
                        <Row label="Data block" value={`DB${p.db}`} />
                        <Row label="Byte" value={p.byte} />
                        <Row label="Bit" value={p.bit} />
                        <Row label="Type" value={`${p.type} (${hex(ANY_TYPE_CODES[p.type], 2)})`} />
                        <Row label="Count" value={p.count} />
                    </div>

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            32-bit area pointer
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <Row label="Encoded" value={hex(area, 8)} />
                            <Row label="Bits 24-31" value={`${hex(AREA_IDS[p.area], 2)} — area ${p.area}`} />
                            <Row label="Bits 3-18" value={`${p.byte} — byte offset`} />
                            <Row label="Bits 0-2" value={`${p.bit} — bit number`} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            The byte offset is stored shifted left by 3, so byte {p.byte} becomes{" "}
                            {p.byte * 8} with the bit number in the low three bits.
                        </p>
                    </div>

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            10-byte ANY pointer
                        </div>
                        <div className="overflow-x-auto">
                            <div className="flex gap-1 min-w-max">
                                {any.map((b, i) => (
                                    <div
                                        key={i}
                                        className="rounded border border-border p-2 min-w-[62px] text-center"
                                    >
                                        <div className="text-[10px] text-muted-foreground">Byte {i}</div>
                                        <div className="font-mono text-sm py-0.5">
                                            {b.toString(16).toUpperCase().padStart(2, "0")}
                                        </div>
                                        <div className="text-[9px] text-muted-foreground leading-tight">
                                            {ANY_BYTE_ROLES[i]}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 rounded-lg border border-border p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            Area identifiers
                        </div>
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
                            {Object.entries(AREA_IDS).map(([k, v]) => (
                                <span key={k}>
                                    {k} = {hex(v, 2)}
                                </span>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PointerTab;

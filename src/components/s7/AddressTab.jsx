import React, { useState } from "react";
import { Input } from "../ui/input";
import {
    isErr,
    parseAddress,
    formatAddress,
    bytesForAddress,
    overlaps,
    interpret,
    splitBE,
} from "../../lib/s7";
import { ErrorBox, Row } from "./Shared";

// Every word address sharing a byte with `addr` — the DBW20/DBW21 trap.
// overlaps() returns { error } on bad input, which is truthy, so isErr-check it.
const overlappingWords = (addr) => {
    const out = [];
    for (let b = Math.max(0, addr.byte - 3); b <= addr.byte + addr.widthBytes; b++) {
        const other = parseAddress(`DB${addr.db}.DBW${b}`);
        if (isErr(other)) continue;
        if (b === addr.byte && addr.type === "WORD") continue; // itself
        const hit = overlaps(addr, other);
        if (!isErr(hit) && hit) out.push(formatAddress(other));
    }
    return out;
};

const byteRole = (addr, i) => {
    if (addr.widthBytes === 1) return "only byte";
    if (i === 0) return "high byte (MSB)";
    if (i === addr.widthBytes - 1) return "low byte (LSB)";
    return `byte ${i}`;
};

const ByteMap = ({ addr, bytes }) => (
    <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
        {bytesForAddress(addr).map((offset, i) => (
            <div key={offset} className="rounded-md border border-border p-2 min-w-[104px]">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                    DBB{offset}
                </div>
                <div className="text-lg font-mono text-center py-1">
                    {bytes[i].toString(16).toUpperCase().padStart(2, "0")}
                </div>
                <div className="text-[10px] text-center text-muted-foreground">{byteRole(addr, i)}</div>
            </div>
        ))}
    </div>
);

const AddressTab = ({ value }) => {
    const [rawAddr, setRawAddr] = useState("DB10.DBW20");
    const addr = parseAddress(rawAddr);
    const addrErr = isErr(addr) ? addr.error : null;
    const clashes = addrErr ? [] : overlappingWords(addr);
    const r = addrErr ? null : interpret(value, addr.widthBytes);

    return (
        <div>
            <div className="max-w-sm">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Address</label>
                <Input
                    value={rawAddr}
                    onChange={(e) => setRawAddr(e.target.value)}
                    placeholder="DB10.DBW20 or DB31.DBX60.4"
                    className="font-mono mt-1"
                />
            </div>

            {addrErr && <ErrorBox msg={addrErr} />}

            {!addrErr && (
                <>
                    <div className="mt-5 rounded-lg border border-border p-4">
                        <Row label="Data block" value={`DB${addr.db}`} />
                        <Row label="Type" value={addr.type} />
                        <Row label="Start byte" value={addr.byte} />
                        <Row
                            label="Width"
                            value={`${addr.widthBytes} byte${addr.widthBytes > 1 ? "s" : ""}`}
                        />
                        <Row
                            label="Occupies"
                            value={bytesForAddress(addr)
                                .map((b) => `DBB${b}`)
                                .join(", ")}
                        />
                        {addr.type === "BOOL" && (
                            <Row
                                label="Bit"
                                value={`${addr.bit}`}
                                hint={`absolute bit offset ${addr.byte * 8 + addr.bit}`}
                            />
                        )}
                    </div>

                    <ByteMap addr={addr} bytes={splitBE(value, addr.widthBytes)} />
                    <p className="text-xs text-muted-foreground mt-2">
                        Siemens is big-endian: the lowest byte offset holds the most significant byte.
                    </p>

                    {addr.type !== "BOOL" && clashes.length > 0 && (
                        <div className="mt-5 rounded-lg border border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
                            <div className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                                Overlaps {clashes.join(", ")}
                            </div>
                            <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
                                Consecutive word addresses share a byte. Writing one changes the other —
                                a common and easily-missed source of bugs.
                            </p>
                        </div>
                    )}

                    <div className="mt-5">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                            Same bits, read as
                        </div>
                        <div className="rounded-lg border border-border p-4">
                            <Row label="Hex" value={r.hex} />
                            <Row label="Unsigned" value={r.unsigned.toLocaleString("en-US")} />
                            <Row label="Signed" value={r.signed.toLocaleString("en-US")} />
                            {r.real !== undefined && <Row label="REAL" value={String(r.real)} />}
                            <Row
                                label="Bytes"
                                value={r.bytes
                                    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
                                    .join(" ")}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Value comes from the Number tab. Change it there to see it here.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

export default AddressTab;

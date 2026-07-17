import React, { useState } from "react";
import { Input } from "../ui/input";
import { isErr, parseAddress } from "../../lib/s7";
import { CONTROLS, lookupSignal, searchSignals } from "../../lib/s7Signals";
import { ErrorBox } from "./Shared";

const Hit = ({ hit }) => (
    <div className="rounded-lg border border-border p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <div className="font-medium text-sm">{hit.name}</div>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">{hit.address}</div>
            </div>
            <div className="flex gap-2 shrink-0">
                {hit.resolvedLabel && (
                    <span className="text-xs font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                        {hit.resolvedLabel}
                    </span>
                )}
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {hit.dir}
                </span>
            </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/60">
            Source: {hit.source}
        </div>
    </div>
);

const Miss = ({ control }) => (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm">
        <div className="font-medium">Not in dataset</div>
        <p className="text-muted-foreground text-xs mt-1">
            No verified signal is recorded at this address for {control}. Check the Siemens Lists
            manual. Address decoding on the other tabs still works for any address — only the
            named lookup is limited to entries that could be confirmed.
        </p>
    </div>
);

const Empty828 = () => (
    <div className="rounded-lg border border-orange-400/60 bg-orange-50 dark:bg-orange-950/30 px-4 py-4 text-sm">
        <div className="font-semibold text-orange-700 dark:text-orange-300">
            No signals seeded for 828D yet
        </div>
        <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
            The 828D interface map could not be confirmed to the standard this tool holds itself
            to, so nothing was entered rather than guessing. Address decoding works normally on
            the other tabs. Entries can be added to{" "}
            <code className="font-mono">src/lib/s7Signals.js</code> from the 828D Lists manual with
            no code change.
        </p>
    </div>
);

const Selector = ({ options, value, onChange }) => (
    <div className="flex gap-1 mt-1">
        {options.map((o) => (
            <button
                key={o.id}
                type="button"
                onClick={() => onChange(o.id)}
                className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                    value === o.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                }`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

const SignalTab = () => {
    const [control, setControl] = useState("840Dsl");
    const [mode, setMode] = useState("address");
    const [rawAddr, setRawAddr] = useState("DB31.DBX60.4");
    const [query, setQuery] = useState("");

    const addr = parseAddress(rawAddr);
    const addrErr = isErr(addr) ? addr.error : null;

    const hits =
        mode === "address"
            ? addrErr
                ? []
                : lookupSignal({ control, db: addr.db, byte: addr.byte, bit: addr.bit ?? 0 })
            : searchSignals({ control, query });

    const searched = mode === "search" && query.trim() !== "";
    const showMiss =
        mode === "address" ? !addrErr && hits.length === 0 : searched && hits.length === 0;

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Control</label>
                    <Selector options={CONTROLS} value={control} onChange={setControl} />
                </div>
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Find by</label>
                    <Selector
                        options={[
                            { id: "address", label: "Address" },
                            { id: "search", label: "Name" },
                        ]}
                        value={mode}
                        onChange={setMode}
                    />
                </div>
            </div>

            <div className="mt-4 max-w-sm">
                {mode === "address" ? (
                    <Input
                        value={rawAddr}
                        onChange={(e) => setRawAddr(e.target.value)}
                        placeholder="DB31.DBX60.4"
                        className="font-mono"
                    />
                ) : (
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search signal names, e.g. exact stop"
                    />
                )}
            </div>

            {mode === "address" && addrErr && <ErrorBox msg={addrErr} />}

            <div className="mt-5 space-y-3">
                {hits.map((h) => (
                    <Hit key={h.id} hit={h} />
                ))}
                {showMiss && (control === "828D" ? <Empty828 /> : <Miss control={control} />)}
            </div>
        </div>
    );
};

export default SignalTab;

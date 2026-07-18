import React, { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { ErrorBox } from "./Shared";

const AREA_LABELS = {
    N: "NCK", C: "Channel", A: "Axis", T: "Tool", B: "Mode group", H: "Drive (MSD)", V: "Drive (FDD)", M: "HMI",
};

const VarRow = ({ v }) => {
    const [open, setOpen] = useState(false);
    return (
        <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors"
        >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="font-medium text-sm">{v.name}</span>
                {v.sysvar && <span className="font-mono text-xs text-primary">{v.sysvar}</span>}
                <span className="ml-auto text-[11px] font-semibold bg-foreground/10 px-2 py-0.5 rounded">
                    {AREA_LABELS[v.area] || v.area} · {v.block}
                </span>
            </div>
            <p className={`text-xs text-muted-foreground mt-1.5 ${open ? "" : "line-clamp-2"}`}>
                {v.description || "(no description in the manual)"}
            </p>
        </button>
    );
};

const NcVarTab = () => {
    const [mod, setMod] = useState(null);      // loaded module
    const [loadErr, setLoadErr] = useState("");
    const [query, setQuery] = useState("");
    const [area, setArea] = useState("");
    const [block, setBlock] = useState("");

    useEffect(() => {
        let alive = true;
        import("../../lib/ncVariables.js")
            .then((m) => { if (alive) setMod(m); })
            .catch(() => { if (alive) setLoadErr("Couldn't load the NC variables dataset. Try reopening the tab."); });
        return () => { alive = false; };
    }, []);

    if (loadErr) return <ErrorBox msg={loadErr} />;
    if (!mod) {
        return <div className="text-sm text-muted-foreground py-8 text-center">Loading NC variables…</div>;
    }

    const { SECTIONS, searchVars } = mod;
    const blocksForArea = area ? SECTIONS.filter((s) => s.area === area) : [];
    const hits = searchVars({ query, area: area || undefined, block: block || undefined });
    const searched = query.trim() !== "" || area !== "";

    return (
        <div>
            <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Search</label>
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="name, $SYSTEM_VAR or description text"
                        className="mt-1"
                    />
                </div>
                <div>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground">Area</label>
                    <select
                        value={area}
                        onChange={(e) => { setArea(e.target.value); setBlock(""); }}
                        className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                        <option value="">All</option>
                        {[...new Set(SECTIONS.map((s) => s.area))].map((a) => (
                            <option key={a} value={a}>{AREA_LABELS[a] || a}</option>
                        ))}
                    </select>
                </div>
                {area && (
                    <div>
                        <label className="text-xs uppercase tracking-wide text-muted-foreground">Block</label>
                        <select
                            value={block}
                            onChange={(e) => setBlock(e.target.value)}
                            className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm max-w-[260px]"
                        >
                            <option value="">All blocks</option>
                            {blocksForArea.map((s) => (
                                <option key={s.block} value={s.block}>{s.block} — {s.section} ({s.count})</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {!searched && (
                <p className="text-sm text-muted-foreground mt-6">
                    {mod.VARIABLES.length.toLocaleString("en-US")} NC variables from the 840D sl Lists
                    Manual. Search by name, <span className="font-mono">$SYSTEM_VAR</span>, or description —
                    or pick an area to browse.
                </p>
            )}

            {searched && (
                <div className="mt-5 space-y-2">
                    {hits.length === 0 && (
                        <p className="text-sm text-muted-foreground">No variables match.</p>
                    )}
                    {hits.map((v) => <VarRow key={v.id} v={v} />)}
                    {hits.length >= 200 && (
                        <p className="text-xs text-muted-foreground pt-1">
                            Showing the first 200 — refine your search to narrow.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default NcVarTab;

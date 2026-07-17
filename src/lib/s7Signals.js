// ═══════════════════════════════════════════════════════════════════════════════
//  s7Signals.js — curated NC/PLC interface signals for SINUMERIK controls.
//
//  Pure data. Imports nothing. Knows nothing about rendering.
//
//  ACCURACY POLICY (see the design spec):
//    - Nothing is guessed. Every entry carries a `source`.
//    - An address with no entry returns an honest miss. The tool never invents
//      a signal name, because a wrong name on a live machine is worse than no
//      name at all.
//    - 828D intentionally has no entries yet: its interface map could not be
//      stated with high confidence. The control is fully wired, so adding
//      entries here is a data edit with no code change.
//
//  RANGE RULE:
//    DB31-61 are per-axis and DB21-30 per-channel, so an entry declares a `db`
//    range plus an `offset`. DB34 with offset 30 resolves to "Axis 4". This
//    avoids storing 31 near-identical copies of each axis signal.
// ═══════════════════════════════════════════════════════════════════════════════

export const CONTROLS = [
    { id: "840Dsl", label: "SINUMERIK 840D sl" },
    { id: "840Dpl", label: "SINUMERIK 840D powerline" },
    { id: "828D", label: "SINUMERIK 828D" },
];

const SL_PL = ["840Dsl", "840Dpl"];
const AXIS_SRC = "840D Lists Manual — axis/spindle-specific signals (DB31-61)";
const CHAN_SRC = "840D Lists Manual — channel-specific signals (DB21-30)";
const BAG_SRC = "840D Lists Manual — mode group signals (DB11)";

const axis = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [31, 61], label: "Axis", offset: 30 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: AXIS_SRC,
});

const channel = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [21, 30], label: "Channel", offset: 20 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: CHAN_SRC,
});

const bag = (byte, bit, name, dir, id) => ({
    id,
    controls: SL_PL,
    area: { db: [11, 11], label: "Mode group", offset: 10 },
    type: "DBX",
    byte,
    bit,
    name,
    dir,
    confidence: "high",
    source: BAG_SRC,
});

export const SIGNALS = [
    // ── Axis / spindle: DB31-61 ───────────────────────────────────────────────
    axis(1, 3, "Axis/spindle disable", "PLC→NCK", "axis-disable"),
    axis(2, 1, "Controller enable (Reglerfreigabe)", "PLC→NCK", "axis-controller-enable"),
    axis(4, 3, "Feed stop / spindle stop", "PLC→NCK", "axis-feed-stop"),
    axis(21, 7, "Pulse enable (Impulsfreigabe)", "PLC→NCK", "axis-pulse-enable"),
    axis(60, 4, "Exact stop fine — position reached", "NCK→PLC", "axis-exact-stop-fine"),
    axis(60, 5, "Exact stop coarse — position reached", "NCK→PLC", "axis-exact-stop-coarse"),
    axis(60, 6, "Referenced / synchronised, measuring system 1", "NCK→PLC", "axis-referenced-1"),
    axis(60, 7, "Referenced / synchronised, measuring system 2", "NCK→PLC", "axis-referenced-2"),
    axis(61, 4, "Drive ready", "NCK→PLC", "axis-drive-ready"),
    axis(61, 5, "Position controller active", "NCK→PLC", "axis-pos-ctrl-active"),
    axis(61, 6, "Speed controller active", "NCK→PLC", "axis-speed-ctrl-active"),
    axis(61, 7, "Current controller active", "NCK→PLC", "axis-current-ctrl-active"),

    // ── Channel: DB21-30 ──────────────────────────────────────────────────────
    channel(7, 1, "NC-Start", "PLC→NCK", "chan-nc-start"),
    channel(7, 3, "NC-Stop", "PLC→NCK", "chan-nc-stop"),
    channel(7, 7, "Reset", "PLC→NCK", "chan-reset"),

    // ── Mode group: DB11 ──────────────────────────────────────────────────────
    bag(0, 0, "JOG mode selected", "PLC→NCK", "bag-jog-select"),
    bag(0, 1, "MDA mode selected", "PLC→NCK", "bag-mda-select"),
    bag(0, 2, "AUTO mode selected", "PLC→NCK", "bag-auto-select"),
    bag(6, 0, "JOG mode active", "NCK→PLC", "bag-jog-active"),
    bag(6, 1, "MDA mode active", "NCK→PLC", "bag-mda-active"),
    bag(6, 2, "AUTO mode active", "NCK→PLC", "bag-auto-active"),

    // ── 828D ──────────────────────────────────────────────────────────────────
    // Intentionally empty. See the accuracy policy above.
];

/** Resolve "Axis 4" / "Channel 2" from a signal's range rule and the actual DB. */
function resolveLabel(entry, db) {
    const [lo, hi] = entry.area.db;
    if (lo === hi) return entry.area.label; // single-DB areas need no number
    return `${entry.area.label} ${db - entry.area.offset}`;
}

function addressOf(entry, db) {
    return `DB${db}.${entry.type}${entry.byte}.${entry.bit}`;
}

function decorate(entry, db) {
    return { ...entry, resolvedLabel: resolveLabel(entry, db), address: addressOf(entry, db) };
}

/**
 * Find signals matching an exact address on a control.
 * Returns [] for anything not in the dataset — never a guessed name.
 */
export function lookupSignal({ control, db, byte, bit }) {
    return SIGNALS.filter((s) => {
        if (!s.controls.includes(control)) return false;
        const [lo, hi] = s.area.db;
        return db >= lo && db <= hi && s.byte === byte && s.bit === bit;
    }).map((s) => decorate(s, db));
}

/** Free-text search over signal names for a control. */
export function searchSignals({ control, query }) {
    const q = String(query || "").trim().toLowerCase();
    if (q === "") return [];
    return SIGNALS.filter(
        (s) => s.controls.includes(control) && s.name.toLowerCase().includes(q)
    ).map((s) => decorate(s, s.area.db[0]));
}

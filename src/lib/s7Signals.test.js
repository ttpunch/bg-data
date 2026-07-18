import { describe, it, expect } from "vitest";
import { CONTROLS, SIGNALS, lookupSignal, searchSignals } from "./s7Signals";

describe("CONTROLS", () => {
  it("offers the three controls the spec calls for", () => {
    expect(CONTROLS.map((c) => c.id).sort()).toEqual(["828D", "840Dpl", "840Dsl"]);
  });
});

describe("SIGNALS integrity", () => {
  it("has a substantial transcribed dataset", () => {
    expect(SIGNALS.length).toBeGreaterThan(1000);
  });
  it("gives every entry a source, per the accuracy policy", () => {
    for (const s of SIGNALS) expect(s.source, `signal ${s.id} is missing a source`).toBeTruthy();
  });
  it("gives every entry a unique id", () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length);
  });
  it("only uses known control ids", () => {
    const known = CONTROLS.map((c) => c.id);
    for (const s of SIGNALS) for (const c of s.controls) expect(known).toContain(c);
  });
  it("uses only valid bit numbers (null or 0-7)", () => {
    for (const s of SIGNALS) {
      if (s.bit !== null) expect(s.bit, `${s.id}`).toBeGreaterThanOrEqual(0), expect(s.bit).toBeLessThanOrEqual(7);
    }
  });
  it("uses only NC/PLC/HMI direction strings or null", () => {
    for (const s of SIGNALS) {
      if (s.dir !== null) expect(s.dir, `${s.id}: ${s.dir}`).toMatch(/->/);
    }
  });
});

describe("lookupSignal — verified against the 840D sl Lists Manual", () => {
  it("resolves DB31.DBX60.7 to exact stop fine, Axis 1", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 31, byte: 60, bit: 7 });
    expect(hit.name).toMatch(/exact stop fine/i);
    expect(hit.resolvedLabel).toBe("Axis/spindle 1");
    expect(hit.dir).toBe("NC->PLC");
    expect(hit.address).toBe("DB31.DBX60.7");
  });
  it("resolves the axis number from the DB offset (DB34 -> Axis 4)", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 34, byte: 60, bit: 7 });
    expect(hit.resolvedLabel).toBe("Axis/spindle 4");
    expect(hit.address).toBe("DB34.DBX60.7");
  });
  it("has DBX60.4 as referenced/synchronized 1 (NOT exact stop — the earlier guess was wrong)", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 31, byte: 60, bit: 4 });
    expect(hit.name).toMatch(/referenced.*synchronized 1/i);
  });
  it("resolves a per-channel signal (DB22.DBX7.1 -> NC Start, Channel 2)", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 22, byte: 7, bit: 1 });
    expect(hit.name).toMatch(/NC.?start/i);
    expect(hit.resolvedLabel).toBe("Channel 2");
  });
  it("resolves a mode-group signal (DB11.DBX0.2 -> JOG)", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 11, byte: 0, bit: 2 });
    expect(hit.name).toMatch(/JOG/i);
    expect(hit.resolvedLabel).toBe("Mode group");
  });
  it("resolves an NCK signal (DB10.DBX56.1 -> Emergency Stop)", () => {
    const [hit] = lookupSignal({ control: "840Dsl", db: 10, byte: 56, bit: 1 });
    expect(hit.name).toMatch(/emergency stop/i);
    expect(hit.resolvedLabel).toBe("NCK");
  });
  it("finds powerline signals too (shared 840D interface)", () => {
    expect(lookupSignal({ control: "840Dpl", db: 31, byte: 60, bit: 7 }).length).toBe(1);
  });
  it("returns an honest miss for an unknown address rather than inventing a name", () => {
    expect(lookupSignal({ control: "840Dsl", db: 31, byte: 250, bit: 0 })).toEqual([]);
  });
  it("returns an honest miss for 828D, which has no seeded data", () => {
    expect(lookupSignal({ control: "828D", db: 31, byte: 60, bit: 7 })).toEqual([]);
  });
  it("does not match a DB outside the declared axis range", () => {
    expect(lookupSignal({ control: "840Dsl", db: 62, byte: 60, bit: 7 })).toEqual([]);
  });
});

describe("searchSignals", () => {
  it("finds by name fragment", () => {
    expect(searchSignals({ control: "840Dsl", query: "exact stop" }).length).toBeGreaterThan(0);
  });
  it("is case insensitive", () => {
    expect(searchSignals({ control: "840Dsl", query: "EXACT STOP" }).length).toBeGreaterThan(0);
  });
  it("caps result count to keep the UI responsive", () => {
    expect(searchSignals({ control: "840Dsl", query: "e" }).length).toBeLessThanOrEqual(200);
  });
  it("returns empty for no match", () => {
    expect(searchSignals({ control: "840Dsl", query: "zzzznotathing" })).toEqual([]);
  });
  it("returns empty for 828D", () => {
    expect(searchSignals({ control: "828D", query: "exact stop" })).toEqual([]);
  });
});

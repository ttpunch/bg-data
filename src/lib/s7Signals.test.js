import { describe, it, expect } from "vitest";
import { CONTROLS, SIGNALS, lookupSignal, searchSignals } from "./s7Signals";

describe("CONTROLS", () => {
  it("offers the three controls the spec calls for", () => {
    expect(CONTROLS.map((c) => c.id).sort()).toEqual(["828D", "840Dpl", "840Dsl"]);
  });
});

describe("SIGNALS integrity", () => {
  it("gives every entry a source, per the accuracy policy", () => {
    for (const s of SIGNALS) {
      expect(s.source, `signal ${s.id} is missing a source`).toBeTruthy();
    }
  });
  it("gives every entry a unique id", () => {
    expect(new Set(SIGNALS.map((s) => s.id)).size).toBe(SIGNALS.length);
  });
  it("only uses known control ids", () => {
    const known = CONTROLS.map((c) => c.id);
    for (const s of SIGNALS) {
      for (const c of s.controls) expect(known).toContain(c);
    }
  });
});

describe("lookupSignal", () => {
  it("resolves a per-axis signal and names the axis", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 31, byte: 60, bit: 4 });
    expect(hits.length).toBe(1);
    expect(hits[0].name).toMatch(/exact stop fine/i);
    expect(hits[0].resolvedLabel).toBe("Axis 1");
  });
  it("resolves the axis number from the DB offset", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 34, byte: 60, bit: 4 });
    expect(hits[0].resolvedLabel).toBe("Axis 4");
    expect(hits[0].address).toBe("DB34.DBX60.4");
  });
  it("resolves a per-channel signal", () => {
    const hits = lookupSignal({ control: "840Dsl", db: 22, byte: 7, bit: 1 });
    expect(hits[0].resolvedLabel).toBe("Channel 2");
    expect(hits[0].name).toMatch(/NC.?start/i);
  });
  it("finds powerline signals too", () => {
    expect(lookupSignal({ control: "840Dpl", db: 31, byte: 60, bit: 4 }).length).toBe(1);
  });
  it("returns an honest miss for an unknown address rather than inventing a name", () => {
    expect(lookupSignal({ control: "840Dsl", db: 31, byte: 200, bit: 0 })).toEqual([]);
  });
  it("returns an honest miss for 828D, which has no seeded data", () => {
    expect(lookupSignal({ control: "828D", db: 31, byte: 60, bit: 4 })).toEqual([]);
  });
  it("does not match a DB outside the declared range", () => {
    expect(lookupSignal({ control: "840Dsl", db: 62, byte: 60, bit: 4 })).toEqual([]);
  });
});

describe("searchSignals", () => {
  it("finds by name fragment", () => {
    expect(searchSignals({ control: "840Dsl", query: "exact stop" }).length).toBeGreaterThan(0);
  });
  it("is case insensitive", () => {
    expect(searchSignals({ control: "840Dsl", query: "EXACT STOP" }).length).toBeGreaterThan(0);
  });
  it("returns empty for no match", () => {
    expect(searchSignals({ control: "840Dsl", query: "zzzznotathing" })).toEqual([]);
  });
  it("returns empty for 828D", () => {
    expect(searchSignals({ control: "828D", query: "exact stop" })).toEqual([]);
  });
});

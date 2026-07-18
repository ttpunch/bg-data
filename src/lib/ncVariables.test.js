import { describe, it, expect } from "vitest";
import { SECTIONS, VARIABLES, searchVars } from "./ncVariables";

describe("VARIABLES integrity", () => {
  it("has the bulk of the manual's variables", () => {
    expect(VARIABLES.length).toBeGreaterThan(2600);
  });
  it("gives every entry area, block and name", () => {
    for (const v of VARIABLES) {
      expect(v.area, v.id).toBeTruthy();
      expect(v.block, v.id).toBeTruthy();
      expect(v.name, v.id).toBeTruthy();
    }
  });
  it("never uses an empty-string sysvar (null or $-prefixed only)", () => {
    for (const v of VARIABLES) {
      expect(v.sysvar === null || v.sysvar.startsWith("$"), `${v.id}: ${v.sysvar}`).toBe(true);
    }
  });
  it("gives every entry a unique id", () => {
    expect(new Set(VARIABLES.map((v) => v.id)).size).toBe(VARIABLES.length);
  });
});

describe("SECTIONS", () => {
  it("indexes ~128 Area/Block sections", () => {
    expect(SECTIONS.length).toBeGreaterThan(100);
  });
  it("section counts sum to the variable total", () => {
    expect(SECTIONS.reduce((n, s) => n + s.count, 0)).toBe(VARIABLES.length);
  });
});

describe("searchVars", () => {
  it("finds a known variable by $system-var fragment", () => {
    const hits = searchVars({ query: "AN_LANGUAGE_ON_HMI" });
    expect(hits.some((v) => v.name === "anLanguageOnHmi")).toBe(true);
  });
  it("finds by description fragment, case-insensitively", () => {
    expect(searchVars({ query: "LANGUAGE SET ON HMI" }).length).toBeGreaterThan(0);
  });
  it("filters by area", () => {
    const hits = searchVars({ query: "", area: "C" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((v) => v.area === "C")).toBe(true);
  });
  it("filters by block", () => {
    const hits = searchVars({ query: "", area: "T", block: "TO" });
    expect(hits.every((v) => v.area === "T" && v.block === "TO")).toBe(true);
  });
  it("caps results at 200", () => {
    expect(searchVars({ query: "a" }).length).toBeLessThanOrEqual(200);
  });
  it("returns [] for an empty query with no filter", () => {
    expect(searchVars({ query: "" })).toEqual([]);
  });
  it("returns [] for no match", () => {
    expect(searchVars({ query: "zzzznotarealvariable" })).toEqual([]);
  });
});

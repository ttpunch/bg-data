import { describe, it, expect } from "vitest";
import {
  buildUpdateRequest,
  buildDeleteRequest,
  diffFields,
  formatRecordDate,
  canConfirmProposal,
} from "./agentActions";

const RECORD = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  machine_no: "251",
  breakdown: "spindle motor failure",
  bgdate: "2026-08-15T00:00:00.000Z",
};

describe("buildUpdateRequest", () => {
  it("targets the existing edit endpoint with only the changed fields", () => {
    expect(buildUpdateRequest(RECORD, { breakdown: "new text" })).toEqual({
      path: "/api/editdata/aaaaaaaaaaaaaaaaaaaaaaaa",
      payload: { breakdown: "new text" },
    });
  });

  it("returns null when there is nothing to change", () => {
    expect(buildUpdateRequest(RECORD, {})).toBeNull();
  });

  it("returns null for a record with no id", () => {
    expect(buildUpdateRequest({ breakdown: "x" }, { breakdown: "y" })).toBeNull();
  });

  it("returns null rather than throwing on missing arguments", () => {
    expect(buildUpdateRequest(null, null)).toBeNull();
    expect(buildUpdateRequest(undefined, undefined)).toBeNull();
  });
});

describe("buildDeleteRequest", () => {
  it("targets the existing delete endpoint", () => {
    expect(buildDeleteRequest(RECORD)).toEqual({
      path: "/api/editdata/aaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("returns null for a record with no id", () => {
    expect(buildDeleteRequest({ machine_no: "251" })).toBeNull();
    expect(buildDeleteRequest(null)).toBeNull();
  });
});

describe("diffFields", () => {
  it("pairs the old value with the new one", () => {
    expect(diffFields(RECORD, { breakdown: "new text" })).toEqual([
      { field: "breakdown", label: "Fault Detail", before: "spindle motor failure", after: "new text" },
    ]);
  });

  it("normalises the stored date before comparing", () => {
    expect(diffFields(RECORD, { bgdate: "2026-08-12" })).toEqual([
      { field: "bgdate", label: "Date", before: "2026-08-15", after: "2026-08-12" },
    ]);
  });

  it("omits a field whose value is unchanged", () => {
    expect(diffFields(RECORD, { breakdown: "spindle motor failure" })).toEqual([]);
  });

  it("returns an empty list rather than throwing on bad input", () => {
    expect(diffFields(null, null)).toEqual([]);
  });
});

describe("formatRecordDate", () => {
  it("reduces a stored ISO timestamp to a plain date", () => {
    expect(formatRecordDate("2026-08-15T00:00:00.000Z")).toBe("2026-08-15");
  });

  it("passes a plain date through", () => {
    expect(formatRecordDate("2026-08-15")).toBe("2026-08-15");
  });

  it("returns an empty string for anything unparseable", () => {
    expect(formatRecordDate(null)).toBe("");
    expect(formatRecordDate("not a date")).toBe("");
  });
});

describe("canConfirmProposal", () => {
  it("allows a delete proposal carrying a real record", () => {
    expect(canConfirmProposal({ kind: "propose_delete", record: RECORD })).toBe(true);
  });

  it("allows an update proposal that actually changes something", () => {
    expect(
      canConfirmProposal({ kind: "propose_update", record: RECORD, changes: { breakdown: "x" } })
    ).toBe(true);
  });

  it("blocks an update proposal that changes nothing", () => {
    expect(canConfirmProposal({ kind: "propose_update", record: RECORD, changes: {} })).toBe(false);
  });

  it("blocks a proposal with no record id", () => {
    expect(canConfirmProposal({ kind: "propose_delete", record: {} })).toBe(false);
  });

  it("blocks anything malformed", () => {
    expect(canConfirmProposal(null)).toBe(false);
    expect(canConfirmProposal({ kind: "records" })).toBe(false);
  });
});

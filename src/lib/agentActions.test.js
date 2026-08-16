import { describe, it, expect } from "vitest";
import {
  buildUpdateRequest,
  buildDeleteRequest,
  diffFields,
  formatRecordDate,
  canConfirmProposal,
  isValidProposal,
  isValidRecordsPayload,
  looksLikeLookup,
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

  it("normalises a full ISO bgdate timestamp to a plain date in the payload", () => {
    expect(buildUpdateRequest(RECORD, { bgdate: "2026-08-12T10:30:00.000Z" })).toEqual({
      path: "/api/editdata/aaaaaaaaaaaaaaaaaaaaaaaa",
      payload: { bgdate: "2026-08-12" },
    });
  });

  it("scopes the payload to only the fields that actually changed, omitting an unchanged field even though it is present in changes", () => {
    // breakdown here equals RECORD.breakdown exactly (a stale re-proposal of the
    // same value) while machine_no genuinely differs. Only machine_no may reach
    // the server, or a concurrent edit to breakdown made by someone else would
    // be silently overwritten by a value the user never saw or approved.
    expect(
      buildUpdateRequest(RECORD, { breakdown: RECORD.breakdown, machine_no: "999" })
    ).toEqual({
      path: "/api/editdata/aaaaaaaaaaaaaaaaaaaaaaaa",
      payload: { machine_no: "999" },
    });
  });

  it("includes every field in the payload when multiple fields genuinely change", () => {
    expect(
      buildUpdateRequest(RECORD, { breakdown: "gearbox seized", machine_no: "999" })
    ).toEqual({
      path: "/api/editdata/aaaaaaaaaaaaaaaaaaaaaaaa",
      payload: { breakdown: "gearbox seized", machine_no: "999" },
    });
  });

  it("returns null when every field in changes matches the stored record, even with multiple fields present", () => {
    expect(
      buildUpdateRequest(RECORD, { breakdown: RECORD.breakdown, machine_no: RECORD.machine_no })
    ).toBeNull();
  });

  it("invariant: the payload's key set always equals the set of fields diffFields reports for the same input", () => {
    const cases = [
      { breakdown: "new text" },
      {},
      { breakdown: RECORD.breakdown, machine_no: "999" },
      { breakdown: "gearbox seized", machine_no: "999" },
      { breakdown: RECORD.breakdown, machine_no: RECORD.machine_no },
      { bgdate: "2026-08-12T10:30:00.000Z", machine_no: "999" },
      { bgdate: RECORD.bgdate, breakdown: RECORD.breakdown, machine_no: "1" },
    ];
    for (const changes of cases) {
      const expectedKeys = diffFields(RECORD, changes)
        .map((row) => row.field)
        .sort();
      const result = buildUpdateRequest(RECORD, changes);
      const actualKeys = result ? Object.keys(result.payload).sort() : [];
      expect(actualKeys).toEqual(expectedKeys);
    }
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

  it("normalises a full ISO 'after' timestamp before comparing, so an unchanged date produces no row", () => {
    expect(diffFields(RECORD, { bgdate: "2026-08-15T00:00:00.000Z" })).toEqual([]);
  });

  it("normalises a full ISO 'after' timestamp to a plain date when the date genuinely changed", () => {
    expect(diffFields(RECORD, { bgdate: "2026-08-12T10:30:00.000Z" })).toEqual([
      { field: "bgdate", label: "Date", before: "2026-08-15", after: "2026-08-12" },
    ]);
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

  it("blocks an update proposal whose changes equal the stored values", () => {
    expect(
      canConfirmProposal({ kind: "propose_update", record: RECORD, changes: { breakdown: RECORD.breakdown } })
    ).toBe(false);
  });

  it("allows an update proposal where one field differs and another matches the stored value", () => {
    expect(
      canConfirmProposal({
        kind: "propose_update",
        record: RECORD,
        changes: { breakdown: RECORD.breakdown, machine_no: "999" },
      })
    ).toBe(true);
  });

  it("blocks a proposal with no record id", () => {
    expect(canConfirmProposal({ kind: "propose_delete", record: {} })).toBe(false);
  });

  it("blocks anything malformed", () => {
    expect(canConfirmProposal(null)).toBe(false);
    expect(canConfirmProposal({ kind: "records" })).toBe(false);
  });
});

describe("isValidProposal", () => {
  it("accepts a propose_update carrying a record with a usable id", () => {
    expect(
      isValidProposal({ kind: "propose_update", record: RECORD, changes: { breakdown: "x" } })
    ).toBe(true);
  });

  it("accepts a propose_delete carrying a record with a usable id", () => {
    expect(isValidProposal({ kind: "propose_delete", record: RECORD })).toBe(true);
  });

  it("rejects a proposal with a kind other than propose_update/propose_delete", () => {
    expect(isValidProposal({ kind: "records", record: RECORD })).toBe(false);
    expect(isValidProposal({ kind: "clarify", record: RECORD })).toBe(false);
  });

  it("rejects a proposal whose record is missing", () => {
    expect(isValidProposal({ kind: "propose_delete", record: null })).toBe(false);
    expect(isValidProposal({ kind: "propose_delete" })).toBe(false);
  });

  it("rejects a proposal whose record has no usable string _id", () => {
    expect(isValidProposal({ kind: "propose_delete", record: {} })).toBe(false);
    expect(isValidProposal({ kind: "propose_delete", record: { _id: "" } })).toBe(false);
    expect(isValidProposal({ kind: "propose_delete", record: { _id: 123 } })).toBe(false);
  });

  it("rejects anything malformed at the top level", () => {
    expect(isValidProposal(null)).toBe(false);
    expect(isValidProposal(undefined)).toBe(false);
    expect(isValidProposal("propose_delete")).toBe(false);
  });
});

describe("isValidRecordsPayload", () => {
  it("accepts a payload with an array of records", () => {
    expect(isValidRecordsPayload({ kind: "records", machine_no: "251", records: [RECORD] })).toBe(
      true
    );
  });

  it("accepts an empty records array", () => {
    expect(isValidRecordsPayload({ kind: "records", machine_no: "251", records: [] })).toBe(true);
  });

  it("rejects a payload with a missing records field", () => {
    expect(isValidRecordsPayload({ kind: "records", machine_no: "251" })).toBe(false);
  });

  it("rejects a payload whose records field is not an array", () => {
    expect(isValidRecordsPayload({ kind: "records", records: null })).toBe(false);
    expect(isValidRecordsPayload({ kind: "records", records: "oops" })).toBe(false);
    expect(isValidRecordsPayload({ kind: "records", records: {} })).toBe(false);
  });

  it("rejects anything malformed at the top level", () => {
    expect(isValidRecordsPayload(null)).toBe(false);
    expect(isValidRecordsPayload(undefined)).toBe(false);
  });

  it("rejects a records array containing a null element", () => {
    expect(isValidRecordsPayload({ kind: "records", records: [null] })).toBe(false);
  });

  it("rejects a mixed array with one valid record and one null", () => {
    expect(isValidRecordsPayload({ kind: "records", records: [RECORD, null] })).toBe(false);
  });
});

describe("looksLikeLookup", () => {
  it("routes real create statements to create, even though they use the domain's own vocabulary", () => {
    const createStatements = [
      "machine 251 had a breakdown today - spindle motor failure",
      "record this breakdown for machine 251: motor overheating",
      "machine 12 has a fault in the coolant pump",
      "there was an issue with machine 44 hydraulic line",
      "machine 8 tailstock had a problem this morning",
      "log a breakdown on machine 3, gearbox seized",
    ];
    for (const text of createStatements) {
      expect(looksLikeLookup(text)).toBe(false);
    }
  });

  it("routes messages opening with a question word to lookup", () => {
    expect(looksLikeLookup("what problems has 251 had")).toBe(true);
    expect(looksLikeLookup("show me the history for 2-512")).toBe(true);
  });

  it("routes messages opening with an edit/delete verb to lookup", () => {
    expect(looksLikeLookup("delete the spindle record for 251")).toBe(true);
    expect(looksLikeLookup("change the date on that record")).toBe(true);
  });

  it("routes a message ending in a question mark to lookup", () => {
    expect(looksLikeLookup("251 breakdowns?")).toBe(true);
  });

  it("allows ordinary leading filler before the keyword", () => {
    expect(looksLikeLookup("please show me machine 251's history")).toBe(true);
    expect(looksLikeLookup("can you delete that record")).toBe(true);
    expect(looksLikeLookup("could you check on machine 44")).toBe(true);
  });

  it("does not throw on empty, whitespace, or non-string input", () => {
    expect(looksLikeLookup("")).toBe(false);
    expect(looksLikeLookup("   ")).toBe(false);
    expect(looksLikeLookup(null)).toBe(false);
    expect(looksLikeLookup(undefined)).toBe(false);
    expect(looksLikeLookup(123)).toBe(false);
    expect(looksLikeLookup({})).toBe(false);
    expect(looksLikeLookup([])).toBe(false);
  });
});

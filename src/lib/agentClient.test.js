import { describe, it, expect } from "vitest";
import { buildSavePayload, canSave, agentReplyText, UNSUPPORTED_TEXT } from "./agentClient";

const breakdown = {
  intent: "breakdown",
  confidence: 0.9,
  fields: { mcdata: "251", bgdetail: "spindle motor failure", bgdate: "2026-08-15" },
  missing: [],
  clarifyQuestion: "",
};

const machineDetails = {
  intent: "machine_details",
  confidence: 0.9,
  fields: {
    machine_no: "251",
    machine_name: "Walco",
    location: "block1",
    specifications: [{ key: "Motor details", value: "All axis" }],
  },
  missing: [],
  clarifyQuestion: "",
};

describe("buildSavePayload", () => {
  it("routes a breakdown to the existing submit-form endpoint", () => {
    expect(buildSavePayload(breakdown)).toEqual({
      path: "/api/submit-form",
      payload: { mcdata: "251", bgdetail: "spindle motor failure", bgdate: "2026-08-15" },
    });
  });

  it("routes machine details to the existing machine-details endpoint", () => {
    expect(buildSavePayload(machineDetails)).toEqual({
      path: "/api/machine-details",
      payload: {
        machine_no: "251",
        machine_name: "Walco",
        location: "block1",
        specifications: [{ key: "Motor details", value: "All axis" }],
      },
    });
  });

  it("returns null for intents that have nothing to save", () => {
    expect(buildSavePayload({ intent: "clarify", fields: {} })).toBe(null);
    expect(buildSavePayload({ intent: "unsupported", fields: {} })).toBe(null);
  });

  it("builds a machine details payload with an empty specifications array when the key is absent", () => {
    expect(
      buildSavePayload({ intent: "machine_details", fields: { machine_no: "251" } })
    ).toEqual({
      path: "/api/machine-details",
      payload: {
        machine_no: "251",
        machine_name: undefined,
        location: undefined,
        specifications: [],
      },
    });
  });

  it("does not throw and returns null when fields is null", () => {
    expect(buildSavePayload({ intent: "breakdown", fields: null })).toBe(null);
    expect(buildSavePayload({ intent: "machine_details", fields: null })).toBe(null);
  });

  it("does not throw and returns null when fields is missing entirely", () => {
    expect(buildSavePayload({ intent: "breakdown" })).toBe(null);
    expect(buildSavePayload({ intent: "machine_details" })).toBe(null);
  });

  it("does not throw and returns null when the interpretation itself is null or undefined", () => {
    expect(buildSavePayload(null)).toBe(null);
    expect(buildSavePayload(undefined)).toBe(null);
  });
});

describe("canSave", () => {
  it("allows saving when required fields are present", () => {
    expect(canSave(breakdown)).toBe(true);
    expect(canSave(machineDetails)).toBe(true);
  });

  it("blocks saving a breakdown with a blank machine number", () => {
    expect(canSave({ ...breakdown, fields: { ...breakdown.fields, mcdata: "" } })).toBe(false);
  });

  it("blocks saving a breakdown with a blank detail", () => {
    expect(canSave({ ...breakdown, fields: { ...breakdown.fields, bgdetail: "  " } })).toBe(false);
  });

  it("blocks saving machine details with a blank machine number", () => {
    expect(canSave({ ...machineDetails, fields: { ...machineDetails.fields, machine_no: "" } })).toBe(
      false
    );
  });

  it("allows a breakdown with no date, since the date is optional", () => {
    expect(canSave({ ...breakdown, fields: { ...breakdown.fields, bgdate: null } })).toBe(true);
  });

  it("never allows saving a clarify or unsupported result", () => {
    expect(canSave({ intent: "clarify", fields: {} })).toBe(false);
    expect(canSave({ intent: "unsupported", fields: {} })).toBe(false);
  });

  it("does not throw and returns false when fields is null", () => {
    expect(canSave({ intent: "breakdown", fields: null })).toBe(false);
    expect(canSave({ intent: "machine_details", fields: null })).toBe(false);
  });

  it("does not throw and returns false when fields is missing entirely", () => {
    expect(canSave({ intent: "machine_details" })).toBe(false);
  });

  it("does not throw and returns false when the interpretation itself is null or undefined", () => {
    expect(canSave(null)).toBe(false);
    expect(canSave(undefined)).toBe(false);
  });
});

describe("agentReplyText", () => {
  it("passes the clarify question straight through", () => {
    expect(agentReplyText({ intent: "clarify", clarifyQuestion: "Which machine?" })).toBe(
      "Which machine?"
    );
  });

  it("explains the supported scope when the message is unsupported", () => {
    expect(agentReplyText({ intent: "unsupported" })).toBe(UNSUPPORTED_TEXT);
  });

  it("returns an empty string for intents that render a card instead", () => {
    expect(agentReplyText(breakdown)).toBe("");
    expect(agentReplyText(machineDetails)).toBe("");
  });

  it("does not throw and returns an empty string when fields is null", () => {
    expect(agentReplyText({ intent: "breakdown", fields: null })).toBe("");
    expect(agentReplyText({ intent: "machine_details", fields: null })).toBe("");
  });

  it("does not throw and returns an empty string when fields is missing entirely", () => {
    expect(agentReplyText({ intent: "machine_details" })).toBe("");
  });

  it("does not throw and returns an empty string when the interpretation itself is null or undefined", () => {
    expect(agentReplyText(null)).toBe("");
    expect(agentReplyText(undefined)).toBe("");
  });
});

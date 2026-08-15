// Pure helpers for the agent's lookup / edit / delete flow.
//
// Mirrors src/lib/agentClient.js: no React, no axios, no network, no
// import.meta.env. The caller supplies the base URL and performs the request.
// Following the house rule in src/lib/s7.js, nothing here throws.

// Edits and deletes go through the pre-existing endpoints, which key on the
// Mongo _id. These are stored field names, not the create form's names.
const EDIT_BASE = "/api/editdata";

const FIELD_LABELS = {
  breakdown: "Fault Detail",
  bgdate: "Date",
  machine_no: "Machine No",
};

export const formatRecordDate = (value) => {
  if (typeof value !== "string" || value === "") return "";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
};

const recordId = (record) => {
  const id = record && typeof record === "object" ? record._id : undefined;
  return typeof id === "string" && id !== "" ? id : null;
};

export const buildUpdateRequest = (record, changes) => {
  const id = recordId(record);
  if (!id) return null;
  // Scope the payload to exactly the fields diffFields would show the user a
  // row for. This keeps the request in lockstep with what was displayed: a
  // field present in `changes` but equal to the stored value never reaches
  // the server, so it can't silently clobber a concurrent edit the user
  // never saw or approved.
  const rows = diffFields(record, changes);
  if (rows.length === 0) return null;
  const payload = {};
  for (const row of rows) {
    payload[row.field] = row.after;
  }
  return { path: `${EDIT_BASE}/${id}`, payload };
};

export const buildDeleteRequest = (record) => {
  const id = recordId(record);
  return id ? { path: `${EDIT_BASE}/${id}` } : null;
};

export const diffFields = (record, changes) => {
  if (!record || typeof record !== "object") return [];
  const source = changes && typeof changes === "object" ? changes : {};
  const rows = [];
  for (const field of ["breakdown", "bgdate", "machine_no"]) {
    if (typeof source[field] !== "string") continue;
    const before = field === "bgdate" ? formatRecordDate(record[field]) : record[field] ?? "";
    const after = field === "bgdate" ? formatRecordDate(source[field]) : source[field];
    if (before === after) continue;
    rows.push({ field, label: FIELD_LABELS[field], before, after });
  }
  return rows;
};

// Guards against a malformed backend response reaching JSX unvalidated. A
// throw during render has no ErrorBoundary to catch it anywhere in this app,
// so it would unmount the whole tree and blank the page — a bad `propose_*`
// or `records` payload must be caught here, in a tested pure function,
// rather than trusted implicitly by the component.
export const isValidProposal = (proposal) => {
  if (!proposal || typeof proposal !== "object") return false;
  if (proposal.kind !== "propose_update" && proposal.kind !== "propose_delete") return false;
  return recordId(proposal.record) !== null;
};

export const isValidRecordsPayload = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  return Array.isArray(payload.records);
};

export const canConfirmProposal = (proposal) => {
  if (!isValidProposal(proposal)) return false;
  if (proposal.kind === "propose_delete") return true;
  return diffFields(proposal.record, proposal.changes).length > 0;
};

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
  if (!Array.isArray(payload.records)) return false;
  // Every element must be a real record object, not just an array. A `null`
  // slipping through here reaches RecordsTable's `records.map(r => r._id)`
  // unvalidated, and with no ErrorBoundary anywhere in this app, that throw
  // unmounts the whole tree — a blank page instead of a bad row.
  return payload.records.every((r) => r !== null && typeof r === "object");
};

export const canConfirmProposal = (proposal) => {
  if (!isValidProposal(proposal)) return false;
  if (proposal.kind === "propose_delete") return true;
  return diffFields(proposal.record, proposal.changes).length > 0;
};

// Routes a typed message to the create path (/api/agent/interpret) or the
// lookup/edit/delete path (/api/agent/act). The distinguishing signal is
// interrogative structure, not vocabulary: a message that OPENS with a
// question/command word, or an edit/delete verb, or ENDS with "?" is a
// request; anything else is read as a statement of fact heading to create.
//
// This used to be a keyword-soup regex that included domain nouns like
// "breakdown", "fault", "issue", "problem", "record" and "report" — which
// are exactly the words people use to REPORT a breakdown ("machine 251 had
// a breakdown today"). That misrouted real create statements to /act, which
// has no create capability at all, so they silently produced nothing.
//
// The asymmetry that makes leading-position matching (rather than "err
// toward lookup") the right call: a question misrouted to /act is harmless
// — /act only proposes changes for user approval, so a false lookup just
// renders a records/proposal card or a "could not work that out" bubble.
// A create statement misrouted to /act is not harmless — it silently
// produces no card and no explanation, because /act cannot create. So the
// rule is structural (where in the sentence the keyword sits), not a list
// that can be "balanced" by adding or removing nouns.
const LOOKUP_LEAD =
  /^(?:(?:please|can you|could you)\s+)*(what|which|when|where|who|how|why|show|list|find|search|tell|get|look|check|any|delete|remove|edit|change|update|correct|fix)\b/i;

export const looksLikeLookup = (text) => {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  if (trimmed === "") return false;
  if (trimmed.endsWith("?")) return true;
  return LOOKUP_LEAD.test(trimmed);
};

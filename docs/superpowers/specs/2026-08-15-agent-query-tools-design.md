# AI Agent — Lookup, Edit and Delete Tools — Design

**Date:** 2026-08-15
**Status:** Approved for planning
**Target:** New agent capability in the frontend (`ttpunch/bg-data`), plus a new
tool-calling endpoint and two endpoint repairs in the backend (`ttpunch/data-api`)

Follows on from `2026-08-15-ai-agent-data-entry-design.md`, which shipped the create
path.

---

## 1. Purpose

Let the user ask about a machine in plain language — "what problems has 251 had" — and
get its real breakdown history back, then edit or delete individual records from that
result, confirming each change before it happens.

## 2. Scope

**In scope:**

- A tool-calling loop (`POST /api/agent/act`) where an LLM chooses which of three tools
  to invoke: look up a machine's breakdowns, propose an edit, propose a delete.
- Breakdown history lookup **by machine number**, rendered as real records.
- Edit and delete of **one record at a time**, each behind a confirmation card.
- Repair of two existing broken endpoints that this feature depends on.

**Explicitly out of scope:**

- Keyword search across all breakdowns, machine specs lookup, counts/aggregation. The
  user scoped this round to breakdown history by machine.
- Rewriting the existing create path as a tool — see §4, this is a deliberate decision
  backed by measurement.
- Authentication. Flagged as a serious concern in §9 but scoped out as a cross-cutting
  change, consistent with the previous spec.
- Bulk or filtered deletes. One record per confirmation, always.
- Soft delete. Considered and dropped: it needs a schema field plus updates to every
  existing read query, which reaches well beyond this feature.

## 3. Measured model behaviour (verified live, 2026-08-15)

Tested against Ollama Cloud with `minimax-m3`, the configured model.

**Tool calling works.** Given a `find_breakdowns` tool and "what happened to machine
251", the model returned a well-formed `tool_calls` array with `{"machine_no": "251"}`.

**Destructive intent is handled safely.** Given `find_breakdowns`,
`propose_create_breakdown` and `propose_delete_breakdown`, the input *"delete all
records for machine 251"* did **not** produce a delete call. The model called
`find_breakdowns` first, honouring the system instruction that ids must come from a
prior lookup and deletions are one at a time.

**Tool calling extracts free text notably worse than structured output.** The same
sentence, "machine 251 spindle motor failure today":

| Field | Structured output (current, shipped) | Tool calling |
|---|---|---|
| `mcdata` | `"251"` | `"Machine 251 - spindle motor failure today"` |
| `bgdetail` | `"spindle motor failure"` | `"Spindle motor failure on machine 251. Reported today. Details to be confirmed."` |
| `bgdate` | `"2026-08-15"` | `"today"` |

The tool-calling variant put the whole sentence in the machine-number field and
**invented** content ("Details to be confirmed") that the user never wrote. This drives
the central architectural decision below.

## 4. Architecture

**The existing create path is left completely untouched.** `POST /api/agent/interpret`,
`agentInterpreter.js`, and the create confirmation card keep working exactly as they do
today. Per §3 they are measurably more accurate at free-text extraction than a tool
would be, and they are already covered by 25 backend and 175 frontend tests plus live
production verification.

The new capability is **additive** — a second endpoint with a different job:

```
Backend (ttpunch/data-api)
  Router/AgentActRouter.js        new: POST /api/agent/act
  controllers/agentActController.js  new: runs the tool loop, executes read tools
  utils/agentTools.js             new: tool definitions + the loop against Ollama
  controllers/editFormController.js  REPAIR: honour machine_no and bgdate
  controllers/editformDelete.js      REPAIR: await, respond, 404 on missing
  index.js                        +1 mount

Frontend (ttpunch/bg-data)
  src/lib/agentActions.js         new: pure helpers for results + confirmations
  src/components/AIAgent.jsx      +result table, +edit/delete confirmation cards
```

### The division of labour

The model's job in this loop is **choosing which record**, not authoring text. That is
the task §3 shows it does well.

- **Read tools execute immediately, server-side.** `find_breakdowns(machine_no)` runs
  against Mongo and its results are returned to the model so it can respond, and to the
  frontend so it can render the real rows. Nothing can be harmed.
- **Write tools never execute.** `propose_update_breakdown` and
  `propose_delete_breakdown` return a *proposal* to the frontend. The model has no
  ability to mutate anything. The user's click is what executes, calling the existing
  `PUT`/`DELETE` endpoints directly.

**The model never holds a live database handle for writes.** This is the same guarantee
the create path has, extended to destructive operations.

### Id provenance rule

A proposed `update` or `delete` must carry an `_id` that appeared in a `find_breakdowns`
result **earlier in that same request's tool loop**. The controller enforces this by
tracking every id it has returned and rejecting any proposal referencing an unknown id
with `intent: "error"`. A hallucinated id can therefore never reach a confirmation card,
let alone the database. This is a server-side check, not a prompt instruction — §3 shows
the model respects the instruction, but the invariant must not depend on that.

## 5. Tool definitions

```js
find_breakdowns({ machine_no })
  // executes immediately; returns [{_id, machine_no, breakdown, bgdate}, ...]
  // newest first, capped at 50 records

propose_update_breakdown({ id, breakdown, bgdate })
  // returns a proposal; never writes. bgdate optional.

propose_delete_breakdown({ id })
  // returns a proposal for exactly ONE record; never writes.
```

The loop runs at most **4 iterations** (a lookup, an optional second lookup, a proposal,
a final message) before returning whatever it has. This bounds latency and cost on a
paid API.

### Response shape

```
POST /api/agent/act
Body: { "message": "<free text>", "history": [...optional prior turns] }

200 Response — one of:
{ "kind": "records", "machine_no": "251", "records": [...], "reply": "<short text>" }
{ "kind": "propose_update", "record": {...}, "changes": { "breakdown": "...", "bgdate": "..." } }
{ "kind": "propose_delete", "record": {...} }
{ "kind": "reply",  "text": "..." }        // clarification or nothing to do
{ "kind": "error",  "reason": "<code>" }   // same non-sensitive vocabulary as /interpret
```

## 6. Confirmation UX

Consistent with the existing intake terminal styling.

- **Records** render as a compact table — date, detail, and a per-row edit/delete
  action. Machine number and dates in the mono technical face already established.
- **Update proposal** renders a before → after diff. The old value is shown struck
  through above the new one, so the user sees exactly what changes. Both fields are
  editable before confirming.
- **Delete proposal** renders the **full record** — machine number, complete breakdown
  text, date — under a red destructive header reading `PERMANENT DELETE`. Delete is
  irreversible in this schema, and the card says so.
- Every confirmation reuses the per-card in-flight lock already proven on the create
  path, so a double-click cannot fire two deletes.
- Discard leaves the record untouched and logs a neutral status line.

## 7. Endpoint repairs (required — the agent depends on these)

**`controllers/editformDelete.js` currently never responds.** It fires
`deleteOne` without awaiting and never calls `res`, so the request hangs until the
client times out — while the record *is* destroyed. An agent calling it would report
failure having actually deleted data. Repair: await the deletion, return 200 with the
deleted id, 404 when no document matched, 400 on a malformed id.

**`controllers/editFormController.js` ignores most fields.** It updates only
`breakdown`, silently dropping `machine_no` and `bgdate`. "Change the date to the 12th"
would report success and change nothing. Repair: accept `machine_no` and `bgdate` too,
applying only the fields present in the request body, and validate `bgdate` with the
same ISO guard the interpreter uses.

Both repairs are covered by tests and are independently useful — the existing Edit Data
page benefits from them too.

## 8. Error handling

| Condition | Behaviour |
|---|---|
| Machine number has no records | `kind: "reply"` — "No breakdown records found for 251." No empty table. |
| Model proposes an unknown id | `kind: "error"`, `reason: "unknown_record_id"`. Never surfaced as a card. |
| Model proposes a delete with no prior lookup | Same — blocked by the id provenance rule. |
| Loop exceeds 4 iterations | Returns the last useful result, or `kind: "reply"` asking the user to be more specific. |
| Delete target already gone | The repaired endpoint returns 404; the UI reports the record no longer exists. |
| Ollama unreachable / malformed | Reuses the `reason` code vocabulary from `/interpret`. |
| Message empty or >2000 chars | 400, matching `/interpret`. |

## 9. Security note

**This endpoint lets an unauthenticated caller delete maintenance history through
natural language.** Every route in this backend is currently unauthenticated, and the
public backend URL ships inside the frontend bundle. The user has been told this
explicitly and has chosen to proceed; it is recorded here because it is the most
significant risk this feature introduces, and because the mitigations in §4 (server-side
id provenance, no model write access, one record per confirmation, mandatory user click)
are partial — they constrain *the agent*, not an attacker calling `DELETE` directly.

Pairing this work with authentication on the write routes is strongly recommended and
tracked separately.

## 10. Testing

- **Backend, pure:** id-provenance enforcement (proposal with an unseen id is rejected),
  loop iteration cap, tool-argument normalisation, the ISO date guard on the repaired
  edit endpoint, and the repaired delete's 200/404/400 paths.
- **Frontend, pure** (`agentActions.js`): building the update/delete payloads for the
  existing endpoints, computing the before → after diff, and gating confirmation on a
  present record id. Same plain-vitest style as `agentClient.js` — the repo has no jsdom
  or testing-library and must not gain them.
- **Manual browser pass:** lookup renders real rows; edit shows a correct diff and
  persists; delete removes exactly one record and the table updates; "delete all records
  for 251" results in a list to choose from rather than a mass deletion; a double-click
  on confirm deletes once.
- Every existing test (25 backend, 175 frontend) must still pass — this work is additive
  and must not regress the create path.

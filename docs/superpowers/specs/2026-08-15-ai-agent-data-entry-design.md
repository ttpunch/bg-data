# AI Agent Data Entry — Design

**Date:** 2026-08-15
**Status:** Approved for planning
**Target:** New "AI Agent" section in the frontend (`ttpunch/bg-data`), plus one new
endpoint in the backend (`ttpunch/data-api`)

---

## 1. Purpose

Let the user type a plain-language sentence (e.g. "machine 251 had a spindle motor
failure today") and have it turned into a structured breakdown report or machine-details
entry, saved to MongoDB after the user confirms the parsed fields.

## 2. Scope

**In scope:**

- A new chat-style "AI Agent" page in the frontend, reachable from the sidebar.
- A new backend endpoint, `POST /api/agent/interpret`, that calls an LLM (Ollama Cloud) to
  classify the message and extract fields for one of the two existing data shapes.
- A confirm-before-save step: the parsed fields render in an editable card; nothing is
  written to MongoDB until the user clicks **Confirm & Save**.
- Reuse of the two existing, already-working save endpoints (`/api/submit-form`,
  `/api/machine-details`) for the actual write — no new write path.

**Explicitly out of scope:**

- Any other data type (NC variables, S7 signals, alarm calculator, etc.) — only breakdown
  reports and machine details, matching the two forms that already exist.
- Auth — the new endpoint matches the existing sibling endpoints, which currently have no
  auth middleware. Adding auth is a separate, cross-cutting task if wanted later.
- Editing/searching existing records via the agent — create-only, matching "push the data
  to database" from the original request.
- Inferring or generating images from text — image attachment on the confirm card stays a
  manual file picker, reusing the existing `/api/image` upload call.
- Deduplication of near-identical submissions — matches existing manual-form behavior.

## 3. Architecture

```
Frontend (ttpunch/bg-data)
  src/components/AIAgent.jsx        new chat UI
  src/components/Sidebar.jsx        +1 nav entry ("AI Agent", route /agent)
  src/App.jsx                       +1 route

Backend (ttpunch/data-api)
  Router/AgentRouter.js             new: POST / -> calls Ollama Cloud, returns interpretation
  index.js                          +1 mount: app.use('/api/agent', agentRoute)
  .env / Render config              +OLLAMA_API_KEY, +OLLAMA_MODEL
```

### Module boundaries

- `AgentRouter.js` is **stateless and has no MongoDB access** — it only calls Ollama Cloud
  and returns JSON. This keeps the AI's blast radius to "suggest," never "write."
- The actual MongoDB writes continue to go through `FormRouter.js` and
  `MachineDetailsRouter.js`, unchanged. `AIAgent.jsx` calls
  `POST /api/submit-form` / `POST /api/machine-details` directly on confirm, exactly like
  `RecordData.jsx` and `AddMachineDetails.jsx` already do.
- `AIAgent.jsx` owns the chat log and the two preview-card renderers (one per intent). It
  reuses the same `Input`/`Textarea`/`Calendar`/`Card` primitives already used by
  `RecordData.jsx` and `AddMachineDetails.jsx`, rather than duplicating form markup from
  scratch.

## 4. Confirmed real schema (verified against live data and backend source)

`bgdatas` collection (`data-api/models/machine.js`), written by `FormRouter.js`:

```js
{ machine_no: String, breakdown: String, bgdate: Date, image?: String }
```

`FormRouter.js` renames on save: request body `{ mcdata, bgdetail, bgdate, image }` →
stored as `{ machine_no, breakdown, bgdate, image }`.

`machinedetails` collection (`data-api/models/machineDetails.js`), written by
`MachineDetailsRouter.js`:

```js
{
  machine_no: String,   // required, unique
  machine_name: String,
  location: String,
  image?: String,
  specifications: [{ key: String, value: String, image?: String }]
}
```

No field renaming here — the frontend payload matches the stored shape directly.

## 5. Backend contract

```
POST /api/agent/interpret
Body:    { "message": "<free text>" }

200 Response:
{
  "intent": "breakdown" | "machine_details" | "clarify" | "unsupported",
  "confidence": 0.0-1.0,
  "fields": {
    // intent === "breakdown" — field names match the RecordData.jsx form,
    // NOT the raw Mongo field names, so the frontend can pass this straight
    // into POST /api/submit-form with no translation:
    "mcdata": string,
    "bgdetail": string,
    "bgdate": "YYYY-MM-DD" | null

    // intent === "machine_details" — matches AddMachineDetails.jsx / the
    // stored shape directly:
    "machine_no": string,
    "machine_name": string,
    "location": string,
    "specifications": [{ "key": string, "value": string }]
  },
  "missing": string[],        // required fields the message didn't mention
  "clarifyQuestion": string   // present only when intent === "clarify"
}
```

- Calls Ollama Cloud's chat API with an `OLLAMA_API_KEY` held server-side only, using
  **structured output** (`format` set to a JSON schema matching `fields`) so the model is
  constrained to valid JSON for whichever intent it picks, instead of freeform parsing.
- Model is a config value (`OLLAMA_MODEL`, e.g. a `-cloud` tagged model), swappable without
  changing the endpoint contract.
- `confidence < 0.5` is treated as `clarify` server-side even if the model picked an
  intent — the endpoint doesn't let a low-confidence guess reach the save step silently.
- Uses Node's built-in `fetch` (Node 18+) — no new HTTP client dependency needed in
  `data-api`, which currently has none.
- No auth middleware, matching every other route in this backend today.

## 6. Frontend behavior

- Chat log: user messages right-aligned, agent replies left-aligned, using existing
  `Card`/`Button`/`Input` primitives for visual consistency with the rest of the app.
- On send: message appended, `POST /api/agent/interpret` called, a "thinking…" bubble
  shown while waiting.
- Response renders one of three ways:
  - **`breakdown` / `machine_details`** → editable preview card with the relevant fields
    (reusing `RecordData.jsx` / `AddMachineDetails.jsx` field components), **Confirm &
    Save** and **Discard** buttons. Missing required fields (`mcdata`/`bgdetail`, or
    `machine_no`) render blank and highlighted; **Confirm & Save** stays disabled until
    filled — same required-field rule the manual forms already enforce.
  - **`clarify`** → agent asks `clarifyQuestion` as a plain chat bubble; user replies in
    text; loop continues.
  - **`unsupported`** → agent states it only handles breakdown reports and machine
    details right now.
- **Confirm & Save** calls the existing `axios.post(.../api/submit-form)` or
  `.../api/machine-details)`, exactly matching the manual forms' request shape and error
  handling (`toast.promise`, same success/error messages). Success replaces the card with
  a "✅ Saved" line in the chat log.

## 7. Error handling

| Condition | Behavior |
|---|---|
| Empty/gibberish message | `intent: "unsupported"`, frontend shows a fallback message |
| LLM returns malformed JSON (schema violation) | Backend returns 502; frontend shows a retry-able toast; nothing is saved |
| `confidence < 0.5` | Downgraded to `clarify` server-side |
| Missing required fields | Card renders with blanks highlighted; save disabled until filled |
| Ollama Cloud timeout/unreachable | 502; frontend toast points to the manual form (`/recorddata` or `/machine-details`) as a fallback |
| Duplicate-looking submissions | No dedup logic — same as existing manual-form behavior |

## 8. Testing

- Frontend (Vitest): `AIAgent.jsx` tests mocking `axios.post` to `/api/agent/interpret` —
  confident match renders the correct card fields per intent, `clarify` renders the
  follow-up question, `unsupported` shows the fallback message, and **Confirm & Save**
  calls the correct existing endpoint with the correct payload shape per intent.
- Backend: unit tests around the prompt/schema contract using canned sentences → expected
  `intent`/`fields`, plus a test confirming low-confidence responses are downgraded to
  `clarify`.
- No new end-to-end/DB tests needed on the frontend side, since saving reuses the
  already-tested `/api/submit-form` and `/api/machine-details` paths unchanged.

## 9. Security notes (found during investigation, tracked separately)

Not part of this feature's scope, but surfaced while inspecting the database directly:

- The MongoDB user used to inspect the schema for this design has cluster-wide access
  (multiple unrelated databases), not scoped to `machine_breakdown` alone. A
  least-privilege, database-scoped user is recommended for whatever the backend
  ultimately connects with.
- The `userdatas` collection in `machine_breakdown` stores a login password in plain
  text, unrelated to this feature. Worth a separate fix.

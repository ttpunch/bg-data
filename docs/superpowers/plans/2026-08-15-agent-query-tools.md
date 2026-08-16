# AI Agent Lookup, Edit and Delete Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user ask "what problems has 251 had", get the machine's real breakdown history back, and edit or delete individual records with a confirmation step before anything changes.

**Architecture:** A new `POST /api/agent/act` endpoint runs a bounded tool-calling loop against Ollama Cloud. Read tools execute server-side immediately; write tools only ever return *proposals* that the user must confirm, and the frontend then calls the existing `PUT`/`DELETE` endpoints. The already-shipped create path (`/api/agent/interpret`) is not touched.

**Tech Stack:** Express + Mongoose (CommonJS) backend; React 18 + Vite (ESM) frontend; Ollama Cloud (`minimax-m3`); vitest both sides.

## Global Constraints

- Backend is **CommonJS** (`require`/`module.exports`). Frontend is **ESM**.
- **No new dependencies in either repo.** Use Node's built-in global `fetch`.
- Backend `engines.node` is `">=18 <25"`. Do not change it.
- The repo `data-api` has **`node_modules` tracked in git** from before its `.gitignore`. Stage files by explicit path only. **Never `git add -A` or `git add .`. Never commit `.env`.**
- Frontend has **no `@testing-library/react` and no jsdom**, and must not gain them. Component files ship without unit tests; logic belongs in pure modules that are tested.
- **Do not modify** `utils/agentInterpreter.js`'s `normalizeInterpretation`, `RESPONSE_SCHEMA`, `CONFIDENCE_FLOOR`, the `0.5` floor, `utils/ollama.js`'s `callOllama`, `controllers/agentController.js`, or `src/lib/agentClient.js`'s existing exports. The create path is shipped and verified; this work is additive.
- Deletes are **one record per confirmation, always**. No bulk, no filtered deletes.
- A proposed update or delete **must** reference an `_id` returned by a `find_breakdowns` call earlier in the same request. This is enforced in code, never by prompt alone.
- The tool loop runs **at most 4 iterations**.
- Message cap is **2000 characters**, matching `/api/agent/interpret`.
- Error `reason` codes use the existing non-sensitive vocabulary — never include the API key, the prompt, or user content.
- Breakdown field names: records are stored as `{ _id, machine_no, breakdown, bgdate }`. The *create* path's form-facing names (`mcdata`/`bgdetail`) do **not** apply to this feature — lookups and edits use the stored names.

---

### Task 1: Repair the broken edit and delete endpoints

The agent depends on these behaving. Today `editformDelete` never sends a response (the request hangs while the record is destroyed) and `EditformController` silently ignores every field except `breakdown`.

**Files:**
- Modify: `/Volumes/MACEXSTORAGE/data-api/controllers/editformDelete.js`
- Modify: `/Volumes/MACEXSTORAGE/data-api/controllers/editFormController.js`
- Modify: `/Volumes/MACEXSTORAGE/data-api/utils/agentInterpreter.js` (export `isoDate` only)
- Test: `/Volumes/MACEXSTORAGE/data-api/controllers/editEndpoints.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `PUT /api/editdata/:id` accepting `{ breakdown?, machine_no?, bgdate? }` and applying only present fields; `DELETE /api/editdata/:id` returning `200 {deleted:<id>}`, `404`, or `400`. Exports `isoDate` from `utils/agentInterpreter.js`.

- [ ] **Step 1: Export the existing ISO date guard for reuse**

`utils/agentInterpreter.js` already defines `isoDate` at line 57. Change only its `module.exports` line (line 116) to add it — do not alter the function or any other export:

```js
module.exports = { normalizeInterpretation, CONFIDENCE_FLOOR, RESPONSE_SCHEMA, DEFAULT_CLARIFY, isoDate };
```

- [ ] **Step 2: Write the failing tests**

Create `/Volumes/MACEXSTORAGE/data-api/controllers/editEndpoints.test.js`. These test the controllers as pure request handlers with fake `req`/`res` and an injected model, so no database is needed.

```js
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { buildUpdate, buildDeleteResult } = require("./editHelpers.js");

describe("buildUpdate", () => {
  it("applies only the fields that are present", () => {
    expect(buildUpdate({ breakdown: "new text" })).toEqual({ breakdown: "new text" });
  });

  it("accepts machine_no and bgdate, which the old controller dropped", () => {
    expect(buildUpdate({ machine_no: "2-512", bgdate: "2026-08-12" })).toEqual({
      machine_no: "2-512",
      bgdate: "2026-08-12",
    });
  });

  it("rejects a non-ISO bgdate rather than letting Mongoose guess", () => {
    expect(buildUpdate({ bgdate: "08-12-2026" })).toEqual({});
  });

  it("ignores unknown fields entirely", () => {
    expect(buildUpdate({ hacked: true, breakdown: "ok" })).toEqual({ breakdown: "ok" });
  });

  it("returns an empty object for an empty body", () => {
    expect(buildUpdate({})).toEqual({});
    expect(buildUpdate(null)).toEqual({});
  });

  it("keeps an empty-string breakdown, which is a real edit", () => {
    expect(buildUpdate({ breakdown: "" })).toEqual({ breakdown: "" });
  });
});

describe("buildDeleteResult", () => {
  it("reports success when one document was removed", () => {
    expect(buildDeleteResult({ deletedCount: 1 }, "abc")).toEqual({
      status: 200,
      body: { deleted: "abc" },
    });
  });

  it("reports 404 when nothing matched", () => {
    expect(buildDeleteResult({ deletedCount: 0 }, "abc")).toEqual({
      status: 404,
      body: { message: "Record not found" },
    });
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npx vitest run controllers/editEndpoints.test.js`
Expected: FAIL — `Cannot find module './editHelpers.js'`

- [ ] **Step 4: Create the pure helpers**

Create `/Volumes/MACEXSTORAGE/data-api/controllers/editHelpers.js`:

```js
const { isoDate } = require("../utils/agentInterpreter.js");

// Only these fields may be changed through the edit endpoint. Anything else in
// the request body is ignored rather than passed to Mongoose.
const EDITABLE = ["breakdown", "machine_no", "bgdate"];

const buildUpdate = (body) => {
  const source = body && typeof body === "object" ? body : {};
  const update = {};
  for (const field of EDITABLE) {
    if (!(field in source)) continue;
    if (field === "bgdate") {
      const valid = isoDate(typeof source.bgdate === "string" ? source.bgdate : "");
      if (valid) update.bgdate = valid;
      continue;
    }
    if (typeof source[field] === "string") update[field] = source[field];
  }
  return update;
};

const buildDeleteResult = (result, id) =>
  result.deletedCount > 0
    ? { status: 200, body: { deleted: id } }
    : { status: 404, body: { message: "Record not found" } };

module.exports = { buildUpdate, buildDeleteResult, EDITABLE };
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npx vitest run controllers/editEndpoints.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 6: Repair the delete controller**

Replace the whole of `/Volumes/MACEXSTORAGE/data-api/controllers/editformDelete.js`:

```js
const machine = require("../models/machine.js");
const { buildDeleteResult } = require("./editHelpers.js");

// The previous version never called res, so the request hung until the client
// timed out while the record was in fact deleted.
const editformDelete = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await machine.deleteOne({ _id: id });
    const { status, body } = buildDeleteResult(result, id);
    return res.status(status).json(body);
  } catch (error) {
    // A malformed ObjectId lands here.
    return res.status(400).json({ message: "Invalid record id" });
  }
};

module.exports = editformDelete;
```

- [ ] **Step 7: Repair the edit controller**

Replace the whole of `/Volumes/MACEXSTORAGE/data-api/controllers/editFormController.js`:

```js
const machine = require("../models/machine.js");
const { buildUpdate } = require("./editHelpers.js");

const EditformController = async (req, res) => {
  const { id } = req.params;
  const update = buildUpdate(req.body);

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  try {
    const data = await machine.findByIdAndUpdate(id, update, { new: true });
    if (!data) return res.status(404).json({ message: "Record not found" });
    return res.status(201).json(data);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

module.exports = EditformController;
```

- [ ] **Step 8: Confirm nothing regressed**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npm test`
Expected: PASS — 33 tests (25 existing + 8 new).

- [ ] **Step 9: Commit**

```bash
cd /Volumes/MACEXSTORAGE/data-api && git add controllers/editformDelete.js controllers/editFormController.js controllers/editHelpers.js controllers/editEndpoints.test.js utils/agentInterpreter.js && git commit -m "fix: repair the hanging delete and the field-dropping edit endpoint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The tool loop with server-side id provenance

The security-critical task. The loop is written with its dependencies injected so it can be tested without a database or a network.

**Files:**
- Create: `/Volumes/MACEXSTORAGE/data-api/utils/agentTools.js`
- Test: `/Volumes/MACEXSTORAGE/data-api/utils/agentTools.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `TOOL_DEFINITIONS` (array), `MAX_ITERATIONS` (4), `SYSTEM_PROMPT` (string), and `runToolLoop({ message, chat, findBreakdowns })` returning one of `{kind:"records"|"propose_update"|"propose_delete"|"reply"|"error", ...}`.

- [ ] **Step 1: Write the failing tests**

Create `/Volumes/MACEXSTORAGE/data-api/utils/agentTools.test.js`:

```js
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { runToolLoop, MAX_ITERATIONS, TOOL_DEFINITIONS } = require("./agentTools.js");

// A fake `chat` that replays a scripted list of model replies in order.
const scriptedChat = (replies) => {
  let i = 0;
  return async () => replies[i++] ?? { content: "done" };
};

const RECORD = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  machine_no: "251",
  breakdown: "spindle motor failure",
  bgdate: "2026-08-15T00:00:00.000Z",
};

describe("TOOL_DEFINITIONS", () => {
  it("exposes exactly the three intended tools", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name)).toEqual([
      "find_breakdowns",
      "propose_update_breakdown",
      "propose_delete_breakdown",
    ]);
  });
});

describe("runToolLoop — lookup", () => {
  it("executes find_breakdowns and returns the real records", async () => {
    const out = await runToolLoop({
      message: "what happened to 251",
      chat: scriptedChat([
        { tool_calls: [{ function: { name: "find_breakdowns", arguments: { machine_no: "251" } } }] },
        { content: "Here is the history." },
      ]),
      findBreakdowns: async () => [RECORD],
    });
    expect(out.kind).toBe("records");
    expect(out.machine_no).toBe("251");
    expect(out.records).toEqual([RECORD]);
  });

  it("reports plainly when a machine has no records", async () => {
    const out = await runToolLoop({
      message: "what happened to 999",
      chat: scriptedChat([
        { tool_calls: [{ function: { name: "find_breakdowns", arguments: { machine_no: "999" } } }] },
        { content: "Nothing found." },
      ]),
      findBreakdowns: async () => [],
    });
    expect(out.kind).toBe("reply");
    expect(out.text).toContain("999");
  });
});

describe("runToolLoop — id provenance (security critical)", () => {
  it("refuses a delete whose id was never returned by a lookup", async () => {
    const out = await runToolLoop({
      message: "delete record abc",
      chat: scriptedChat([
        {
          tool_calls: [
            { function: { name: "propose_delete_breakdown", arguments: { id: "ffffffffffffffffffffffff" } } },
          ],
        },
      ]),
      findBreakdowns: async () => [RECORD],
    });
    expect(out.kind).toBe("error");
    expect(out.reason).toBe("unknown_record_id");
  });

  it("refuses an update whose id was never returned by a lookup", async () => {
    const out = await runToolLoop({
      message: "change that record",
      chat: scriptedChat([
        {
          tool_calls: [
            {
              function: {
                name: "propose_update_breakdown",
                arguments: { id: "ffffffffffffffffffffffff", breakdown: "x" },
              },
            },
          ],
        },
      ]),
      findBreakdowns: async () => [RECORD],
    });
    expect(out.kind).toBe("error");
    expect(out.reason).toBe("unknown_record_id");
  });

  it("allows a delete for an id that a lookup did return", async () => {
    const out = await runToolLoop({
      message: "delete the spindle one for 251",
      chat: scriptedChat([
        { tool_calls: [{ function: { name: "find_breakdowns", arguments: { machine_no: "251" } } }] },
        { tool_calls: [{ function: { name: "propose_delete_breakdown", arguments: { id: RECORD._id } } }] },
      ]),
      findBreakdowns: async () => [RECORD],
    });
    expect(out.kind).toBe("propose_delete");
    expect(out.record).toEqual(RECORD);
  });

  it("carries only the changed fields on an update proposal", async () => {
    const out = await runToolLoop({
      message: "fix the date on that one",
      chat: scriptedChat([
        { tool_calls: [{ function: { name: "find_breakdowns", arguments: { machine_no: "251" } } }] },
        {
          tool_calls: [
            {
              function: {
                name: "propose_update_breakdown",
                arguments: { id: RECORD._id, bgdate: "2026-08-12" },
              },
            },
          ],
        },
      ]),
      findBreakdowns: async () => [RECORD],
    });
    expect(out.kind).toBe("propose_update");
    expect(out.changes).toEqual({ bgdate: "2026-08-12" });
    expect(out.record).toEqual(RECORD);
  });
});

describe("runToolLoop — bounds and malformed input", () => {
  it("stops after MAX_ITERATIONS instead of looping forever", async () => {
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return { tool_calls: [{ function: { name: "find_breakdowns", arguments: { machine_no: "251" } } }] };
    };
    const out = await runToolLoop({ message: "loop", chat, findBreakdowns: async () => [RECORD] });
    expect(calls).toBe(MAX_ITERATIONS);
    expect(["records", "reply"]).toContain(out.kind);
  });

  it("returns a plain reply when the model calls no tool at all", async () => {
    const out = await runToolLoop({
      message: "hello",
      chat: scriptedChat([{ content: "Ask me about a machine." }]),
      findBreakdowns: async () => [],
    });
    expect(out).toEqual({ kind: "reply", text: "Ask me about a machine." });
  });

  it("treats an unknown tool name as an error rather than guessing", async () => {
    const out = await runToolLoop({
      message: "drop the table",
      chat: scriptedChat([{ tool_calls: [{ function: { name: "drop_everything", arguments: {} } }] }]),
      findBreakdowns: async () => [],
    });
    expect(out.kind).toBe("error");
    expect(out.reason).toBe("unknown_tool");
  });

  it("errors rather than throwing when find_breakdowns has no machine number", async () => {
    const out = await runToolLoop({
      message: "look something up",
      chat: scriptedChat([{ tool_calls: [{ function: { name: "find_breakdowns", arguments: {} } }] }]),
      findBreakdowns: async () => [],
    });
    expect(out.kind).toBe("error");
    expect(out.reason).toBe("missing_machine_no");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npx vitest run utils/agentTools.test.js`
Expected: FAIL — `Cannot find module './agentTools.js'`

- [ ] **Step 3: Implement the loop**

Create `/Volumes/MACEXSTORAGE/data-api/utils/agentTools.js`:

```js
const MAX_ITERATIONS = 4;
const MAX_RECORDS = 50;

const SYSTEM_PROMPT = `You help a maintenance engineer work with a machine breakdown database.

Use the tools to look things up. Never invent record data or record ids.

Rules you must follow:
- To change or remove a record you must FIRST call find_breakdowns and use an id from its results. Never guess an id.
- Deletions are one record at a time. If the user asks to delete several, call find_breakdowns and let them choose.
- propose_update_breakdown and propose_delete_breakdown do NOT perform the change. They ask the user to confirm it. Say so plainly.
- If you cannot tell which record the user means, ask a short question instead of guessing.`;

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "find_breakdowns",
      description:
        "Look up all breakdown records for one machine by its machine number. Use this before proposing any change.",
      parameters: {
        type: "object",
        properties: {
          machine_no: {
            type: "string",
            description: 'The machine number alone, for example "251" or "2-512". Not a sentence.',
          },
        },
        required: ["machine_no"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_update_breakdown",
      description:
        "Ask the user to confirm a change to ONE existing record. Does not save anything. The id must come from a find_breakdowns result.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The _id from a find_breakdowns result." },
          breakdown: { type: "string", description: "Replacement fault text. Omit if unchanged." },
          bgdate: { type: "string", description: "Replacement date as YYYY-MM-DD. Omit if unchanged." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_delete_breakdown",
      description:
        "Ask the user to confirm deleting ONE existing record permanently. Does not delete anything. The id must come from a find_breakdowns result.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The _id from a find_breakdowns result." },
        },
        required: ["id"],
      },
    },
  },
];

const str = (v) => (typeof v === "string" ? v.trim() : "");

const runToolLoop = async ({ message, chat, findBreakdowns }) => {
  // Every _id this loop has actually shown to the model. A proposal referencing
  // anything outside this set is rejected — the invariant is enforced here, in
  // code, not by trusting the system prompt.
  const seenIds = new Map();
  const transcript = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message },
  ];
  let lastRecords = null;
  let lastMachineNo = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const reply = await chat(transcript);
    const calls = Array.isArray(reply?.tool_calls) ? reply.tool_calls : [];

    if (calls.length === 0) {
      if (lastRecords && lastRecords.length > 0) {
        return {
          kind: "records",
          machine_no: lastMachineNo,
          records: lastRecords,
          reply: str(reply?.content),
        };
      }
      if (lastRecords && lastRecords.length === 0) {
        return { kind: "reply", text: `No breakdown records found for ${lastMachineNo}.` };
      }
      return { kind: "reply", text: str(reply?.content) };
    }

    const call = calls[0];
    const name = call?.function?.name;
    const args = call?.function?.arguments ?? {};

    if (name === "find_breakdowns") {
      const machineNo = str(args.machine_no);
      if (!machineNo) return { kind: "error", reason: "missing_machine_no" };

      const records = (await findBreakdowns(machineNo)).slice(0, MAX_RECORDS);
      records.forEach((r) => seenIds.set(String(r._id), r));
      lastRecords = records;
      lastMachineNo = machineNo;

      transcript.push({ role: "assistant", content: "", tool_calls: [call] });
      transcript.push({
        role: "tool",
        content: JSON.stringify(
          records.map((r) => ({
            id: String(r._id),
            machine_no: r.machine_no,
            breakdown: r.breakdown,
            bgdate: r.bgdate,
          }))
        ),
      });
      continue;
    }

    if (name === "propose_update_breakdown" || name === "propose_delete_breakdown") {
      const record = seenIds.get(str(args.id));
      if (!record) return { kind: "error", reason: "unknown_record_id" };

      if (name === "propose_delete_breakdown") {
        return { kind: "propose_delete", record };
      }

      const changes = {};
      if (typeof args.breakdown === "string") changes.breakdown = args.breakdown;
      if (typeof args.bgdate === "string") changes.bgdate = args.bgdate;
      return { kind: "propose_update", record, changes };
    }

    return { kind: "error", reason: "unknown_tool" };
  }

  if (lastRecords && lastRecords.length > 0) {
    return { kind: "records", machine_no: lastMachineNo, records: lastRecords, reply: "" };
  }
  return { kind: "reply", text: "Could you be more specific about which machine you mean?" };
};

module.exports = { runToolLoop, TOOL_DEFINITIONS, MAX_ITERATIONS, SYSTEM_PROMPT };
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npx vitest run utils/agentTools.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Confirm nothing regressed**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npm test`
Expected: PASS — 44 tests.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/MACEXSTORAGE/data-api && git add utils/agentTools.js utils/agentTools.test.js && git commit -m "feat: add agent tool loop with server-enforced id provenance

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the loop to Ollama and expose POST /api/agent/act

**Files:**
- Create: `/Volumes/MACEXSTORAGE/data-api/utils/ollamaTools.js`
- Create: `/Volumes/MACEXSTORAGE/data-api/controllers/agentActController.js`
- Create: `/Volumes/MACEXSTORAGE/data-api/Router/AgentActRouter.js`
- Modify: `/Volumes/MACEXSTORAGE/data-api/index.js`

**Interfaces:**
- Consumes: `runToolLoop`, `TOOL_DEFINITIONS` from Task 2. The repaired endpoints from Task 1 are used by the *frontend*, not here.
- Produces: `POST /api/agent/act` accepting `{message}` and returning the `kind` shapes from Task 2, or `{message, reason}` with status 502.

- [ ] **Step 1: Create the tool-calling Ollama client**

`utils/ollama.js` is for the single-shot structured-output create path and must not be edited. Create a sibling, `/Volumes/MACEXSTORAGE/data-api/utils/ollamaTools.js`:

```js
const { TOOL_DEFINITIONS } = require("./agentTools.js");

const OLLAMA_URL = process.env.OLLAMA_URL || "https://ollama.com/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "minimax-m3";
const TIMEOUT_MS = 60000;

const tagged = (code, detail) => Object.assign(new Error(detail), { code });

// One turn of the conversation: send the transcript, get back the model's
// message (which may contain tool_calls).
const chatWithTools = async (transcript) => {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw tagged("missing_api_key", "OLLAMA_API_KEY is not configured");
  if (typeof fetch !== "function") {
    throw tagged("runtime_no_fetch", `global fetch unavailable on Node ${process.version}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response;
    try {
      response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          tools: TOOL_DEFINITIONS,
          messages: transcript,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw tagged("upstream_timeout", `no response within ${TIMEOUT_MS}ms`);
      }
      throw tagged("upstream_unreachable", err.message);
    }

    if (!response.ok) {
      throw tagged(`upstream_${response.status}`, `Ollama returned ${response.status}`);
    }

    const body = await response.json();
    return body?.message ?? {};
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { chatWithTools };
```

- [ ] **Step 2: Create the controller**

Create `/Volumes/MACEXSTORAGE/data-api/controllers/agentActController.js`:

```js
const machine = require("../models/machine.js");
const { runToolLoop } = require("../utils/agentTools.js");
const { chatWithTools } = require("../utils/ollamaTools.js");

// The only database access this endpoint has is this read. There is no write
// path here at all — writes happen when the user confirms, via the existing
// edit and delete endpoints.
const findBreakdowns = (machineNo) =>
  machine.find({ machine_no: machineNo }).sort({ bgdate: -1 }).lean();

const agentActController = async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) return res.status(400).json({ message: "message is required" });
  if (message.length > 2000) return res.status(400).json({ message: "message is too long" });

  try {
    const result = await runToolLoop({ message, chat: chatWithTools, findBreakdowns });
    return res.status(200).json(result);
  } catch (error) {
    console.error("[api/agent/act] failed:", error.code || "unknown", "-", error.message);
    return res.status(502).json({
      message: "Could not complete the request",
      reason: error.code || "unknown",
    });
  }
};

module.exports = agentActController;
```

- [ ] **Step 3: Create the router**

Create `/Volumes/MACEXSTORAGE/data-api/Router/AgentActRouter.js`:

```js
const express = require("express");
const router = express.Router();
const agentActController = require("../controllers/agentActController.js");

router.post("/", agentActController);

module.exports = router;
```

- [ ] **Step 4: Mount it**

In `/Volumes/MACEXSTORAGE/data-api/index.js`, add the require beside the other router requires (immediately after the `agentRoute` line):

```js
const agentActRoute = require('./Router/AgentActRouter.js')
```

and add the mount immediately after `app.use('/api/agent', agentRoute)`:

```js
app.use('/api/agent/act', agentActRoute)
```

**Ordering matters:** this must sit with the other `app.use('/api/...')` mounts and before `app.get('*', ...)`, or the route is unreachable. Mount `/api/agent/act` *before* `/api/agent` if the existing mount would otherwise swallow it — verify by testing both endpoints in Step 6.

- [ ] **Step 5: Confirm nothing regressed**

Run: `cd /Volumes/MACEXSTORAGE/data-api && npm test`
Expected: PASS — 44 tests.

- [ ] **Step 6: Verify live against the real API**

`/Volumes/MACEXSTORAGE/data-api/.env` already holds `PORT=5050`, `MONGO_URL`, `OLLAMA_API_KEY` and `OLLAMA_MODEL`. **Do not read, print, modify or commit it.** Port 5000 is occupied by macOS ControlCenter on this machine; use 5050.

```bash
cd /Volumes/MACEXSTORAGE/data-api && node index.js
```

In another shell, confirm the existing create path still works:

```bash
curl -s -X POST http://localhost:5050/api/agent/interpret -H 'Content-Type: application/json' -d '{"message":"machine 251 had a spindle motor failure today"}'
```
Expected: `{"intent":"breakdown",...}` — unchanged.

Then the new endpoint, against a machine that really has records:

```bash
curl -s -X POST http://localhost:5050/api/agent/act -H 'Content-Type: application/json' -d '{"message":"what problems has machine 2-512 had"}'
```
Expected: `{"kind":"records","machine_no":"2-512","records":[...]}` with real rows.

And the guards:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5050/api/agent/act -H 'Content-Type: application/json' -d '{"message":"  "}'
```
Expected: `400`

Record every command and its real output in the report. Stop the server when done.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/MACEXSTORAGE/data-api && git add utils/ollamaTools.js controllers/agentActController.js Router/AgentActRouter.js index.js && git commit -m "feat: expose POST /api/agent/act running the tool loop

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend pure helpers for actions

**Files:**
- Create: `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentActions.js`
- Test: `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentActions.test.js`

**Interfaces:**
- Consumes: the response shapes from Task 2/3.
- Produces: `buildUpdateRequest(record, changes)`, `buildDeleteRequest(record)`, `diffFields(record, changes)`, `formatRecordDate(value)`, `canConfirmProposal(proposal)`.

- [ ] **Step 1: Write the failing tests**

Create `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentActions.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Volumes/MACEXSTORAGE/bg-data && npx vitest run src/lib/agentActions.test.js`
Expected: FAIL — cannot resolve `./agentActions`.

- [ ] **Step 3: Implement the helpers**

Create `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentActions.js`:

```js
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
  const source = changes && typeof changes === "object" ? changes : {};
  const payload = {};
  for (const field of ["breakdown", "bgdate", "machine_no"]) {
    if (typeof source[field] === "string") payload[field] = source[field];
  }
  if (!id || Object.keys(payload).length === 0) return null;
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
    const after = source[field];
    if (before === after) continue;
    rows.push({ field, label: FIELD_LABELS[field], before, after });
  }
  return rows;
};

export const canConfirmProposal = (proposal) => {
  if (!proposal || typeof proposal !== "object") return false;
  if (!recordId(proposal.record)) return false;
  if (proposal.kind === "propose_delete") return true;
  if (proposal.kind === "propose_update") {
    return buildUpdateRequest(proposal.record, proposal.changes) !== null;
  }
  return false;
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd /Volumes/MACEXSTORAGE/bg-data && npx vitest run src/lib/agentActions.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Confirm nothing regressed**

Run: `cd /Volumes/MACEXSTORAGE/bg-data && npm test`
Expected: PASS — 194 tests (175 existing + 19 new).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git add src/lib/agentActions.js src/lib/agentActions.test.js && git commit -m "feat: add pure helpers for agent lookup, edit and delete

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Records table and confirmation cards in the UI

**Files:**
- Modify: `/Volumes/MACEXSTORAGE/bg-data/src/components/AIAgent.jsx`

**Interfaces:**
- Consumes: `buildUpdateRequest`, `buildDeleteRequest`, `diffFields`, `formatRecordDate`, `canConfirmProposal` from Task 4; `POST /api/agent/act` from Task 3.
- Produces: nothing consumed by later tasks.

Read the whole existing file before editing. It already has: an `append`/`updateCard`/`resolveCard` message model, a `savingIndices` per-card in-flight lock, `isSaving(i)`, the `agent-ticket` / `agent-enter` / `MONO` styling conventions, and a `StatusLine` component. Reuse all of it rather than inventing parallel machinery.

- [ ] **Step 1: Route the request to the right endpoint**

The page currently always calls `/api/agent/interpret`. It must now choose. Add above the component:

```js
// Questions go to the tool-calling endpoint; statements of fact go to the
// proven structured-output create path. Deliberately a cheap local heuristic:
// misrouting is harmless because /act only ever proposes and /interpret only
// ever produces a card the user must confirm.
const LOOKUP_HINTS =
  /\b(what|which|when|show|list|history|find|search|any|how many|last|delete|remove|edit|change|update|correct|fix)\b/i;

const looksLikeLookup = (text) => LOOKUP_HINTS.test(text) || text.trim().endsWith("?");
```

In `handleSend`, replace the single axios call with:

```js
      const endpoint = looksLikeLookup(message) ? "/api/agent/act" : "/api/agent/interpret";
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}${endpoint}`, { message });

      if (endpoint === "/api/agent/act") {
        if (data?.kind === "records") {
          append({ role: "records", machine_no: data.machine_no, records: data.records });
        } else if (data?.kind === "propose_update" || data?.kind === "propose_delete") {
          append({ role: "proposal", proposal: data });
        } else {
          append({ role: "agent", text: data?.text || "I could not work that one out." });
        }
      } else {
        // Explicit allow-list rather than an implicit "else render a card":
        // only these two intents carry fields worth reviewing.
        const isCard = data?.intent === "breakdown" || data?.intent === "machine_details";
        append(
          isCard
            ? { role: "card", interpretation: data }
            : { role: "agent", text: agentReplyText(data) || UNSUPPORTED_TEXT }
        );
      }
```

- [ ] **Step 2: Add the records table**

Add this component above `AIAgent`:

```js
const RecordsTable = ({ machineNo, records }) => (
  <div className="agent-enter rounded-lg border bg-card overflow-hidden">
    <div className="flex items-center gap-2 border-b bg-muted/30 px-3.5 py-2.5">
      <span className={cn(MONO, "text-[10px] uppercase tracking-[0.14em] text-muted-foreground")}>
        Machine
      </span>
      <span className={cn(MONO, "text-xs font-bold")}>{machineNo}</span>
      <span className={cn(MONO, "ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground")}>
        {records.length} record{records.length === 1 ? "" : "s"}
      </span>
    </div>
    <div className="max-h-64 overflow-y-auto divide-y">
      {records.map((r) => (
        <div key={r._id} className="px-3.5 py-2.5">
          <div className={cn(MONO, "text-[10px] text-muted-foreground")}>
            {formatRecordDate(r.bgdate) || "no date"}
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{r.breakdown}</div>
        </div>
      ))}
    </div>
  </div>
);
```

- [ ] **Step 3: Add the confirmation card for edits and deletes**

Add above `AIAgent`:

```js
const ProposalCard = ({ proposal, index, saving, onConfirm, onDiscard }) => {
  const destructive = proposal.kind === "propose_delete";
  const rows = destructive ? [] : diffFields(proposal.record, proposal.changes);
  const record = proposal.record;

  return (
    <article
      className={cn(
        "agent-enter agent-ticket relative overflow-hidden rounded-lg border bg-card pl-4",
        destructive && "agent-ticket-destructive"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3.5 py-2.5">
        <span
          className={cn(
            MONO,
            "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em]",
            destructive ? "text-destructive" : "text-[hsl(var(--signal-pending))]"
          )}
        >
          <span
            className={cn(
              "agent-beacon h-1.5 w-1.5 rounded-full",
              destructive ? "bg-destructive" : "bg-[hsl(var(--signal-pending))]"
            )}
          />
          {destructive ? "Permanent delete" : "Confirm change"}
        </span>
        <span className={cn(MONO, "ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground")}>
          Machine {record.machine_no}
        </span>
      </div>

      <div className="p-3.5">
        {destructive ? (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              This record will be removed permanently. This cannot be undone.
            </p>
            <div className="rounded-md border border-destructive/40 bg-destructive/[0.05] p-3">
              <div className={cn(MONO, "text-[10px] text-muted-foreground")}>
                {formatRecordDate(record.bgdate) || "no date"}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{record.breakdown}</div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((row) => (
              <div key={row.field} className="grid gap-1">
                <span className={cn(MONO, "text-[10px] uppercase tracking-[0.14em] text-muted-foreground")}>
                  {row.label}
                </span>
                <span className="text-sm text-muted-foreground line-through decoration-destructive/60">
                  {row.before || "(empty)"}
                </span>
                <span className="text-sm">{row.after}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-dashed pt-3 flex items-center gap-2">
          <span className={cn(MONO, "text-[10px] text-muted-foreground")}>
            {canConfirmProposal(proposal) ? "Awaiting your approval" : "Nothing to apply"}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={destructive ? "destructive" : "default"}
              disabled={!canConfirmProposal(proposal) || saving}
              onClick={onConfirm}
            >
              {destructive ? "Delete record" : "Apply change"}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
};
```

- [ ] **Step 4: Add the confirm handler**

Add inside `AIAgent`, next to `handleSave`. It reuses the same `savingIndices` lock, so a double-click cannot fire two writes:

```js
  const handleProposal = async (index, proposal) => {
    if (isSaving(index)) return;
    setSavingIndices((prev) => new Set(prev).add(index));

    try {
      const destructive = proposal.kind === "propose_delete";
      const request = destructive
        ? buildDeleteRequest(proposal.record)
        : buildUpdateRequest(proposal.record, proposal.changes);

      if (!request) {
        toast.error("Nothing to apply");
        return;
      }

      const url = `${import.meta.env.VITE_API_URL}${request.path}`;
      const promise = destructive ? axios.delete(url) : axios.put(url, request.payload);

      toast.promise(promise, {
        loading: destructive ? "Deleting..." : "Applying...",
        success: destructive ? "Record deleted" : "Record updated",
        error: destructive ? "Failed to delete" : "Failed to update",
      });

      await promise;
      resolveCard(
        index,
        destructive ? "Record deleted permanently" : "Record updated",
        "committed"
      );
    } catch (error) {
      console.error("Agent action failed:", error);
    } finally {
      setSavingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };
```

- [ ] **Step 5: Render the two new message roles**

In the `messages.map` body, add these branches immediately before the final `return <Bubble ...>`:

```js
            if (m.role === "records") {
              return <RecordsTable key={i} machineNo={m.machine_no} records={m.records} />;
            }

            if (m.role === "proposal") {
              return (
                <ProposalCard
                  key={i}
                  proposal={m.proposal}
                  index={i}
                  saving={isSaving(i)}
                  onConfirm={() => handleProposal(i, m.proposal)}
                  onDiscard={() => resolveCard(i, "Cancelled — nothing changed", "discarded")}
                />
              );
            }
```

Add the new imports to the existing import from `../lib/agentActions`:

```js
import {
  buildUpdateRequest,
  buildDeleteRequest,
  diffFields,
  formatRecordDate,
  canConfirmProposal,
} from "../lib/agentActions";
```

- [ ] **Step 6: Add the destructive ticket rule**

In `/Volumes/MACEXSTORAGE/bg-data/src/index.css`, directly after the existing `.agent-ticket-committed::before` rule, add:

```css
.agent-ticket-destructive::before {
  background: hsl(var(--destructive));
}
```

- [ ] **Step 7: Verify**

Run: `cd /Volumes/MACEXSTORAGE/bg-data && npm test`
Expected: PASS — 194 tests.

Run: `cd /Volumes/MACEXSTORAGE/bg-data && npx vite build`
Expected: succeeds. A pre-existing `>500 kB chunk` warning is unrelated.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git add src/components/AIAgent.jsx src/index.css && git commit -m "feat: render breakdown lookups and edit/delete confirmations

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification in the browser

No code. This proves the feature works against the real backend and database, and that the destructive paths are safe.

**Files:** none.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Start the backend**

```bash
cd /Volumes/MACEXSTORAGE/data-api && node index.js
```
Expected: `Server Started on 5050` and `connected to Database`.

- [ ] **Step 2: Point the frontend at it**

`/Volumes/MACEXSTORAGE/bg-data/.env` is **tracked in git** and normally holds the production URL. Change it temporarily:

```bash
cd /Volumes/MACEXSTORAGE/bg-data && echo "VITE_API_URL=http://localhost:5050" > .env
```

Start the dev server with the `dev` configuration in `.claude/launch.json` and open `/agent`. Restart it after changing `.env` — Vite reads env only at boot.

- [ ] **Step 3: Create a disposable record to act on**

Do not practise edits and deletes on real maintenance history. Type into the agent:

`machine ZZTEST-Q1 bearing noise on approach today`

Confirm and save it. This goes through the untouched create path.

- [ ] **Step 4: Verify lookup**

Type: `what problems has ZZTEST-Q1 had`
Expected: a records table headed with the machine number, showing the record from Step 3 with its date and text.

- [ ] **Step 5: Verify edit**

Type: `change the fault text on ZZTEST-Q1 to bearing noise and vibration`
Expected: a "Confirm change" card showing the old text struck through above the new text. Click **Apply change**. Expected: a green "Record updated" status line. Look the machine up again and confirm the text really changed.

- [ ] **Step 6: Verify the bulk-delete refusal**

Type: `delete all records for ZZTEST-Q1`
Expected: **not** a mass deletion. Either a records table to choose from, or a single-record confirmation — never several records destroyed at once.

- [ ] **Step 7: Verify delete, including the double-click lock**

Get a single-record delete confirmation, then click **Delete record** three times rapidly.
Expected: exactly one delete. The card resolves to "Record deleted permanently".

Confirm in the database that the record is gone and that nothing else was touched:

```bash
cd /Volumes/MACEXSTORAGE/bg-data && node -e "
const { MongoClient } = require('mongodb');
(async () => {
  const c = new MongoClient(process.env.MONGO_URI);
  await c.connect();
  const col = c.db('machine_breakdown').collection('bgdatas');
  console.log('ZZTEST-Q1 remaining:', await col.countDocuments({ machine_no: /ZZTEST-Q1/i }));
  console.log('total records:', await col.countDocuments());
  await c.close();
})();
"
```
Expected: `ZZTEST-Q1 remaining: 0`. Note the total and confirm it matches the pre-test total.

- [ ] **Step 8: Verify the create path did not regress**

Type: `machine 251 had a spindle motor failure today`
Expected: the ordinary breakdown confirmation card, with `251` alone in Machine No — not the whole sentence. **Discard it**; do not save.

- [ ] **Step 9: Check the console and restore**

Confirm there are no console errors. Then restore the tracked env file and stop the backend:

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git checkout .env && git status --short
```
Expected: clean. `.env` must read `VITE_API_URL=https://data-api-d6lk.onrender.com`.

- [ ] **Step 10: Remove any leftover test data**

If any `ZZTEST-` record survives, delete it by `_id` and report what was removed.

# AI Agent Data Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a plain-language sentence and have it saved to MongoDB as a breakdown report or machine-details record, after confirming the parsed fields.

**Architecture:** A new stateless backend endpoint (`POST /api/agent/interpret`) calls Ollama Cloud to classify the message and extract fields; it never touches MongoDB. The frontend renders the result as an editable confirm card, then saves through the two existing, already-working endpoints (`/api/submit-form`, `/api/machine-details`). All parsing/branching logic lives in pure, React-free modules so it can be tested without a DOM.

**Tech Stack:** Backend — Node 18+/Express/CommonJS, built-in `fetch`, vitest (new devDependency). Frontend — React 18, Vite, vitest, axios, Tailwind + existing shadcn-style `ui/` primitives.

## Global Constraints

- **Two repos.** Frontend: `/Volumes/MACEXSTORAGE/bg-data` (`ttpunch/bg-data`). Backend: `/Volumes/MACEXSTORAGE/data-api` (`ttpunch/data-api`). Commit in the repo you are editing; never mix.
- **Backend is CommonJS** (`require`/`module.exports`). Frontend is ESM (`import`/`export`).
- **The agent endpoint never writes to MongoDB.** It only interprets. All writes continue through `FormRouter.js` / `MachineDetailsRouter.js`, unmodified.
- **No new auth.** Every existing route in `data-api` has no auth middleware; the new route matches. Do not add JWT checks.
- **No new HTTP client dependency in the backend.** Use Node's built-in global `fetch`.
- **Secrets never committed.** `OLLAMA_API_KEY` goes in `data-api/.env` (already gitignored) and Render's env config.
- **Confidence floor is `0.5`** — below that, a `breakdown`/`machine_details` guess is downgraded to `clarify` server-side.
- **Field naming:** the interpret endpoint returns *frontend form* names for breakdowns (`mcdata`, `bgdetail`, `bgdate`) because `FormRouter.js` does the rename to `machine_no`/`breakdown` on save. Machine-details names (`machine_no`, `machine_name`, `location`, `specifications`) are already identical on both sides.
- **Existing test style:** pure-logic vitest tests (`src/lib/*.test.js`). There is no `@testing-library/react` or jsdom in either repo — do not add them. Testable logic must live in pure modules.

---

### Task 1: Backend — pure interpretation normalizer

The trust boundary around the LLM's output. Everything unsafe or uncertain about the model's
reply is dealt with here, in a pure function with no network and no Express.

**Files:**
- Create: `/Volumes/MACEXSTORAGE/data-api/utils/agentInterpreter.js`
- Create: `/Volumes/MACEXSTORAGE/data-api/utils/agentInterpreter.test.js`
- Modify: `/Volumes/MACEXSTORAGE/data-api/package.json` (add vitest devDependency + test script)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `normalizeInterpretation(raw)` → `{ intent, confidence, fields, missing, clarifyQuestion }`.
    `intent` is one of `"breakdown" | "machine_details" | "clarify" | "unsupported"`.
    `fields` is `{}` for `clarify`/`unsupported`. `missing` is `string[]`. `clarifyQuestion` is
    a string (empty when not applicable).
  - `CONFIDENCE_FLOOR` (number, `0.5`)
  - `RESPONSE_SCHEMA` (object — the JSON schema handed to Ollama's `format` parameter)

- [ ] **Step 1: Add vitest to the backend**

Edit `/Volumes/MACEXSTORAGE/data-api/package.json`. Change the `scripts` and add
`devDependencies` so the file's top half reads:

```json
{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "nodemon index.js",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  },
```

Leave `keywords`, `author`, `license`, and the existing `dependencies` block untouched.

Then run:

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm install
```

- [ ] **Step 2: Write the failing test**

Create `/Volumes/MACEXSTORAGE/data-api/utils/agentInterpreter.test.js`:

```js
import { describe, it, expect } from "vitest";
import { normalizeInterpretation, CONFIDENCE_FLOOR } from "./agentInterpreter.js";

describe("normalizeInterpretation", () => {
  it("keeps a confident breakdown and lists no missing fields", () => {
    const out = normalizeInterpretation({
      intent: "breakdown",
      confidence: 0.9,
      fields: { mcdata: "251", bgdetail: "spindle motor failure", bgdate: "2026-08-15" },
    });
    expect(out.intent).toBe("breakdown");
    expect(out.fields).toEqual({
      mcdata: "251",
      bgdetail: "spindle motor failure",
      bgdate: "2026-08-15",
    });
    expect(out.missing).toEqual([]);
  });

  it("reports required breakdown fields that are absent", () => {
    const out = normalizeInterpretation({
      intent: "breakdown",
      confidence: 0.9,
      fields: { bgdetail: "spindle motor failure" },
    });
    expect(out.missing).toEqual(["mcdata"]);
    expect(out.fields.mcdata).toBe("");
    expect(out.fields.bgdate).toBe(null);
  });

  it("downgrades a low-confidence guess to clarify", () => {
    const out = normalizeInterpretation({
      intent: "breakdown",
      confidence: CONFIDENCE_FLOOR - 0.01,
      fields: { mcdata: "251", bgdetail: "something" },
    });
    expect(out.intent).toBe("clarify");
    expect(out.fields).toEqual({});
    expect(out.clarifyQuestion).toBeTruthy();
  });

  it("keeps the model's own clarify question when it asks one", () => {
    const out = normalizeInterpretation({
      intent: "clarify",
      confidence: 0.8,
      clarifyQuestion: "Is this a breakdown or a new machine?",
    });
    expect(out.intent).toBe("clarify");
    expect(out.clarifyQuestion).toBe("Is this a breakdown or a new machine?");
    expect(out.fields).toEqual({});
  });

  it("drops fields that do not belong to the chosen intent", () => {
    const out = normalizeInterpretation({
      intent: "machine_details",
      confidence: 0.9,
      fields: { machine_no: "251", bgdetail: "leaked from the other schema" },
    });
    expect(out.fields.bgdetail).toBeUndefined();
    expect(out.fields.machine_no).toBe("251");
  });

  it("defaults machine_details specifications to an array", () => {
    const out = normalizeInterpretation({
      intent: "machine_details",
      confidence: 0.9,
      fields: { machine_no: "251" },
    });
    expect(out.fields.specifications).toEqual([]);
  });

  it("keeps only well-formed specification entries", () => {
    const out = normalizeInterpretation({
      intent: "machine_details",
      confidence: 0.9,
      fields: {
        machine_no: "251",
        specifications: [
          { key: "Motor", value: "All axis" },
          { value: "no key so it is dropped" },
          "not an object",
        ],
      },
    });
    expect(out.fields.specifications).toEqual([{ key: "Motor", value: "All axis" }]);
  });

  it("treats an unknown intent as unsupported", () => {
    const out = normalizeInterpretation({ intent: "delete_everything", confidence: 0.99 });
    expect(out.intent).toBe("unsupported");
    expect(out.fields).toEqual({});
  });

  it("treats a null or non-object reply as unsupported", () => {
    expect(normalizeInterpretation(null).intent).toBe("unsupported");
    expect(normalizeInterpretation("nonsense").intent).toBe("unsupported");
  });

  it("treats a missing confidence as zero, so it cannot reach the save step", () => {
    const out = normalizeInterpretation({
      intent: "breakdown",
      fields: { mcdata: "251", bgdetail: "x" },
    });
    expect(out.intent).toBe("clarify");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm test
```

Expected: FAIL — `Failed to resolve import "./agentInterpreter.js"`.

- [ ] **Step 4: Write the implementation**

Create `/Volumes/MACEXSTORAGE/data-api/utils/agentInterpreter.js`:

```js
const CONFIDENCE_FLOOR = 0.5;

const INTENTS = ["breakdown", "machine_details", "clarify", "unsupported"];

const REQUIRED = {
  breakdown: ["mcdata", "bgdetail"],
  machine_details: ["machine_no"],
};

const DEFAULT_CLARIFY =
  "I'm not sure I understood that. Is this a breakdown report, or details for a machine?";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    confidence: { type: "number" },
    clarifyQuestion: { type: "string" },
    fields: {
      type: "object",
      properties: {
        mcdata: { type: "string" },
        bgdetail: { type: "string" },
        bgdate: { type: "string" },
        machine_no: { type: "string" },
        machine_name: { type: "string" },
        location: { type: "string" },
        specifications: {
          type: "array",
          items: {
            type: "object",
            properties: { key: { type: "string" }, value: { type: "string" } },
            required: ["key", "value"],
          },
        },
      },
    },
  },
  required: ["intent", "confidence"],
};

const str = (v) => (typeof v === "string" ? v.trim() : "");

const pickFields = (intent, fields) => {
  if (intent === "breakdown") {
    return {
      mcdata: str(fields.mcdata),
      bgdetail: str(fields.bgdetail),
      bgdate: str(fields.bgdate) || null,
    };
  }
  return {
    machine_no: str(fields.machine_no),
    machine_name: str(fields.machine_name),
    location: str(fields.location),
    specifications: Array.isArray(fields.specifications)
      ? fields.specifications
          .filter((s) => s && typeof s === "object" && str(s.key))
          .map((s) => ({ key: str(s.key), value: str(s.value) }))
      : [],
  };
};

const clarify = (question) => ({
  intent: "clarify",
  confidence: 0,
  fields: {},
  missing: [],
  clarifyQuestion: str(question) || DEFAULT_CLARIFY,
});

const normalizeInterpretation = (raw) => {
  if (!raw || typeof raw !== "object") {
    return { intent: "unsupported", confidence: 0, fields: {}, missing: [], clarifyQuestion: "" };
  }

  const intent = INTENTS.includes(raw.intent) ? raw.intent : "unsupported";
  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;

  if (intent === "clarify") return clarify(raw.clarifyQuestion);

  if (intent === "unsupported") {
    return { intent, confidence, fields: {}, missing: [], clarifyQuestion: "" };
  }

  if (confidence < CONFIDENCE_FLOOR) return clarify(raw.clarifyQuestion);

  const fields = pickFields(intent, raw.fields && typeof raw.fields === "object" ? raw.fields : {});
  const missing = REQUIRED[intent].filter((name) => !fields[name]);

  return { intent, confidence, fields, missing, clarifyQuestion: "" };
};

module.exports = { normalizeInterpretation, CONFIDENCE_FLOOR, RESPONSE_SCHEMA, DEFAULT_CLARIFY };
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm test
```

Expected: PASS — 10 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/MACEXSTORAGE/data-api && git add utils/agentInterpreter.js utils/agentInterpreter.test.js package.json package-lock.json && git commit -m "feat: add agent interpretation normalizer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — Ollama Cloud client, controller, and route

**Files:**
- Create: `/Volumes/MACEXSTORAGE/data-api/utils/ollama.js`
- Create: `/Volumes/MACEXSTORAGE/data-api/controllers/agentController.js`
- Create: `/Volumes/MACEXSTORAGE/data-api/Router/AgentRouter.js`
- Modify: `/Volumes/MACEXSTORAGE/data-api/index.js` (add require near line 19, add mount near line 46)
- Modify: `/Volumes/MACEXSTORAGE/data-api/.env` (local only — never committed)

**Interfaces:**
- Consumes: `normalizeInterpretation`, `RESPONSE_SCHEMA` from Task 1.
- Produces: `POST /api/agent/interpret` accepting `{ message }` and returning
  `{ intent, confidence, fields, missing, clarifyQuestion }`. Consumed by Task 3's
  `buildSavePayload` and Task 4's UI.

- [ ] **Step 1: Write the Ollama Cloud client**

Create `/Volumes/MACEXSTORAGE/data-api/utils/ollama.js`:

```js
const { RESPONSE_SCHEMA } = require("./agentInterpreter.js");
const dotenv = require("dotenv");
dotenv.config();

const OLLAMA_URL = process.env.OLLAMA_URL || "https://ollama.com/api/chat";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";
const TIMEOUT_MS = 30000;

const systemPrompt = (today) => `You convert a maintenance engineer's sentence into structured data for a machine breakdown tracker. Today's date is ${today}.

Choose exactly one intent:
- "breakdown": a fault, failure, repair, or observation about a machine on a date. Fields: mcdata (the machine number), bgdetail (what happened), bgdate (YYYY-MM-DD; resolve words like "today" or "yesterday" against today's date; use null if no date is implied).
- "machine_details": describes a machine itself — its name, location, or specifications. Fields: machine_no, machine_name, location, specifications (a list of {key, value}).
- "clarify": the sentence could plausibly be either of the above, or a required field is unclear. Set clarifyQuestion to a single short question.
- "unsupported": the sentence is not about machines at all.

Set confidence between 0 and 1 for how sure you are of the intent. Never invent a machine number, date, or detail that the sentence does not support — leave it out instead.`;

const callOllama = async (message) => {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) throw new Error("OLLAMA_API_KEY is not configured");

  const today = new Date().toISOString().slice(0, 10);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: RESPONSE_SCHEMA,
        messages: [
          { role: "system", content: systemPrompt(today) },
          { role: "user", content: message },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const body = await response.json();
    return JSON.parse(body?.message?.content ?? "null");
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { callOllama };
```

- [ ] **Step 2: Write the controller**

Create `/Volumes/MACEXSTORAGE/data-api/controllers/agentController.js`:

```js
const { callOllama } = require("../utils/ollama.js");
const { normalizeInterpretation } = require("../utils/agentInterpreter.js");

const agentController = async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ message: "message is required" });
  }

  try {
    const raw = await callOllama(message);
    return res.status(200).json(normalizeInterpretation(raw));
  } catch (error) {
    console.error("Agent interpret failed:", error.message);
    return res.status(502).json({ message: "Could not interpret the message" });
  }
};

module.exports = agentController;
```

Note the `JSON.parse` in `ollama.js` throws on malformed model output, which lands here as a
502 — that is the "malformed JSON" row of the spec's error table, handled by construction.

- [ ] **Step 3: Write the router**

Create `/Volumes/MACEXSTORAGE/data-api/Router/AgentRouter.js`:

```js
var express = require("express");
var router = express.Router();
const agentController = require("../controllers/agentController.js");

router.post("/interpret", agentController);

module.exports = router;
```

- [ ] **Step 4: Mount the route**

In `/Volumes/MACEXSTORAGE/data-api/index.js`, after line 19
(`const machineDetailsRoute = require('./Router/MachineDetailsRouter.js')`), add:

```js
const agentRoute = require('./Router/AgentRouter.js')
```

Then after line 46 (`app.use('/api/machine-details', machineDetailsRoute)`), add:

```js
app.use('/api/agent', agentRoute)
```

The mount must come before the `app.get('*', ...)` SPA fallback — adding it next to the other
`app.use` route mounts satisfies this.

- [ ] **Step 5: Configure credentials locally**

Add to `/Volumes/MACEXSTORAGE/data-api/.env` (gitignored — verify with `git status` that it does
not appear as a change):

```
OLLAMA_API_KEY=<your ollama cloud key>
OLLAMA_MODEL=gpt-oss:120b-cloud
```

- [ ] **Step 6: Verify the endpoint end-to-end against the real API**

Start the backend:

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm start
```

In a second terminal, send a breakdown sentence:

```bash
curl -s -X POST http://localhost:5000/api/agent/interpret -H 'Content-Type: application/json' -d '{"message":"machine 251 had a spindle motor failure today"}'
```

Expected: `intent` is `"breakdown"`, `fields.mcdata` is `"251"`, `fields.bgdetail` mentions the
spindle motor, `fields.bgdate` is today's date. (If the port differs, use the `PORT` value from
`.env` — `index.js` reads `process.env.PORT`.)

Then check the empty-message guard:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5000/api/agent/interpret -H 'Content-Type: application/json' -d '{"message":"   "}'
```

Expected: `400`.

- [ ] **Step 7: Verify tests still pass, then commit**

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm test
```

Expected: PASS — the 10 tests from Task 1.

```bash
cd /Volumes/MACEXSTORAGE/data-api && git status
```

Expected: `.env` is NOT listed. If it is, stop and fix `.gitignore` before continuing.

```bash
cd /Volumes/MACEXSTORAGE/data-api && git add utils/ollama.js controllers/agentController.js Router/AgentRouter.js index.js && git commit -m "feat: add POST /api/agent/interpret backed by Ollama Cloud

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — pure agent client module

All the branching the UI needs, in a React-free module so it is testable in the codebase's
existing pure-vitest style.

**Files:**
- Create: `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentClient.js`
- Create: `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentClient.test.js`

**Interfaces:**
- Consumes: the response shape produced by Task 2.
- Produces:
  - `buildSavePayload(interpretation)` → `{ path, payload }` or `null`. `path` is
    `"/api/submit-form"` or `"/api/machine-details"`; `payload` is the exact body the existing
    endpoints already accept. Returns `null` for `clarify`/`unsupported`.
  - `canSave(interpretation)` → boolean
  - `agentReplyText(interpretation)` → string (the chat bubble text for non-card intents)
  - `UNSUPPORTED_TEXT` (string)

- [ ] **Step 1: Write the failing test**

Create `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentClient.test.js`:

```js
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && npx vitest run src/lib/agentClient.test.js
```

Expected: FAIL — `Failed to resolve import "./agentClient"`.

- [ ] **Step 3: Write the implementation**

Create `/Volumes/MACEXSTORAGE/bg-data/src/lib/agentClient.js`:

```js
export const UNSUPPORTED_TEXT =
  "I can only record breakdown reports and machine details right now. Try describing a machine fault, or a machine's name, location, and specifications.";

const REQUIRED = {
  breakdown: ["mcdata", "bgdetail"],
  machine_details: ["machine_no"],
};

const filled = (value) => typeof value === "string" && value.trim() !== "";

export const buildSavePayload = (interpretation) => {
  const { intent, fields } = interpretation;

  if (intent === "breakdown") {
    return {
      path: "/api/submit-form",
      payload: {
        mcdata: fields.mcdata,
        bgdetail: fields.bgdetail,
        bgdate: fields.bgdate,
      },
    };
  }

  if (intent === "machine_details") {
    return {
      path: "/api/machine-details",
      payload: {
        machine_no: fields.machine_no,
        machine_name: fields.machine_name,
        location: fields.location,
        specifications: fields.specifications ?? [],
      },
    };
  }

  return null;
};

export const canSave = (interpretation) => {
  const required = REQUIRED[interpretation.intent];
  if (!required) return false;
  return required.every((name) => filled(interpretation.fields[name]));
};

export const agentReplyText = (interpretation) => {
  if (interpretation.intent === "clarify") return interpretation.clarifyQuestion;
  if (interpretation.intent === "unsupported") return UNSUPPORTED_TEXT;
  return "";
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && npx vitest run src/lib/agentClient.test.js
```

Expected: PASS — 12 tests passing.

- [ ] **Step 5: Run the whole frontend suite to check for regressions**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && npm test
```

Expected: PASS — the new file plus the pre-existing `s7`, `s7Signals`, and `ncVariables` suites.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git add src/lib/agentClient.js src/lib/agentClient.test.js && git commit -m "feat: add pure agent client helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend — AI Agent chat page, route, and sidebar entry

**Files:**
- Create: `/Volumes/MACEXSTORAGE/bg-data/src/components/AIAgent.jsx`
- Modify: `/Volumes/MACEXSTORAGE/bg-data/src/components/Layout.jsx` (import near line 23, route near line 60)
- Modify: `/Volumes/MACEXSTORAGE/bg-data/src/components/Sidebar.jsx:3` (icon import) and `:18` (links array)

**Interfaces:**
- Consumes: `buildSavePayload`, `canSave`, `agentReplyText` from Task 3; the
  `POST /api/agent/interpret` endpoint from Task 2.
- Produces: the `/agent` route. Nothing later depends on it.

- [ ] **Step 1: Write the component**

Create `/Volumes/MACEXSTORAGE/bg-data/src/components/AIAgent.jsx`:

```jsx
import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Bot, Send, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { buildSavePayload, canSave, agentReplyText } from "../lib/agentClient";
import { cn } from "../lib/utils";

const Bubble = ({ role, children }) => (
  <div className={cn("flex gap-2", role === "user" ? "justify-end" : "justify-start")}>
    {role === "agent" && <Bot className="h-5 w-5 mt-2 shrink-0 text-muted-foreground" />}
    <div
      className={cn(
        "rounded-lg px-3 py-2 max-w-[80%] text-sm",
        role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
      )}
    >
      {children}
    </div>
    {role === "user" && <User className="h-5 w-5 mt-2 shrink-0 text-muted-foreground" />}
  </div>
);

const BreakdownCard = ({ fields, onChange }) => (
  <div className="grid gap-3">
    <div className="grid gap-1">
      <label className="text-sm font-medium">Machine No</label>
      <Input
        value={fields.mcdata}
        onChange={(e) => onChange({ ...fields, mcdata: e.target.value })}
        className={cn(!fields.mcdata.trim() && "border-destructive")}
      />
    </div>
    <div className="grid gap-1">
      <label className="text-sm font-medium">Breakdown Detail</label>
      <Textarea
        rows="3"
        value={fields.bgdetail}
        onChange={(e) => onChange({ ...fields, bgdetail: e.target.value })}
        className={cn(!fields.bgdetail.trim() && "border-destructive")}
      />
    </div>
    <div className="grid gap-1">
      <label className="text-sm font-medium">Breakdown Date</label>
      <Input
        type="date"
        value={fields.bgdate ?? ""}
        onChange={(e) => onChange({ ...fields, bgdate: e.target.value || null })}
      />
    </div>
  </div>
);

const MachineDetailsCard = ({ fields, onChange }) => (
  <div className="grid gap-3">
    <div className="grid gap-1">
      <label className="text-sm font-medium">Machine No</label>
      <Input
        value={fields.machine_no}
        onChange={(e) => onChange({ ...fields, machine_no: e.target.value })}
        className={cn(!fields.machine_no.trim() && "border-destructive")}
      />
    </div>
    <div className="grid gap-1">
      <label className="text-sm font-medium">Machine Name</label>
      <Input
        value={fields.machine_name}
        onChange={(e) => onChange({ ...fields, machine_name: e.target.value })}
      />
    </div>
    <div className="grid gap-1">
      <label className="text-sm font-medium">Location</label>
      <Input
        value={fields.location}
        onChange={(e) => onChange({ ...fields, location: e.target.value })}
      />
    </div>
    {fields.specifications.length > 0 && (
      <div className="grid gap-2">
        <span className="text-sm font-medium">Specifications</span>
        {fields.specifications.map((spec, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={spec.key}
              onChange={(e) => {
                const next = [...fields.specifications];
                next[i] = { ...next[i], key: e.target.value };
                onChange({ ...fields, specifications: next });
              }}
            />
            <Input
              value={spec.value}
              onChange={(e) => {
                const next = [...fields.specifications];
                next[i] = { ...next[i], value: e.target.value };
                onChange({ ...fields, specifications: next });
              }}
            />
          </div>
        ))}
      </div>
    )}
  </div>
);

const AIAgent = () => {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const append = (entry) => setMessages((prev) => [...prev, entry]);

  const updateCard = (index, fields) =>
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, interpretation: { ...m.interpretation, fields } } : m
      )
    );

  const resolveCard = (index, savedText) =>
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { role: "agent", text: savedText } : m))
    );

  const handleSend = async (e) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;

    append({ role: "user", text: message });
    setDraft("");
    setPending(true);

    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/agent/interpret`, {
        message,
      });
      const reply = agentReplyText(data);
      append(reply ? { role: "agent", text: reply } : { role: "card", interpretation: data });
    } catch (error) {
      console.error("Agent interpret failed:", error);
      toast.error("AI agent is unavailable — use the Record Data or Machine Details form instead.");
    } finally {
      setPending(false);
    }
  };

  const handleSave = async (index, interpretation) => {
    const { path, payload } = buildSavePayload(interpretation);
    const promise = axios.post(`${import.meta.env.VITE_API_URL}${path}`, payload);

    toast.promise(promise, {
      loading: "Saving...",
      success: "Saved to database",
      error: "Failed to save",
    });

    try {
      await promise;
      resolveCard(index, "Saved to the database.");
    } catch (error) {
      console.error("Agent save failed:", error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">AI Agent</CardTitle>
          <CardDescription>
            Describe a breakdown or a machine in plain language. You confirm the details before
            anything is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 min-h-[16rem]">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                For example: "machine 251 had a spindle motor failure today"
              </p>
            )}
            {messages.map((m, i) =>
              m.role === "card" ? (
                <div key={i} className="border rounded-lg p-4 grid gap-4">
                  <span className="text-sm font-medium">
                    {m.interpretation.intent === "breakdown"
                      ? "Breakdown report"
                      : "Machine details"}
                  </span>
                  {m.interpretation.intent === "breakdown" ? (
                    <BreakdownCard
                      fields={m.interpretation.fields}
                      onChange={(fields) => updateCard(i, fields)}
                    />
                  ) : (
                    <MachineDetailsCard
                      fields={m.interpretation.fields}
                      onChange={(fields) => updateCard(i, fields)}
                    />
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => resolveCard(i, "Discarded — nothing was saved.")}
                    >
                      Discard
                    </Button>
                    <Button
                      disabled={!canSave(m.interpretation)}
                      onClick={() => handleSave(i, m.interpretation)}
                    >
                      Confirm &amp; Save
                    </Button>
                  </div>
                </div>
              ) : (
                <Bubble key={i} role={m.role}>
                  {m.text}
                </Bubble>
              )
            )}
            {pending && <Bubble role="agent">Thinking...</Bubble>}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe what happened..."
              disabled={pending}
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAgent;
```

- [ ] **Step 2: Register the route**

In `/Volumes/MACEXSTORAGE/bg-data/src/components/Layout.jsx`, after line 23
(`import S7Converter from "./S7Converter";`) add:

```jsx
import AIAgent from "./AIAgent";
```

Then after line 60 (the `/knowledge/s7-converter` route) add:

```jsx
                <Route path='/agent' element={<AIAgent />} />
```

- [ ] **Step 3: Add the sidebar entry**

In `/Volumes/MACEXSTORAGE/bg-data/src/components/Sidebar.jsx`, change the icon import on line 3 to
include `Bot`:

```jsx
import { LayoutDashboard, Database, Edit, HardDrive, Search, Settings, Calculator, Brain, Bot } from "lucide-react"
```

Then add a final entry to the `links` array, after the Knowledge line:

```jsx
    { name: "AI Agent", path: "/agent", icon: Bot },
```

- [ ] **Step 4: Verify the full test suite still passes**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && npm test
```

Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git add src/components/AIAgent.jsx src/components/Layout.jsx src/components/Sidebar.jsx && git commit -m "feat: add AI Agent chat page for natural-language data entry

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification in the browser

No code changes — this task proves the two repos work together, and is the gate before the
feature is called done.

**Files:** none modified.

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: nothing.

- [ ] **Step 1: Point the frontend at the local backend**

The frontend's `.env` currently reads `VITE_API_URL=https://data-api-d6lk.onrender.com`, which does
**not** have the new endpoint deployed. For local verification, temporarily change
`/Volumes/MACEXSTORAGE/bg-data/.env` to:

```
VITE_API_URL=http://localhost:5000
```

Use the `PORT` from `data-api/.env` if it is not 5000. Revert this file before committing anything
— it is tracked, and pointing it at localhost would break the deployed frontend.

- [ ] **Step 2: Start both servers**

Backend:

```bash
cd /Volumes/MACEXSTORAGE/data-api && npm start
```

Frontend — use the preview tooling, not a raw shell command, per this project's setup
(`.claude/launch.json` defines the `dev` config on port 3000).

- [ ] **Step 3: Verify the golden path**

In the browser at `http://localhost:3000`: log in, click **AI Agent** in the sidebar, and send:

> machine 251 had a spindle motor failure today

Expected: a "Breakdown report" card appears, pre-filled with machine no `251`, a detail mentioning
the spindle motor, and today's date. Click **Confirm & Save**. Expected: a success toast, and the
card is replaced by "Saved to the database."

Then click **Breakdown Data** in the sidebar. Expected: the new row appears at the top of the table.

- [ ] **Step 4: Verify the clarify path**

Send an ambiguous message:

> 251

Expected: a plain chat bubble asking a clarifying question — no card, nothing saved.

- [ ] **Step 5: Verify the unsupported path**

Send:

> what is the weather today

Expected: the agent replies that it only handles breakdown reports and machine details.

- [ ] **Step 6: Verify the blocked-save path**

Send a breakdown sentence, then clear the Machine No field on the card. Expected: the field shows a
red border and **Confirm & Save** is disabled.

- [ ] **Step 7: Verify the backend-down path**

Stop the backend (Ctrl-C), then send any message. Expected: an error toast pointing at the manual
forms. Restart the backend afterward.

- [ ] **Step 8: Check the browser console**

Expected: no uncaught errors beyond the deliberate axios failures logged in step 7.

- [ ] **Step 9: Restore the frontend .env**

```bash
cd /Volumes/MACEXSTORAGE/bg-data && git checkout .env && git status
```

Expected: clean working tree in `bg-data`.

---

## Deployment note (not a task)

The frontend calls `/api/agent/interpret` on whatever `VITE_API_URL` points to. Until `data-api` is
pushed and redeployed on Render **with `OLLAMA_API_KEY` and `OLLAMA_MODEL` set in Render's
environment**, the AI Agent page will show its "unavailable" toast in production while the rest of
the app keeps working. Deploy the backend first, then the frontend.

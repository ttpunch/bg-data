import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Check, CircleSlash, CornerDownLeft, Cpu, Terminal } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  buildSavePayload,
  canSave,
  agentReplyText,
  isRequiredFieldMissing,
  UNSUPPORTED_TEXT,
} from "../lib/agentClient";
import {
  buildUpdateRequest,
  buildDeleteRequest,
  diffFields,
  formatRecordDate,
  canConfirmProposal,
  isValidProposal,
  isValidRecordsPayload,
  looksLikeLookup,
} from "../lib/agentActions";
import { cn } from "../lib/utils";

const MONO = "font-mono-tech";

const clockTime = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const EXAMPLES = [
  "machine 251 had a spindle motor failure today",
  "2-512 tailstock hydraulic pressure dropped yesterday",
  "machine 2-900 is a Skoda borer in bay 4, spindle speed 3000 RPM",
];

/** Small uppercase mono caption used for every field label on a ticket. */
const FieldLabel = ({ htmlFor, children, required }) => (
  <label
    htmlFor={htmlFor}
    className={cn(MONO, "text-[10px] uppercase tracking-[0.14em] text-muted-foreground")}
  >
    {children}
    {required && <span className="text-destructive"> *</span>}
  </label>
);

const Bubble = ({ role, at, children }) => {
  const isUser = role === "user";
  return (
    <div className={cn("agent-enter flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-1", isUser && "items-end")}>
        <div
          className={cn(
            MONO,
            "text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
            isUser && "text-right"
          )}
        >
          {isUser ? "You" : "Agent"} · {at}
        </div>
        <div
          className={cn(
            "px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-foreground text-background rounded-lg rounded-br-sm"
              : "bg-muted/70 border border-border/60 rounded-lg rounded-bl-sm"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

/** Terminal-style status line replacing a resolved ticket. */
const StatusLine = ({ text, tone, at }) => {
  const committed = tone === "committed";
  return (
    <div
      className={cn(
        "agent-enter flex items-center gap-2.5 border px-3 py-2.5 rounded-lg",
        committed
          ? "border-[hsl(var(--signal-committed))]/40 bg-[hsl(var(--signal-committed))]/[0.07]"
          : "border-border bg-muted/40"
      )}
    >
      {committed ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--signal-committed))]" />
      ) : (
        <CircleSlash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cn(
          MONO,
          "text-[11px] uppercase tracking-[0.12em]",
          committed ? "text-[hsl(var(--signal-committed))]" : "text-muted-foreground"
        )}
      >
        {text}
      </span>
      <span className={cn(MONO, "ml-auto text-[10px] text-muted-foreground")}>{at}</span>
    </div>
  );
};

const BreakdownCard = ({ fields, onChange, index, disabled }) => (
  <div className="grid gap-3.5">
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={`breakdown-mcdata-${index}`} required>
        Machine No
      </FieldLabel>
      <Input
        id={`breakdown-mcdata-${index}`}
        value={fields.mcdata}
        onChange={(e) => onChange({ ...fields, mcdata: e.target.value })}
        disabled={disabled}
        className={cn(
          MONO,
          "font-medium",
          isRequiredFieldMissing("breakdown", "mcdata", fields) && "border-destructive"
        )}
      />
    </div>
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={`breakdown-bgdetail-${index}`} required>
        Fault Detail
      </FieldLabel>
      <Textarea
        id={`breakdown-bgdetail-${index}`}
        rows="3"
        value={fields.bgdetail}
        onChange={(e) => onChange({ ...fields, bgdetail: e.target.value })}
        disabled={disabled}
        className={cn(
          "leading-relaxed resize-none",
          isRequiredFieldMissing("breakdown", "bgdetail", fields) && "border-destructive"
        )}
      />
    </div>
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={`breakdown-bgdate-${index}`}>Date of Breakdown</FieldLabel>
      <Input
        id={`breakdown-bgdate-${index}`}
        type="date"
        value={fields.bgdate ?? ""}
        onChange={(e) => onChange({ ...fields, bgdate: e.target.value || null })}
        disabled={disabled}
        className={cn(MONO, "w-fit")}
      />
    </div>
  </div>
);

const MachineDetailsCard = ({ fields, onChange, index, disabled }) => {
  const specs = fields.specifications ?? [];
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`machine-no-${index}`} required>
            Machine No
          </FieldLabel>
          <Input
            id={`machine-no-${index}`}
            value={fields.machine_no}
            onChange={(e) => onChange({ ...fields, machine_no: e.target.value })}
            disabled={disabled}
            className={cn(
              MONO,
              "font-medium",
              isRequiredFieldMissing("machine_details", "machine_no", fields) &&
                "border-destructive"
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <FieldLabel htmlFor={`machine-location-${index}`}>Location</FieldLabel>
          <Input
            id={`machine-location-${index}`}
            value={fields.location}
            onChange={(e) => onChange({ ...fields, location: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor={`machine-name-${index}`}>Machine Name</FieldLabel>
        <Input
          id={`machine-name-${index}`}
          value={fields.machine_name}
          onChange={(e) => onChange({ ...fields, machine_name: e.target.value })}
          disabled={disabled}
        />
      </div>
      {specs.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <FieldLabel>Specifications</FieldLabel>
            <span className={cn(MONO, "text-[10px] text-muted-foreground")}>
              {specs.length}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {specs.map((spec, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label={`Specification ${i + 1} name`}
                value={spec.key}
                onChange={(e) => {
                  const next = [...specs];
                  next[i] = { ...next[i], key: e.target.value };
                  onChange({ ...fields, specifications: next });
                }}
                disabled={disabled}
                className="flex-1"
              />
              <Input
                aria-label={`Specification ${i + 1} value`}
                value={spec.value}
                onChange={(e) => {
                  const next = [...specs];
                  next[i] = { ...next[i], value: e.target.value };
                  onChange({ ...fields, specifications: next });
                }}
                disabled={disabled}
                className={cn(MONO, "flex-1")}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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

const ProposalCard = ({ proposal, saving, onConfirm, onDiscard }) => {
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

const AIAgent = () => {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [savingIndices, setSavingIndices] = useState(() => new Set());
  const logEndRef = useRef(null);
  const inputRef = useRef(null);

  const isSaving = (index) => savingIndices.has(index);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const append = (entry) => setMessages((prev) => [...prev, { at: clockTime(), ...entry }]);

  const updateCard = (index, fields) =>
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, interpretation: { ...m.interpretation, fields } } : m
      )
    );

  const resolveCard = (index, text, tone) =>
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { role: "status", text, tone, at: clockTime() } : m))
    );

  const useExample = (text) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;

    append({ role: "user", text: message });
    setDraft("");
    setPending(true);

    const endpoint = looksLikeLookup(message) ? "/api/agent/act" : "/api/agent/interpret";

    try {
      const { data } = await axios.post(`${import.meta.env.VITE_API_URL}${endpoint}`, { message });

      if (endpoint === "/api/agent/act") {
        if (data?.kind === "records") {
          if (isValidRecordsPayload(data)) {
            append({ role: "records", machine_no: data.machine_no, records: data.records });
          } else {
            append({ role: "status", text: "Malformed response — nothing was changed", tone: "discarded" });
          }
        } else if (data?.kind === "propose_update" || data?.kind === "propose_delete") {
          if (isValidProposal(data)) {
            append({ role: "proposal", proposal: data });
          } else {
            append({ role: "status", text: "Malformed response — nothing was changed", tone: "discarded" });
          }
        } else {
          append({ role: "agent", text: data?.text || "I could not work that one out." });
        }
      } else {
        // Explicit allow-list rather than an implicit "else render a card":
        // only these two intents carry fields worth reviewing. Everything
        // else (clarify, unsupported, or anything unforeseen) renders as a
        // reply bubble, so a future backend-only change can't make a
        // fields-less response fall through into the card branch and crash.
        const isCard = data?.intent === "breakdown" || data?.intent === "machine_details";
        append(
          isCard
            ? { role: "card", interpretation: data }
            : { role: "agent", text: agentReplyText(data) || UNSUPPORTED_TEXT }
        );
      }
    } catch (error) {
      console.error("Agent interpret failed:", error);
      toast.error(
        endpoint === "/api/agent/act"
          ? "Lookup could not be completed — try again, or use the Breakdown Data page."
          : "AI agent is unavailable — use the Record Data or Machine Details form instead."
      );
    } finally {
      setPending(false);
    }
  };

  const handleSave = async (index, interpretation) => {
    if (isSaving(index)) return;
    setSavingIndices((prev) => new Set(prev).add(index));

    try {
      const { path, payload } = buildSavePayload(interpretation);
      const promise = axios.post(`${import.meta.env.VITE_API_URL}${path}`, payload);

      toast.promise(promise, {
        loading: "Saving...",
        success: "Saved to database",
        error: "Failed to save",
      });

      await promise;
      resolveCard(index, "Committed to database", "committed");
    } catch (error) {
      console.error("Agent save failed:", error);
    } finally {
      setSavingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

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

  return (
    <div className="mx-auto max-w-3xl">
      {/* Terminal chrome */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <header className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className={cn(MONO, "text-sm font-bold tracking-[0.14em] uppercase")}>
              Agent Intake
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Describe a fault or a machine in plain language — you approve every record
              before it is written.
            </p>
          </div>
          <span
            className={cn(
              MONO,
              "ml-auto hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--signal-committed))]" />
            Online
          </span>
        </header>

        {/* Log */}
        <div className="agent-log-grid max-h-[26rem] min-h-[19rem] space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col justify-center gap-4 py-6">
              <div className="flex items-start gap-3">
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Type what happened the way you would say it. The agent extracts the
                  machine number, the detail and the date, then hands them back for your
                  approval.
                </p>
              </div>
              <div className="grid gap-1.5 pl-7">
                <span
                  className={cn(
                    MONO,
                    "text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                  )}
                >
                  Try one
                </span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => useExample(ex)}
                    className="group flex items-start gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground"
                  >
                    <CornerDownLeft className="mt-0.5 h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
                    <span className="leading-relaxed">{ex}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "card") {
              const breakdown = m.interpretation.intent === "breakdown";
              const saving = isSaving(i);
              return (
                <article
                  key={i}
                  className="agent-enter agent-ticket relative overflow-hidden rounded-lg border bg-card pl-4"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3.5 py-2.5">
                    <span
                      className={cn(
                        MONO,
                        "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--signal-pending))]"
                      )}
                    >
                      <span className="agent-beacon h-1.5 w-1.5 rounded-full bg-[hsl(var(--signal-pending))]" />
                      {saving ? "Writing…" : "Awaiting confirmation"}
                    </span>
                    <span
                      className={cn(
                        MONO,
                        "ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                      )}
                    >
                      {breakdown ? "Breakdown Report" : "Machine Record"}
                    </span>
                  </div>

                  <div className="p-3.5">
                    {breakdown ? (
                      <BreakdownCard
                        fields={m.interpretation.fields}
                        onChange={(fields) => updateCard(i, fields)}
                        index={i}
                        disabled={saving}
                      />
                    ) : (
                      <MachineDetailsCard
                        fields={m.interpretation.fields}
                        onChange={(fields) => updateCard(i, fields)}
                        index={i}
                        disabled={saving}
                      />
                    )}

                    <div className="mt-4 border-t border-dashed pt-3 flex items-center gap-2">
                      <span className={cn(MONO, "text-[10px] text-muted-foreground")}>
                        {canSave(m.interpretation)
                          ? "Ready to write"
                          : "Fill the starred fields"}
                      </span>
                      <div className="ml-auto flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => resolveCard(i, "Discarded — nothing saved", "discarded")}
                        >
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canSave(m.interpretation) || saving}
                          onClick={() => handleSave(i, m.interpretation)}
                        >
                          Confirm &amp; Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (m.role === "status") {
              return <StatusLine key={i} text={m.text} tone={m.tone} at={m.at} />;
            }

            if (m.role === "records") {
              return <RecordsTable key={i} machineNo={m.machine_no} records={m.records} />;
            }

            if (m.role === "proposal") {
              return (
                <ProposalCard
                  key={i}
                  proposal={m.proposal}
                  saving={isSaving(i)}
                  onConfirm={() => handleProposal(i, m.proposal)}
                  onDiscard={() => resolveCard(i, "Cancelled — nothing changed", "discarded")}
                />
              );
            }

            return (
              <Bubble key={i} role={m.role} at={m.at}>
                {m.text}
              </Bubble>
            );
          })}

          {pending && (
            <div className="agent-enter flex items-center gap-2.5 text-muted-foreground">
              <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="agent-scan-bar block h-3.5 w-[3px] rounded-sm bg-current"
                    style={{ animationDelay: `${n * 0.15}s` }}
                  />
                ))}
              </span>
              <span className={cn(MONO, "text-[11px] uppercase tracking-[0.14em]")}>
                Interpreting
              </span>
            </div>
          )}
          <div ref={logEndRef} />
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t bg-muted/20 p-3">
          <span className={cn(MONO, "pl-1 text-sm text-muted-foreground")} aria-hidden="true">
            &gt;
          </span>
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Describe what happened…"
            disabled={pending}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="gap-1.5"
          >
            Send
            <CornerDownLeft className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AIAgent;

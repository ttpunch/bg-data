import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Bot, Send, User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import {
  buildSavePayload,
  canSave,
  agentReplyText,
  isRequiredFieldMissing,
  UNSUPPORTED_TEXT,
} from "../lib/agentClient";
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

const BreakdownCard = ({ fields, onChange, index, disabled }) => (
  <div className="grid gap-3">
    <div className="grid gap-1">
      <label htmlFor={`breakdown-mcdata-${index}`} className="text-sm font-medium">
        Machine No
      </label>
      <Input
        id={`breakdown-mcdata-${index}`}
        value={fields.mcdata}
        onChange={(e) => onChange({ ...fields, mcdata: e.target.value })}
        disabled={disabled}
        className={cn(
          isRequiredFieldMissing("breakdown", "mcdata", fields) && "border-destructive"
        )}
      />
    </div>
    <div className="grid gap-1">
      <label htmlFor={`breakdown-bgdetail-${index}`} className="text-sm font-medium">
        Breakdown Detail
      </label>
      <Textarea
        id={`breakdown-bgdetail-${index}`}
        rows="3"
        value={fields.bgdetail}
        onChange={(e) => onChange({ ...fields, bgdetail: e.target.value })}
        disabled={disabled}
        className={cn(
          isRequiredFieldMissing("breakdown", "bgdetail", fields) && "border-destructive"
        )}
      />
    </div>
    <div className="grid gap-1">
      <label htmlFor={`breakdown-bgdate-${index}`} className="text-sm font-medium">
        Breakdown Date
      </label>
      <Input
        id={`breakdown-bgdate-${index}`}
        type="date"
        value={fields.bgdate ?? ""}
        onChange={(e) => onChange({ ...fields, bgdate: e.target.value || null })}
        disabled={disabled}
      />
    </div>
  </div>
);

const MachineDetailsCard = ({ fields, onChange, index, disabled }) => (
  <div className="grid gap-3">
    <div className="grid gap-1">
      <label htmlFor={`machine-no-${index}`} className="text-sm font-medium">
        Machine No
      </label>
      <Input
        id={`machine-no-${index}`}
        value={fields.machine_no}
        onChange={(e) => onChange({ ...fields, machine_no: e.target.value })}
        disabled={disabled}
        className={cn(
          isRequiredFieldMissing("machine_details", "machine_no", fields) && "border-destructive"
        )}
      />
    </div>
    <div className="grid gap-1">
      <label htmlFor={`machine-name-${index}`} className="text-sm font-medium">
        Machine Name
      </label>
      <Input
        id={`machine-name-${index}`}
        value={fields.machine_name}
        onChange={(e) => onChange({ ...fields, machine_name: e.target.value })}
        disabled={disabled}
      />
    </div>
    <div className="grid gap-1">
      <label htmlFor={`machine-location-${index}`} className="text-sm font-medium">
        Location
      </label>
      <Input
        id={`machine-location-${index}`}
        value={fields.location}
        onChange={(e) => onChange({ ...fields, location: e.target.value })}
        disabled={disabled}
      />
    </div>
    {(fields.specifications ?? []).length > 0 && (
      <div className="grid gap-2">
        <span className="text-sm font-medium">Specifications</span>
        {(fields.specifications ?? []).map((spec, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={spec.key}
              onChange={(e) => {
                const next = [...(fields.specifications ?? [])];
                next[i] = { ...next[i], key: e.target.value };
                onChange({ ...fields, specifications: next });
              }}
              disabled={disabled}
            />
            <Input
              value={spec.value}
              onChange={(e) => {
                const next = [...(fields.specifications ?? [])];
                next[i] = { ...next[i], value: e.target.value };
                onChange({ ...fields, specifications: next });
              }}
              disabled={disabled}
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
  const [savingIndices, setSavingIndices] = useState(() => new Set());

  const isSaving = (index) => savingIndices.has(index);

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
    } catch (error) {
      console.error("Agent interpret failed:", error);
      toast.error("AI agent is unavailable — use the Record Data or Machine Details form instead.");
    } finally {
      setPending(false);
    }
  };

  const handleSave = async (index, interpretation) => {
    if (isSaving(index)) return;
    setSavingIndices((prev) => new Set(prev).add(index));

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
    } finally {
      setSavingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
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
                      index={i}
                      disabled={isSaving(i)}
                    />
                  ) : (
                    <MachineDetailsCard
                      fields={m.interpretation.fields}
                      onChange={(fields) => updateCard(i, fields)}
                      index={i}
                      disabled={isSaving(i)}
                    />
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      disabled={isSaving(i)}
                      onClick={() => resolveCard(i, "Discarded — nothing was saved.")}
                    >
                      Discard
                    </Button>
                    <Button
                      disabled={!canSave(m.interpretation) || isSaving(i)}
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
            <Button type="submit" disabled={pending || !draft.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAgent;

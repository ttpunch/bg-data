import React from "react";
import { AlertTriangle } from "lucide-react";

// Mirrors the ErrorBox pattern already used in AlarmCalculator.jsx.
export const ErrorBox = ({ msg }) => (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mt-4">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{msg}</span>
    </div>
);

export const Row = ({ label, value, mono = true, hint }) => (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border/60 last:border-0">
        <span className="text-xs uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
        <span className={`text-sm text-right ${mono ? "font-mono" : ""} tabular-nums break-all`}>
            {value}
            {hint && <span className="ml-2 text-xs text-muted-foreground font-sans">{hint}</span>}
        </span>
    </div>
);

export const TabButton = ({ active, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
    >
        {children}
    </button>
);

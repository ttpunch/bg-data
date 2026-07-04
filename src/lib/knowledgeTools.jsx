import { BookOpenText, Crosshair, Repeat } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════════
//  KNOWLEDGE TOOL REGISTRY
//  Add a new productivity tool here → build the component → route it in Layout.jsx.
//  Each entry renders as a card on the /knowledge dashboard.
// ═══════════════════════════════════════════════════════════════════════════════
export const knowledgeTools = [
    {
        id: "gm-code-guide",
        title: "G-Code & M-Code Guide",
        description: "Quick reference for CNC G-codes and M-codes with search and categories.",
        icon: BookOpenText,
        path: "/knowledge/gm-code-guide",
    },
    {
        id: "gcode-trainer",
        title: "G-Code Trainer & Simulator",
        description: "Interactive toolpath simulator with live visualization, plus Fanuc vs Siemens dialect comparison.",
        icon: Crosshair,
        path: "/knowledge/gcode-trainer",
    },
    {
        id: "code-converter",
        title: "Siemens ↔ Fanuc Converter",
        description: "Translate part programs between Siemens and Fanuc dialects, with manual-review flags for cycles and macros.",
        icon: Repeat,
        path: "/knowledge/code-converter",
    },
];

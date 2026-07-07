import { BookOpenText, Crosshair, Repeat, Zap } from "lucide-react";

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
    {
        id: "dc-motor-drive",
        title: "DC Motor & DC Drive",
        description: "How a DC motor works, an interactive motor playground, the drive's speed-control envelope (armature voltage, base/full speed, flux, field weakening), plus ABB DCS880 & Siemens 6RA80 commissioning parameters.",
        icon: Zap,
        path: "/knowledge/dc-motor-drive",
    },
];

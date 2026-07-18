import React, { useState } from "react";
import { Card, CardHeader, CardContent } from "./ui/card";
import { Binary } from "lucide-react";
import { isErr, parseNumber } from "../lib/s7";
import { TabButton } from "./s7/Shared";
import NumberTab from "./s7/NumberTab";
import AddressTab from "./s7/AddressTab";
import PointerTab from "./s7/PointerTab";
import SignalTab from "./s7/SignalTab";
import RealTimeTab from "./s7/RealTimeTab";
import NcVarTab from "./s7/NcVarTab";

const TABS = [
    { id: "number", label: "Number" },
    { id: "address", label: "Address" },
    { id: "pointer", label: "Pointer" },
    { id: "signal", label: "Signal" },
    { id: "realtime", label: "REAL / Time" },
    { id: "ncvars", label: "NC Variables" },
];

const S7Converter = () => {
    const [tab, setTab] = useState("number");
    const [raw, setRaw] = useState("16#FF");
    const [value, setValue] = useState(255);
    const [widthBytes, setWidthBytes] = useState(2);
    const [error, setError] = useState("");

    // Typing drives the shared value. A partial entry is a neutral state, not an error.
    const onRawChange = (next) => {
        setRaw(next);
        if (next.trim() === "") {
            setError("");
            return;
        }
        const parsed = parseNumber(next);
        if (isErr(parsed)) {
            setError(parsed.error);
        } else {
            setError("");
            setValue(parsed.value);
        }
    };

    // Bit-grid clicks write back to the raw field so the two never disagree.
    const onValueChange = (next) => {
        setValue(next);
        setRaw("16#" + next.toString(16).toUpperCase());
        setError("");
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Binary className="h-6 w-6 text-primary" />
                    Siemens PLC Data &amp; Address Converter
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Numbers, DB addresses, pointers and interface signals for SINUMERIK PLCs.
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap gap-1">
                        {TABS.map((t) => (
                            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                                {t.label}
                            </TabButton>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    {tab === "number" && (
                        <NumberTab
                            value={value}
                            widthBytes={widthBytes}
                            raw={raw}
                            error={error}
                            onRawChange={onRawChange}
                            onValueChange={onValueChange}
                            onWidthChange={setWidthBytes}
                        />
                    )}
                    {tab === "address" && <AddressTab value={value} />}
                    {tab === "pointer" && <PointerTab />}
                    {tab === "signal" && <SignalTab />}
                    {tab === "realtime" && <RealTimeTab />}
                    {tab === "ncvars" && <NcVarTab />}
                </CardContent>
            </Card>
        </div>
    );
};

export default S7Converter;

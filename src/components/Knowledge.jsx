import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Input } from "./ui/input";
import { Brain, Search, ArrowRight } from "lucide-react";
import { knowledgeTools } from "../lib/knowledgeTools";

const Knowledge = () => {
    const [query, setQuery] = useState("");

    const filteredTools = knowledgeTools.filter((tool) =>
        `${tool.title} ${tool.description}`.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <div className="max-w-5xl mx-auto space-y-6 mt-6 px-4 pb-12">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Brain className="h-6 w-6 text-primary" />
                    Knowledge
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Small productivity tools and reference guides, built up over time.
                </p>
            </div>

            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search tools..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                />
            </div>

            {filteredTools.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tools match "{query}".</p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredTools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                            <Link key={tool.id} to={tool.path}>
                                <Card className="h-full shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/40 group">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                                        </div>
                                        <CardTitle className="text-base mt-2">{tool.title}</CardTitle>
                                        <CardDescription>{tool.description}</CardDescription>
                                    </CardHeader>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Knowledge;

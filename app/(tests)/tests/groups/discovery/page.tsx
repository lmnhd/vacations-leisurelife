"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Campaign } from '@/lib/campaigns/types';

export default function DiscoveryTestPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [blueprints, setBlueprints] = useState<Campaign[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);
        setBlueprints([]);

        try {
            const res = await fetch('/api/groups/discovery');
            const data = await res.json();

            if (data.success && data.blueprints) {
                setBlueprints(data.blueprints);
            } else {
                setError(data.error || 'Failed to fetch blueprints');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container mx-auto py-10 max-w-7xl">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Group Campaign Discovery</h1>
                    <p className="text-muted-foreground mt-2">
                        Execute the Sonar Deep Research pipeline to generate 5 vetted Theme Cruise Blueprints.
                    </p>
                </div>
                <Button onClick={handleGenerate} disabled={isLoading} size="lg">
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Researching... (Takes ~2-3 mins)
                        </>
                    ) : (
                        "Generate Blueprints"
                    )}
                </Button>
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive p-4 rounded-md mb-8">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {blueprints.map((blueprint, index) => (
                    <Card key={blueprint.id || index} className="flex flex-col">
                        <CardHeader>
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant="secondary" className="mb-2">
                                    {blueprint.aesthetic}
                                </Badge>
                                {blueprint.startingPrice && (
                                    <Badge variant="outline" className="font-mono">
                                        ${blueprint.startingPrice}
                                    </Badge>
                                )}
                            </div>
                            <CardTitle className="text-xl">{blueprint.name}</CardTitle>
                            <CardDescription>{blueprint.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col gap-4">
                            <div className="text-sm">
                                <span className="font-semibold block mb-1">Target Dates:</span>
                                {blueprint.targetDates}
                            </div>
                            <div className="text-sm">
                                <span className="font-semibold block mb-1">Target Ship/Line:</span>
                                {blueprint.shipTarget || 'N/A'}
                            </div>
                            <div className="text-sm flex-1">
                                <span className="font-semibold block mb-1">Highlights:</span>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                    {blueprint.highlightEvents?.map((event, i) => (
                                        <li key={i}>{event}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="flex gap-2 flex-wrap pt-4 mt-auto border-t">
                                {blueprint.targetingKeywords?.map((keyword, i) => (
                                    <Badge key={i} variant="outline" className="text-xs text-muted-foreground">
                                        {keyword}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {!isLoading && blueprints.length === 0 && !error && (
                <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
                    Click "Generate Blueprints" to begin the deep research process.
                </div>
            )}
        </div>
    );
}

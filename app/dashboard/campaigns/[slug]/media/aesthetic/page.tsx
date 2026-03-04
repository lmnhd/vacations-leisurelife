"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Palette, Wand2, CheckCircle2 } from "lucide-react";
import { CampaignAestheticBrief } from "@/lib/campaigns/schema";

export default function AestheticReviewPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;

    const [loading, setLoading] = useState(true);
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [approving, setApproving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchBrief();
    }, [slug]);

    const fetchBrief = async () => {
        setLoading(true);
        // Note: For a comprehensive UI, we would typically have a GET endpoint 
        // to retrieve the brief for review without regenerating. 
        // Assuming we need to add GET to the route.ts to fetch existing.
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/aesthetic`);
            if (res.status === 404) {
                setBrief(null);
            } else if (res.ok) {
                const data = await res.json();
                setBrief(data);
            } else {
                throw new Error("Failed to load brief");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!brief) return;
        setApproving(true);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/aesthetic/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(brief)
            });

            if (!res.ok) throw new Error("Approval failed");

            const data = await res.json();
            setBrief(data.brief);

            // Redirect back to campaign overview or refresh
            router.refresh();

        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setApproving(false);
        }
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/aesthetic`, {
                method: "POST"
            });
            if (!res.ok) throw new Error("Generation failed");
            const data = await res.json();
            setBrief(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!brief) {
        return (
            <div className="container mx-auto p-8 max-w-3xl text-center space-y-6">
                <Palette className="h-16 w-16 mx-auto text-muted-foreground" />
                <h1 className="text-3xl font-bold">No Aesthetic Brief Found</h1>
                <p className="text-muted-foreground">This campaign does not have a generated creative identity yet.</p>
                <Button onClick={handleGenerate} size="lg">
                    <Wand2 className="mr-2 h-5 w-5" />
                    Generate Identity Now
                </Button>
                {error && <p className="text-red-500">{error}</p>}
            </div>
        );
    }

    return (
        <div className="container mx-auto p-8 max-w-5xl space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold">Creative Identity Review</h1>
                        {brief.humanReviewStatus === 'approved' ? (
                            <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</Badge>
                        ) : (
                            <Badge variant="secondary">Pending Review</Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">Review the AI-generated aesthetic brief for <strong>{brief.themeName}</strong>.</p>
                </div>

                {brief.humanReviewStatus !== 'approved' && (
                    <Button onClick={handleApprove} disabled={approving} size="lg">
                        {approving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Approve & Lock Identity
                    </Button>
                )}
            </div>

            {error && <div className="p-4 bg-red-50 text-red-600 rounded-md">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Visual Palette</CardTitle>
                        <CardDescription>{brief.visual.aestheticLabel}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2 h-16 rounded-md overflow-hidden">
                            <div className="flex-1" style={{ backgroundColor: brief.visual.colorPalette.primary }} />
                            <div className="flex-1" style={{ backgroundColor: brief.visual.colorPalette.secondary }} />
                            <div className="flex-1" style={{ backgroundColor: brief.visual.colorPalette.accent }} />
                            <div className="flex-1" style={{ backgroundColor: brief.visual.colorPalette.background }} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Mood</p>
                            <p className="text-sm text-muted-foreground">{brief.visual.imageryMood}</p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Lighting & Composition</p>
                            <p className="text-sm text-muted-foreground">{brief.visual.lightingStyle} — {brief.visual.compositionNotes}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Core Messaging</CardTitle>
                        <CardDescription>Hero & Slogans</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm font-semibold">Hero Slogan</p>
                            <h2 className="text-2xl font-serif text-primary mt-1">{brief.messaging.heroSlogan}</h2>
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Sub Slogan</p>
                            <p className="text-lg text-muted-foreground">{brief.messaging.subSlogan}</p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Elevator Pitch</p>
                            <p className="text-sm text-muted-foreground">{brief.messaging.elevatorPitch}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Raw Generated Output</CardTitle>
                    <CardDescription>Full structured JSON data from AI pipelines</CardDescription>
                </CardHeader>
                <CardContent>
                    <pre className="p-4 bg-muted rounded-md overflow-x-auto text-xs">
                        {JSON.stringify(brief, null, 2)}
                    </pre>
                </CardContent>
            </Card>

        </div>
    );
}

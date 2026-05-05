import type { LandingStorySection } from '@/lib/campaigns/landing/view-model';
import { alfa_slab_one, orbitron } from '@/lib/fonts';

type SystemKey =
    | 'system_1_editorial'
    | 'system_2_nostalgia'
    | 'system_3_zine'
    | 'system_4_modular';

interface SystemTheme {
    rule: string;
    pageText: string;
    softText: string;
    eyebrowFont: string;
    headingFont: string;
    surface: string;
}

function ItineraryEditorial({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <ol className={`divide-y ${theme.rule} border-y ${theme.rule}`}>
            {steps.map((step, i) => (
                <li key={step.title} className="grid gap-6 py-6 md:grid-cols-[5rem_1fr_2fr]">
                    <span className={`${alfa_slab_one.className} text-5xl leading-none`} style={{ color: accentHex }}>{String(i + 1).padStart(2, '0')}</span>
                    <h3 className={`font-serif text-xl italic ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</h3>
                    <p className={`text-base leading-7 ${theme.softText}`}>{step.body}</p>
                </li>
            ))}
        </ol>
    );
}

function ItineraryNostalgia({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-5">
            {steps.map((step, i) => (
                <div key={step.title} className="relative grid gap-4 border border-dashed border-amber-900/40 bg-[#fff8e8] p-5 shadow-[0_14px_36px_rgba(120,73,24,0.14)] md:grid-cols-[7rem_1fr]">
                    <div className="border-r border-dashed border-amber-900/30 pr-4">
                        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-900/60">Stamp {i + 1}</p>
                        <p className={`${alfa_slab_one.className} mt-2 text-3xl`} style={{ color: accentHex }}>№{i + 1}</p>
                    </div>
                    <div>
                        <p className={`font-serif text-xl italic ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</p>
                        <p className={`mt-2 text-sm leading-7 ${theme.softText}`}>{step.body}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ItineraryZine({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="border-2 border-zinc-950 bg-[#fff9e8] shadow-[8px_8px_0_rgba(0,0,0,0.85)]">
            <div className="border-b-2 border-zinc-950 bg-zinc-950 px-5 py-3">
                <p className={`${orbitron.className} text-sm font-black uppercase tracking-[0.32em] text-[#fff9e8]`}>SIDE B — TRACKLIST</p>
            </div>
            <ol className="divide-y-2 divide-dashed divide-zinc-950/30">
                {steps.map((step, i) => (
                    <li key={step.title} className="grid gap-2 px-5 py-4 md:grid-cols-[3.5rem_1fr]">
                        <span className={`${orbitron.className} text-3xl font-black`} style={{ color: accentHex }}>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                            <p className={`${orbitron.className} text-base font-black uppercase tracking-tight ${theme.pageText}`}>
                                {step.title.replace(/^\d+\.\s*/, '')}
                            </p>
                            <p className={`mt-1 text-sm leading-6 ${theme.softText}`}>{step.body}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function ItineraryModular({ steps, theme, accentHex }: { steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    return (
        <div className="grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => (
                <div key={step.title} className={`${theme.surface} relative p-6`}>
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/45">Step {String(i + 1).padStart(2, '0')}</span>
                        <span className="block h-1 w-8" style={{ backgroundColor: accentHex }} />
                    </div>
                    <h3 className={`mt-5 text-xl font-bold ${theme.pageText}`}>{step.title.replace(/^\d+\.\s*/, '')}</h3>
                    <p className={`mt-3 text-sm leading-7 ${theme.softText}`}>{step.body}</p>
                </div>
            ))}
        </div>
    );
}

export function Itinerary({ system, steps, theme, accentHex }: { system: SystemKey; steps: LandingStorySection[]; theme: SystemTheme; accentHex: string }) {
    if (system === 'system_1_editorial') return <ItineraryEditorial steps={steps} theme={theme} accentHex={accentHex} />;
    if (system === 'system_2_nostalgia') return <ItineraryNostalgia steps={steps} theme={theme} accentHex={accentHex} />;
    if (system === 'system_3_zine') return <ItineraryZine steps={steps} theme={theme} accentHex={accentHex} />;
    return <ItineraryModular steps={steps} theme={theme} accentHex={accentHex} />;
}

import Link from 'next/link';
import { LandingNavbar } from '@/components/landing-navbar';
import { prompt, alfa_slab_one } from '@/lib/fonts';

interface LegalSection {
    heading: string;
    body: string[];
    imageUrl?: string;
    imageAlt?: string;
}

interface LegalPageProps {
    eyebrow: string;
    title: string;
    intro: string;
    sections: LegalSection[];
    updatedAt: string;
}

export function LegalPage({ eyebrow, title, intro, sections, updatedAt }: LegalPageProps) {
    return (
        <div className={`${prompt.className} min-h-screen bg-stone-50 text-slate-950`}>
            <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6 lg:px-8">
                <LandingNavbar />
            </div>

            <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 md:px-6 lg:px-8">
                <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                    <div className="bg-[linear-gradient(135deg,#0f172a,#1e293b_55%,#0f766e)] px-6 py-12 text-white md:px-10">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">{eyebrow}</p>
                        <h1 className={`${alfa_slab_one.className} mt-4 text-4xl leading-tight md:text-5xl`}>{title}</h1>
                        <p className="mt-4 max-w-2xl text-base leading-8 text-white/88 md:text-lg">{intro}</p>
                        <p className="mt-6 text-sm text-white/70">Last updated: {updatedAt}</p>
                    </div>

                    <div className="grid gap-8 px-6 py-8 md:px-10 md:py-10">
                        {sections.map((section) => (
                            <section key={section.heading} className="grid gap-3 border-b border-stone-200 pb-8 last:border-b-0 last:pb-0">
                                <h2 className="text-2xl font-semibold text-slate-950">{section.heading}</h2>
                                {section.imageUrl && (
                                    <div className="my-4 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={section.imageUrl} alt={section.imageAlt || "Section illustration"} className="w-full object-cover" />
                                    </div>
                                )}
                                {section.body.map((paragraph) => (
                                    <p key={paragraph} className="text-sm leading-8 text-slate-700 md:text-base">
                                        {paragraph}
                                    </p>
                                ))}
                            </section>
                        ))}
                    </div>
                </section>

                <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
                    <Link href="/privacy" className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">Privacy Policy</Link>
                    <Link href="/terms" className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">Terms of Service</Link>
                    <Link href="/data-deletion" className="rounded-full border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">Data Deletion</Link>
                </div>
            </main>
        </div>
    );
}
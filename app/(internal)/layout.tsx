import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'LLV — Internal Hub',
    description: 'Internal navigation and tools — not customer-facing',
};

export default function InternalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
                <span className="text-xs font-mono tracking-widest text-amber-400 uppercase">
                    ⚙️ Internal Hub
                </span>
                <span className="text-xs text-slate-500">Leisure Life Interactive — Staff Only</span>
            </header>
            <main className="pt-14">{children}</main>
        </div>
    );
}

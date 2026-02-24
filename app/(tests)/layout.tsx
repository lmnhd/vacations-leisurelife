import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Leisure Life — Test Lab',
    description: 'Isolated test environment for Interactive Agent development',
};

export default function TestsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* Minimal shell — no Clerk, no Crisp, no heavy providers */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
                <span className="text-xs font-mono tracking-widest text-cyan-400 uppercase">
                    🧪 Test Lab
                </span>
                <span className="text-xs text-slate-500">Interactive Agent Dev</span>
            </header>
            <main className="pt-14">{children}</main>
        </div>
    );
}

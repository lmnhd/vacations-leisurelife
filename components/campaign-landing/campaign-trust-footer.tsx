import Link from 'next/link';

/**
 * Trust-signal footer rendered on every public campaign landing page.
 * Presents the legal trade name, registered entity, mailing address, and
 * contact email required by Meta, TikTok, and toll-free carrier reviewers
 * when they crawl leisurelifeinteractive.net.
 */
export function CampaignTrustFooter() {
    const currentYear = new Date().getFullYear();
    const tollFreePhone = process.env.NEXT_PUBLIC_LLI_TOLL_FREE?.trim();

    return (
        <footer className="border-t border-slate-200 bg-white text-slate-700">
            <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8">
                <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="grid gap-2 text-sm leading-7">
                        <p className="font-semibold text-slate-950">
                            Leisure Life Interactive
                        </p>
                        <p>
                            &copy; {currentYear} Leisure Life Interactive. All rights reserved.
                            Leisure Life Interactive is a registered trade name of HALIMEDE LLC.
                        </p>
                        <p>
                            Corporate Address: 2280 SHEPARD ST APT 405, JACKSONVILLE, FL 32211.
                        </p>
                        <p>
                            Contact:{' '}
                            <a
                                href="mailto:nathaniel@leisurelifeinteractive.net"
                                className="underline underline-offset-4 hover:text-slate-950"
                            >
                                nathaniel@leisurelifeinteractive.net
                            </a>
                            {tollFreePhone ? (
                                <>
                                    {' '}&middot;{' '}
                                    <a
                                        href={`tel:${tollFreePhone.replace(/[^+\d]/g, '')}`}
                                        className="underline underline-offset-4 hover:text-slate-950"
                                    >
                                        {tollFreePhone}
                                    </a>
                                </>
                            ) : null}
                        </p>
                    </div>
                    <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm md:justify-end">
                        <Link href="/privacy" className="hover:text-slate-950 underline underline-offset-4">
                            Privacy Policy
                        </Link>
                        <Link href="/terms" className="hover:text-slate-950 underline underline-offset-4">
                            Terms of Service
                        </Link>
                        <Link href="/sms-consent" className="hover:text-slate-950 underline underline-offset-4">
                            SMS Consent
                        </Link>
                        <Link href="/data-deletion" className="hover:text-slate-950 underline underline-offset-4">
                            Data Deletion
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
}

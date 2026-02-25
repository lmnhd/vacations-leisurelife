'use client';

import { CruisePackage, PackageLineItem } from '@/lib/chat/types';
import { Ship, MapPin, Calendar, Users, Tag, ExternalLink, TrendingDown } from 'lucide-react';

interface PackageCardProps {
    packages: CruisePackage | CruisePackage[];
}

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const LINE_ITEM_CATEGORY_STYLE: Record<PackageLineItem['category'], string> = {
    cruise_fare:  'text-white',
    taxes_fees:   'text-zinc-400',
    excursion:    'text-sky-300',
    gratuities:   'text-zinc-400',
    agent_perk:   'text-emerald-400',
    deposit:      'text-amber-300 font-semibold',
};

function LineItemRow({ item }: { item: PackageLineItem }) {
    const colorClass = LINE_ITEM_CATEGORY_STYLE[item.category];
    return (
        <tr className={`border-b border-white/5 ${colorClass}`}>
            <td className="py-1.5 pr-4 text-sm">{item.label}</td>
            <td className="py-1.5 text-right text-sm tabular-nums">
                {item.isSavings ? `−${formatCurrency(Math.abs(item.unitPrice))}` : formatCurrency(item.unitPrice)}
            </td>
            <td className="py-1.5 pl-3 text-right text-sm tabular-nums text-zinc-400">
                ×{item.quantity}
            </td>
            <td className="py-1.5 pl-3 text-right text-sm font-medium tabular-nums">
                {item.isSavings
                    ? <span className="text-emerald-400">−{formatCurrency(Math.abs(item.totalPrice))}</span>
                    : formatCurrency(item.totalPrice)
                }
            </td>
        </tr>
    );
}

function SinglePackageCard({ pkg }: { pkg: CruisePackage }) {
    const nonDepositItems = pkg.lineItems.filter(i => i.category !== 'deposit');
    const depositItem = pkg.lineItems.find(i => i.category === 'deposit');

    return (
        <div className="flex flex-col bg-zinc-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl min-w-[320px] flex-1">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-900/60 to-blue-900/40 px-5 py-4 border-b border-white/10">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2 text-sky-300 mb-1">
                            <Ship className="w-4 h-4 shrink-0" />
                            <span className="text-xs font-medium uppercase tracking-wider">
                                {pkg.odysseusItineraryCode}
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-white leading-tight">{pkg.shipName}</h3>
                    </div>
                    <span className="shrink-0 bg-sky-500/20 text-sky-300 text-xs font-semibold px-2.5 py-1 rounded-full border border-sky-500/30">
                        {pkg.durationNights} Nights
                    </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-zinc-400 text-xs">
                    <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {pkg.departurePort}
                    </span>
                    <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {pkg.sailDate}
                    </span>
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {pkg.guestCount} Guests
                    </span>
                </div>
            </div>

            {/* Agent Perks Badge */}
            {pkg.appliedPerks.length > 0 && (
                <div className="px-5 py-2.5 bg-emerald-900/30 border-b border-emerald-700/30 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300 text-xs font-semibold">
                        Agent Perks Applied — Saving {formatCurrency(pkg.totalPerkSavings)}
                    </span>
                    <div className="flex flex-wrap gap-1 ml-auto">
                        {pkg.appliedPerks.map(perk => (
                            <span
                                key={perk.perkCode}
                                className="bg-emerald-800/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full border border-emerald-600/30"
                                title={perk.label}
                            >
                                {perk.perkCode}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Line Items Table */}
            <div className="px-5 py-4 flex-1">
                <table className="w-full">
                    <thead>
                        <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-white/10">
                            <th className="pb-2 text-left font-medium">Item</th>
                            <th className="pb-2 text-right font-medium">Unit</th>
                            <th className="pb-2 text-right font-medium">Qty</th>
                            <th className="pb-2 text-right font-medium">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {nonDepositItems.map((item, idx) => (
                            <LineItemRow key={idx} item={item} />
                        ))}
                    </tbody>
                </table>

                {/* Subtotal / Total */}
                <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                    {pkg.totalPerkSavings > 0 && (
                        <div className="flex justify-between text-sm text-zinc-400">
                            <span>Subtotal before perks</span>
                            <span className="tabular-nums">{formatCurrency(pkg.subtotal)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-base font-bold text-white">
                        <span>Total Package Price</span>
                        <span className="tabular-nums">{formatCurrency(pkg.totalPackagePrice)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-400">
                        <span>Per Person</span>
                        <span className="tabular-nums">{formatCurrency(pkg.pricePerPerson)}</span>
                    </div>
                </div>
            </div>

            {/* Deposit + CTA */}
            <div className="px-5 py-4 bg-zinc-800/50 border-t border-white/10">
                {depositItem && (
                    <div className="flex items-center gap-2 mb-3 text-amber-300 text-sm">
                        <Tag className="w-4 h-4 shrink-0" />
                        <span>
                            <span className="font-semibold">{formatCurrency(pkg.depositRequired)}</span>
                            &nbsp;due today to lock this rate
                        </span>
                    </div>
                )}
                <a
                    href={pkg.odysseusBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-semibold text-sm py-2.5 px-4 rounded-xl transition-colors duration-150"
                >
                    Book Now
                    <ExternalLink className="w-4 h-4" />
                </a>
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                    Package ID: {pkg.packageId} · Powered by Cruise Brothers
                </p>
            </div>
        </div>
    );
}

export function PackageCard({ packages }: PackageCardProps) {
    const packageList = Array.isArray(packages) ? packages : [packages];
    const isComparison = packageList.length > 1;

    return (
        <div className={`flex gap-4 w-full ${isComparison ? 'flex-row flex-wrap' : 'flex-col'}`}>
            {isComparison && (
                <div className="w-full text-center text-zinc-400 text-xs uppercase tracking-widest mb-1">
                    Comparing {packageList.length} Options
                </div>
            )}
            {packageList.map((pkg) => (
                <SinglePackageCard key={pkg.packageId} pkg={pkg} />
            ))}
        </div>
    );
}

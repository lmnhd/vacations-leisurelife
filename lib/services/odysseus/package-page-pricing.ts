import type { PackagePageCabinPricing } from "./types";

interface PackagePagePriceItem {
    name?: unknown;
    code?: unknown;
    value?: unknown;
}

interface PackagePagePriceSet {
    items?: unknown;
    currencyCode?: unknown;
}

function cabinKey(label: string): "inside" | "outside" | "balcony" | "suite" | undefined {
    const normalized = label.toLowerCase();
    if (
        normalized.includes("tax") ||
        normalized.includes("portcharge") ||
        normalized.includes("port charge") ||
        normalized.includes("gratuity")
    ) {
        return undefined;
    }
    if (normalized.includes("suite")) return "suite";
    if (
        normalized.includes("balcony") ||
        normalized.includes("verandah") ||
        normalized.includes("veranda")
    ) {
        return "balcony";
    }
    if (
        normalized.includes("ocean") ||
        normalized.includes("outside") ||
        normalized.includes("oceanview")
    ) {
        return "outside";
    }
    if (normalized.includes("inside") || normalized.includes("interior")) return "inside";
    return undefined;
}

export function extractPackagePageCabinPricing(value: unknown): PackagePageCabinPricing | undefined {
    if (!Array.isArray(value) || value.length === 0) return undefined;

    const pricing: PackagePageCabinPricing = { currencyCode: "USD" };
    for (const rawSet of value) {
        if (!rawSet || typeof rawSet !== "object") continue;
        const set = rawSet as PackagePagePriceSet;
        if (typeof set.currencyCode === "string" && set.currencyCode.trim()) {
            pricing.currencyCode = set.currencyCode.trim();
        }
        if (!Array.isArray(set.items)) continue;

        for (const rawItem of set.items) {
            if (!rawItem || typeof rawItem !== "object") continue;
            const item = rawItem as PackagePagePriceItem;
            const amount = typeof item.value === "number" ? item.value : Number(item.value);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const key = cabinKey(`${String(item.name ?? "")} ${String(item.code ?? "")}`);
            if (!key) continue;
            const existing = pricing[key];
            if (existing === undefined || amount < existing) pricing[key] = amount;
        }
    }

    const fares = [pricing.inside, pricing.outside, pricing.balcony, pricing.suite].filter(
        (amount): amount is number => typeof amount === "number"
    );
    if (fares.length === 0) return undefined;
    pricing.leadFare = Math.min(...fares);
    return pricing;
}

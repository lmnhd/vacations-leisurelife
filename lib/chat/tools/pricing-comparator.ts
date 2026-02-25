export type PricingComparatorInput = {
    baseFare: number;
    taxesFeesPortExpenses: number;
    gratuities: number;
    numberOfGuests: number;
    numberOfNights: number;
    clientTotalBudget: number;
};

export type PricingComparatorOutput = {
    totalCost: number;
    perPersonTotal: number;
    perPersonPerNight: number;
    budgetVariance: number;
    isWithinBudget: boolean;
    affordabilitySummary: string;
};

export async function runPricingComparator(
    input: PricingComparatorInput
): Promise<PricingComparatorOutput> {
    const {
        baseFare,
        taxesFeesPortExpenses,
        gratuities,
        numberOfGuests,
        numberOfNights,
        clientTotalBudget,
    } = input;

    // Validate inputs
    if (numberOfGuests <= 0) {
        throw new Error('Number of guests must be at least 1.');
    }
    if (numberOfNights <= 0) {
        throw new Error('Number of nights must be at least 1.');
    }

    // Calculations
    const totalCost = baseFare + taxesFeesPortExpenses + gratuities;
    const perPersonTotal = totalCost / numberOfGuests;
    const perPersonPerNight = perPersonTotal / numberOfNights;

    const budgetVariance = clientTotalBudget - totalCost;
    const isWithinBudget = budgetVariance >= 0;

    // Formatting currency
    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

    // Build the Affordability Summary
    let affordabilitySummary = '';

    if (isWithinBudget) {
        affordabilitySummary = `GREAT NEWS: This package is ${formatCurrency(budgetVariance)} under budget! `;
    } else {
        affordabilitySummary = `WARNING: This package is ${formatCurrency(Math.abs(budgetVariance))} OVER budget. `;
    }

    affordabilitySummary += `The total cost is ${formatCurrency(totalCost)} for ${numberOfGuests} guests (${formatCurrency(perPersonTotal)} per person). `;
    affordabilitySummary += `This breaks down to an excellent value of ${formatCurrency(perPersonPerNight)} per person, per night. `;

    if (gratuities > 0) {
        affordabilitySummary += `(Includes ${formatCurrency(gratuities)} in prepaid gratuities).`;
    }

    return {
        totalCost,
        perPersonTotal,
        perPersonPerNight,
        budgetVariance,
        isWithinBudget,
        affordabilitySummary
    };
}

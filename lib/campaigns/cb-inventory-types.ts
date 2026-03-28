export type CbGroupInventoryItem = {
    groupId: string;
    shipName: string;
    vendor: string;
    itinerary: string;
    sailDate: string;
    startingPrice: string;
    startingPriceNumber: number;
    priceAdvantage: string;
    priceAdvantageNumber: number;
    departurePort?: string;
    nights?: string;
    sourceUrl: string;
};
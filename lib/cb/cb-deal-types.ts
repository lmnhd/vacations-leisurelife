export interface CBPickData {
  img: string;
  destination: string;
  what: string;
  when: string;
  price: string;
  elsepay: string;
  go: string;
  why: string;
  other: string;
  id: string;
  destination_url?: string;
}

export interface CbHomepageDealToolTips {
  freeDining?: boolean;
  freeDrinks?: boolean;
  freeWifi?: boolean;
  onboardCredits?: boolean;
}

export interface StoredCbHomepageDeal {
  id: string;
  destination: string;
  imageSrc: string;
  alt: string;
  day: string;
  port: string;
  header1: string;
  header2: string;
  description: string;
  pricePerPerson: string;
  detailsLink: string;
  toolTips?: CbHomepageDealToolTips;
}

export interface StoredCbDealsPayload {
  version: number;
  generatedAtIso: string;
  source: string;
  picks: CBPickData[];
  homepageDeals: StoredCbHomepageDeal[];
}
/**
 * Synthetic showcase fixtures.
 *
 * Every value here is invented for the public demo. Nothing in this file may
 * ever be derived from, merged with, or written back to real guest records.
 * The `synthetic` marker on the profile is asserted by tests that prove
 * showcase data cannot reach a real-guest code path.
 */

export interface ShowcasePreference {
  key: string;
  value: string;
  /** How the demo learned it: seeded fixture or captured in this session. */
  origin: "fixture" | "session";
}

export interface ShowcaseTrip {
  tripId: string;
  shipName: string;
  cruiseLine: string;
  destination: string;
  sailedLabel: string;
  nights: number;
  note: string;
}

export interface ShowcaseProfile {
  /** Always true. Guards against a real profile being substituted. */
  synthetic: true;
  displayName: string;
  homePort: string;
  partySummary: string;
  preferences: ShowcasePreference[];
  trips: ShowcaseTrip[];
}

export function createShowcaseProfile(): ShowcaseProfile {
  return {
    synthetic: true,
    displayName: "Sample Traveler (demo)",
    homePort: "Port Canaveral, Florida",
    partySummary: "Two adults, occasionally travelling with two teenagers",
    preferences: [
      { key: "cabin", value: "Balcony, mid-ship, away from the elevators", origin: "fixture" },
      { key: "ship_style", value: "Quieter ships; dislikes constant poolside music", origin: "fixture" },
      { key: "entertainment", value: "Live music, especially jazz and piano bars", origin: "fixture" },
      { key: "dining", value: "Late seating; enjoys specialty steakhouse once per sailing", origin: "fixture" },
      { key: "trip_length", value: "Seven nights is the sweet spot", origin: "fixture" },
    ],
    trips: [
      {
        tripId: "demo-trip-1",
        shipName: "Celebrity Reflection",
        cruiseLine: "Celebrity Cruises",
        destination: "Eastern Caribbean",
        sailedLabel: "March 2025 (demo record)",
        nights: 7,
        note: "Loved the martini bar; found the buffet crowded at lunch.",
      },
      {
        tripId: "demo-trip-2",
        shipName: "Norwegian Getaway",
        cruiseLine: "Norwegian Cruise Line",
        destination: "Western Caribbean",
        sailedLabel: "January 2024 (demo record)",
        nights: 7,
        note: "Great entertainment, but wanted a quieter pool deck.",
      },
    ],
  };
}

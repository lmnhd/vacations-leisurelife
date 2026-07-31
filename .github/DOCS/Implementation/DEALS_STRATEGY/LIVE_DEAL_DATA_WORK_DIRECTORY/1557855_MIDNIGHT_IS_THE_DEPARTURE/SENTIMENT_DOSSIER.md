# New Year's Cruise Customer Sentiment Dossier

**Campaign:** Midnight Is the Departure
**Package:** Odysseus `1557855`
**Captured:** 2026-07-30
**Market:** United States, with a Florida-drive and Florida-flight emphasis
**Decision:** Find a year-end cruise that creates its own urgency and can be sold with a current, documented Cruise Brothers promotion.

## Recommendation

Lead with the exact New Year's Eve departure, not a generic "winter escape."

The core customer job is:

> Make New Year's Eve feel like the beginning of something, not one expensive night that is over by morning.

The selected sailing turns midnight into day one of a seven-night vacation. It also gives the shopper immediate proof: a December 31 departure, four named Caribbean stops, live numeric cabin tiers, and a current NCL sale window.

## Source ledger

| Source | Captured | Evidence role | Strength and limits |
| --- | --- | --- | --- |
| Live Odysseus lookup for Norwegian, 2026-12-31, Eastern Caribbean | 2026-07-30 | Package, ship, date, itinerary, and cabin pricing | High for current package facts. Prices and availability can change until booked. |
| Exact Odysseus package page `1557855` | 2026-07-30 | Link and day-by-day itinerary proof | High. The package page loaded and returned Norwegian Getaway plus eight day nodes. |
| Cruise Brothers Today's View promotion `cbpromo-2904` | 2026-07-30 | Current NCL promotion terms | High for the captured booking and sailing windows. Rate-level benefits still require confirmation. |
| Prior winter-cruise sentiment dossier | 2026-07-15 | Customer tensions and evidence gaps | Medium. It established that occasion value should be distinct from an unverified savings claim. |
| Model synthesis | 2026-07-30 | Intent framing and creative direction | Inference. No owned customer wording or quantified Google demand was available in this pass. |

## Customer-language cards

The language below is original research synthesis, not an external quotation or testimonial.

### Card 1 - "I want New Year's Eve to be more than one night"

- **Job:** Turn the calendar change into a meaningful shared experience.
- **Tension:** A restaurant, hotel party, or local event can be expensive but still feel finished on January 1.
- **Desired outcome:** Wake up on New Year's Day already inside the vacation.
- **Proof required:** Exact December 31 departure, seven-night duration, ship, and itinerary.
- **Language atoms:** start the year somewhere new, midnight is only the beginning, wake up already on vacation.

### Card 2 - "Show me a real deal, not holiday glitter"

- **Job:** Decide quickly whether the holiday premium is defensible.
- **Tension:** Holiday travel ads often hide the actual fare or use a broad sale without an exact sailing.
- **Desired outcome:** See the real cabin ladder and current offer before investing more time.
- **Proof required:** Numeric cabin tiers, price basis, book-by date, and rate-level disclaimer.
- **Language atoms:** real New Year's cruise price, seven nights from Florida, current cabin options, sale ends August 18.

### Card 3 - "Give the group one plan everyone can rally around"

- **Job:** Replace fragmented party planning with one shared trip.
- **Tension:** Couples and friend groups struggle to coordinate a celebration that feels worth the effort.
- **Desired outcome:** One departure, one ship, and enough variety for celebration plus recovery time.
- **Proof required:** Ship identity, sea-day pacing, port calendar, cabin range, and booking help.
- **Language atoms:** bring your favorite people, one plan for New Year's, celebrate then disappear into the Caribbean.

## Intent clusters

| Cluster | Job and tension | Proof needed | Confidence |
| --- | --- | --- | --- |
| Midnight Is the Departure | Make midnight the beginning of a full vacation | Exact departure date, ship, nights, route | High package fit; demand not quantified |
| Seven Nights for the Price Conversation | Replace vague holiday pricing with a visible cabin ladder | Live fare basis and sale terms | High offer fit; prices remain dynamic |
| The Friends-Trip Countdown | Give a small group one celebration plan | Cabin availability, group coordination, cancellation terms | Medium |
| New Year, No Hosting | Escape the labor and repetition of the usual holiday | Florida departure logistics and full trip cost | Medium |

## Candidate shortlist

| Rank | Package | Sailing | Live lead fare | Why it fits |
| --- | --- | --- | --- | --- |
| 1 | `1557855` | Norwegian Getaway, 7 nights, Port Canaveral, 2026-12-31 | $589 inside | Exact New Year's Eve departure, full-week itinerary, four destination stops, current NCL sale window |
| 2 | `1557856` | Norwegian, 4 nights, Miami, 2026-12-31 | $849 inside | Exact date and easy short-break message, but costs more for a shorter Bahamas trip |
| 3 | `1631908` | Norwegian, 7 nights, Tampa, 2026-12-28 | $729 inside | Strong price and week-long route, but it misses the powerful exact-midnight departure |

All fares are USD amounts returned by Odysseus on 2026-07-30 and may change. They are not presented as taxes-and-fees-inclusive unless the booking path confirms that basis.

## Selected package proof

- **Package ID:** `1557855`
- **Cruise line:** Norwegian Cruise Line
- **Ship:** Norwegian Getaway
- **Departure:** Port Canaveral, Florida
- **Sail date:** December 31, 2026
- **Duration:** 7 nights
- **Itinerary:** Port Canaveral, Puerto Plata, St. Thomas, Tortola, Great Stirrup Cay, Port Canaveral
- **Cabin tiers returned:** inside $589, oceanview $729, balcony $1,129, suite $1,349
- **Booking page:** exact package page loaded successfully during live Odysseus capture

## Promotion proof and boundaries

Cruise Brothers promotion `cbpromo-2904`, "Norwegian Cruise Line - Semi Annual Sale," was captured on 2026-07-30.

- Booking window: through August 18, 2026.
- Sailing window: October 15, 2026 through September 2, 2027.
- Public-safe qualified claim: 50% off eligible NCL cruise fares, subject to current promotion and rate terms.
- Reduced-deposit direction: eligible balcony-and-below bookings.
- Do not promise: bonus onboard credit, free third/fourth guests, a child rate, or a specific deposit amount without confirming this package and rate.
- Agent-only: prepaid gratuities are not combinable with FITOBC.

## Smallest valid Deal handoff

```text
selected cluster: Midnight Is the Departure
market: US, with Florida drive and flight access
package: Odysseus 1557855, Norwegian Getaway, 2026-12-31, 7 nights
public direction: Make midnight the first moment of a seven-night Caribbean vacation
price proof: 589 inside, 729 oceanview, 1129 balcony, 1349 suite, USD snapshot
promotion: cbpromo-2904, NCL Semi-Annual Sale, book by 2026-08-18
required qualifiers: eligible fare and rate terms; prices and availability change
measurement: landing view -> Start booking -> booking handoff -> CBAT-confirmed booking
```

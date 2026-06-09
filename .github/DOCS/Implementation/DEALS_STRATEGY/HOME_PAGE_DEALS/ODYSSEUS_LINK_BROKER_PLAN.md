# Odysseus Link Broker Plan

## Purpose

Build a light, fast, reusable internal backend module for generating Cruise Brothers/Odysseus booking links with the correct parameters already populated.

This is not a frontend customer-facing product. The Link Broker is infrastructure.

Frontend flows such as:

- Book now
- Email me the booking link
- Request an agent callback

may consume Link Broker output, but those CTA flows should be implemented as separate UI/API workflows. The Link Broker's job is narrower: produce, normalize, validate, cache, and refresh usable CB/Odysseus links when the backend needs them.

## Core Contract

Given cruise facts and as much traveler setup data as we have, the Link Broker should return the best usable CB/Odysseus booking link.

```text
cruise line + ship + sail date + optional itinerary/user setup -> best available booking link
```

The caller should not have to decide which link class to use.

The module should decide whether to return:

- a package entry link
- a prepared details link with preliminary information already entered
- a freshly captured clone/resume link
- a fallback link that starts earlier in the booking flow
- a `needs_operator_capture` response if the link cannot be created safely

Package ID is useful when available, but it should not be mandatory for the higher-level contract. If the caller provides ship/cruise line/sail date instead of package ID, the broker should use Odysseus search, CBAT scraping, cached candidates, or operator-captured data to find the actual package before building the link.

## Intended Internal Consumers

The module should be callable from:

- curated Deals publishing
- deal detail page backend actions
- email-link generation
- callback-request dashboard tools
- chat/package recommendation tools
- trend-led deal campaign tooling
- paid ad preflight validation
- operator/admin tools

These consumers decide what to do with the link. The Link Broker only creates and checks it.

## Responsibilities

The Link Broker should handle:

1. **Resolve package**
   - accept ship/cruise line/sail date facts when package ID is unknown
   - search Odysseus/CBAT or cached package data
   - return ranked package candidates if the match is not certain
   - select a package only when confidence is high enough

2. **Choose link class**
   - choose package entry, prepared details, captured clone, or captured cabin based on available inputs and safety rules
   - prefer prepared details when traveler setup is sufficient
   - fall back to package entry when setup data is incomplete
   - require portal capture for clone/cabin resume links

3. **Build link**
   - assemble the selected URL with the correct `pid`, `siid`, office, passenger, residency, and optional phone parameters
   - normalize captured links
   - avoid guessing portal-generated fields

4. **Validate link**
   - run static validation first
   - run browser-aware validation when freshness matters
   - track health, failure reason, and verification time

5. **Cache link**
   - cache by package, `siid`, traveler setup hash, and link class
   - avoid repeating expensive lookup/scraping work
   - mark stale links before reuse

6. **Return result**
   - return the selected internal URL and diagnostics
   - do not email, text, open, or render the URL itself

## Non-Goals

- Do not render frontend UI.
- Do not own the public CTA model.
- Do not send emails directly.
- Do not create callback requests directly.
- Do not collect payment.
- Do not hold cabins.
- Do not select a stateroom on behalf of the guest.
- Do not submit passenger identity details.
- Do not create reservations.
- Do not mix with Groups unless explicitly requested.

## Known Link Classes

### Class 1 - Package Entry Link

Basic Odysseus package entry.

```text
https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}--{package-slug}?siid={AGENT_ID}&lang=1
```

Use when:

- only package ID and agent ID are known
- we want the safest broad booking entry point
- traveler setup information is not available yet

Notes:

- likely the safest and simplest link while the package exists
- still must be validated because package availability can change

### Class 2 - Prepared Details Link

Short-form details entry that can skip some preliminary booking steps by passing setup parameters.

Canonical shape should match the real CB/Odysseus Share button output when available.

```text
https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid={PACKAGE_ID}&siid={AGENT_ID}&lang=1&CurrId=USD&officeId={OFFICE_ID}&skipdetails=true&op={OCCUPANCY_PAYLOAD}&res=US%2c{STATE}%2c{AIRPORT}&tt=29&p1={PASSENGER_COUNT}&p2={AGE_LIST}&PhoneNum={PHONE}
```

Use when:

- package ID is known
- `siid` is known
- passenger count is known
- passenger ages are known
- state of residence is known
- airport/residency code is known or defaultable
- optional phone number is available

This is likely the most important Link Broker output for Deals because it can create a "prepared booking link" without relying on a portal-generated resume token.

### Canonical Prepared Details Shape Decision

Use the portal Share button shape as the canonical prepared-details link.

Decision:

- Emit `/web//cruises/details.aspx` style links that match copied Share button output.
- Include `CurrId=USD`.
- Use lowercase `skipdetails=true`.
- Preserve the `officeId` observed or configured for the selected package/account.
- Do not include `packageTourId=-1` in the canonical prepared-details link unless testing proves a cruise line requires the older engine-compatible shape.

Reason:

- The Share button output is the most faithful representation of what CB/Odysseus expects agents to distribute.
- It is the shape proven to work in incognito during manual testing.
- It reduces drift between what the portal copies and what the Link Broker emits.

Compatibility:

- Keep the existing OdysseusEngine-style builder as a fallback shape:

```text
/web/cruises/details.aspx?source=swift&pid={PACKAGE_ID}&packageTourId=-1&lang=1&...&skipDetails=true...
```

- Use this fallback only when the canonical Share button shape fails validation or when a specific package/vendor requires it.
- Make the shape selectable internally, but default `resolveBestBookingLink()` to the Share button canonical shape.

### Class 3 - Captured Clone/Resume Link

Prepared link after CB/Odysseus has generated a clone booking state.

Observed shape:

```text
https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid={PACKAGE_ID}&siid={AGENT_ID}&lang=1&CurrId=USD&officeId={OFFICE_ID}&skipdetails=true&op={OCCUPANCY_PAYLOAD}&res=US%2c{STATE}%2c{AIRPORT}&tt=29&p1={PASSENGER_COUNT}&p2={AGE_LIST}&PhoneNum={PHONE}&clonebkg={CLONE_BOOKING_TOKEN}
```

Use when:

- the portal generated the `clonebkg` value
- the link was freshly captured and validated
- an internal flow needs to preserve a deeper booking state

Do not synthesize `clonebkg` unless we later prove the format and safety. Treat it as portal-generated resume state.

### Class 4 - Cabin/Stateroom URL

Observed deeper flow URL:

```text
https://bookings.cbagenttools.com/web/cruises/cabin.aspx?brn={BOOKING_REFERENCE}
```

Use only when:

- the portal generated the `brn`
- the link was freshly captured and validated
- the operational risk is understood

Do not dynamically assemble `brn`. It appears to represent booking/session state created by the portal.

## Preferred Link Target

Default internal generation target:

```text
Class 2 - Prepared Details Link
```

Reason:

- uses mostly stable and understandable parameters
- can be generated quickly
- can include preliminary traveler information
- avoids relying on `clonebkg` or `brn`
- likely lands the guest around category/stateroom selection rather than the very beginning

Fallback target:

```text
Class 1 - Package Entry Link
```

Fresh captured target:

```text
Class 3 - Captured Clone/Resume Link
```

only when the portal actually provides it.

## Request Contract

```ts
interface LinkBrokerRequest {
  requestId?: string;
  intent:
    | "find_best_link"
    | "build_from_package_id"
    | "refresh_existing_link"
    | "capture_deep_link";
  cruise: {
    packageId?: string;
    packageUrl?: string;
    cruiseLine?: string;
    shipName?: string;
    sailDate?: string;
    nights?: number;
    itineraryName?: string;
    destination?: string;
    departurePort?: string;
    arrivalPort?: string;
    cabinCategoryPreference?: string;
  };
  agent: {
    siid: string;
    officeId?: string;
  };
  travelerSetup?: {
    passengerCount?: number;
    ages?: number[];
    countryCode?: "US" | string;
    state?: string;
    airportCode?: string;
    phone?: string;
  };
  currencyId?: "USD" | string;
  preference?: {
    preferredLinkClass?: "auto" | "package_entry" | "prepared_details" | "captured_clone" | "captured_cabin";
    allowPreparedDetails?: boolean;
    allowCapturedClone?: boolean;
    allowCabinResume?: boolean;
    requireFreshValidation?: boolean;
  };
  existingLink?: string;
  cloneBookingToken?: string;
  bookingReference?: string;
}
```

Default preference:

```ts
{
  preferredLinkClass: "auto",
  allowPreparedDetails: true,
  allowCapturedClone: false,
  allowCabinResume: false,
  requireFreshValidation: true
}
```

Interpretation:

- If enough traveler setup data exists, return a prepared details link.
- If setup data is incomplete, return a package entry link or request missing inputs.
- If package ID is missing, find the package through Odysseus/CBAT lookup first.
- If a captured clone/cabin link is requested, return it only when portal-generated and freshly validated.

## Output

```ts
interface LinkBrokerOutput {
  status:
    | "ready"
    | "found_package_needs_inputs"
    | "needs_package_lookup"
    | "needs_validation"
    | "invalid"
    | "needs_operator_capture";
  linkClass: "package_entry" | "prepared_details" | "captured_clone" | "captured_cabin";
  url?: string;
  packageId?: string;
  siid: string;
  resolvedCruise?: {
    cruiseLine?: string;
    shipName?: string;
    sailDate?: string;
    nights?: number;
    itineraryName?: string;
    departurePort?: string;
  };
  missingInputs: string[];
  warnings: string[];
  decision: {
    selectedLinkClass: string;
    reason: string;
    alternativesConsidered: string[];
  };
  health?: LinkBrokerHealth;
}
```

```ts
interface LinkBrokerHealth {
  status: "valid" | "stale" | "broken" | "unknown";
  capturedAtIso?: string;
  lastVerifiedAtIso?: string;
  nextVerificationDueIso?: string;
  failureReason?: string;
}
```

## Parameter Rules

### Always Required

- `packageId`
- `siid`
- `lang=1`

### Prepared Details Required

- `source=swift`
- `pid={PACKAGE_ID}`
- `siid={AGENT_ID}`
- `CurrId=USD`
- `officeId={OFFICE_ID}`
- `skipdetails=true`
- `op={OCCUPANCY_PAYLOAD}`
- `res=US%2c{STATE}%2c{AIRPORT}`
- `tt=29`
- `p1={PASSENGER_COUNT}`
- `p2={AGE_LIST}`

### Optional

- `PhoneNum={PHONE}`

### Portal-Generated Only

- `clonebkg`
- `brn`

## Office ID Handling

The observed links include different `officeId` values, including `192`, `193`, and `286`.

The broker must not guess blindly.

Plan:

- store the default configured office ID in environment/config
- preserve office ID when it is captured from a portal-generated link
- log diagnostics when generated and captured office IDs differ
- include office ID in validation output

## Phone Handling

`PhoneNum` can be included in prepared details links when a visitor has provided a phone number through a separate CTA flow.

Rules:

- do not hardcode phone numbers
- do not store phone numbers inside generic link cache records unless the record is explicitly tied to a lead/request
- redact phone numbers in logs
- allow generated links without `PhoneNum` if CB/Odysseus accepts them

## Cache Record

```ts
interface LinkBrokerRecord {
  id: string;
  packageId: string;
  siid: string;
  linkClass: "package_entry" | "prepared_details" | "captured_clone" | "captured_cabin";
  url: string;
  urlHash: string;
  source: "constructed" | "captured_share_button" | "operator_override";
  createdAtIso: string;
  updatedAtIso: string;
  health: LinkBrokerHealth;
  cruiseFingerprint?: {
    cruiseLine?: string;
    shipName?: string;
    itineraryName?: string;
    sailDateIso?: string;
    nights?: number;
    departurePort?: string;
  };
  parameterSummary: {
    passengerCount?: number;
    ageCount?: number;
    state?: string;
    airportCode?: string;
    officeId?: string;
    hasPhone: boolean;
    hasCloneBookingToken: boolean;
    hasBookingReference: boolean;
  };
}
```

## Module Shape

```text
lib/cb/link-broker/
  index.ts
  types.ts
  normalize.ts
  build-package-link.ts
  build-prepared-details-link.ts
  parse-captured-link.ts
  validate.ts
  cache.ts
  broker.ts
```

Recommended public API:

```ts
resolveBestBookingLink(request: LinkBrokerRequest): Promise<LinkBrokerOutput>
refreshBookingLink(request: LinkBrokerRequest): Promise<LinkBrokerOutput>
parseCapturedOdysseusLink(url: string): ParsedBrokerLink
validateBrokerLink(url: string): Promise<LinkBrokerHealth>
```

Lower-level builders should exist, but they are internal helpers:

```ts
buildPackageEntryLink(input)
buildPreparedDetailsLink(input)
findOdysseusPackageCandidates(request)
chooseBrokerLinkClass(request, candidates)
getCachedBrokerLink(input)
upsertBrokerLink(record)
```

## Validation Strategy

CB Swift pages are JavaScript apps and can return HTTP 200 even when the package is broken. Plain `fetch` is not enough.

Validation levels:

1. **Static validation**
   - required params exist
   - `siid` exists
   - package ID is parseable
   - age count matches passenger count
   - no portal-generated field is guessed

2. **Browser validation**
   - open link in browser context
   - inspect rendered page for not-found markers
   - watch CB/Odysseus JSON/API responses for error markers
   - confirm the link lands at the expected phase when possible

3. **Operator capture validation**
   - for `clonebkg` or `brn` links, require fresh capture and validation
   - store captured timestamp

## Internal Workflow

### Resolve Best Link

```text
cruise facts + traveler setup -> find package if needed -> choose best link class -> build/capture -> validate -> cache -> return
```

Decision ladder:

1. If a fresh captured clone/cabin link is explicitly allowed and available, return it.
2. If package ID is known and traveler setup is sufficient, return prepared details link.
3. If package ID is known but traveler setup is incomplete, return package entry link or `found_package_needs_inputs`.
4. If package ID is missing, search Odysseus/CBAT by cruise line, ship, sail date, nights, itinerary, and departure port.
5. If one confident package match is found, continue link selection.
6. If multiple or no matches are found, return `needs_operator_capture` or `needs_package_lookup` with diagnostics.

### Package Lookup

When the request has ship/cruise line/sail date but no package ID:

```text
LinkBrokerRequest.cruise -> Odysseus/CBAT search -> ranked package candidates -> selected package ID
```

Package matching should use:

- cruise line
- ship name
- sail date
- nights
- itinerary/destination
- departure port
- arrival port when available
- cabin category preference when available

The broker should return diagnostics if the match is weak. It should not silently pick a package when multiple plausible options exist.

### Construct Prepared Link

```text
resolved package + traveler setup -> buildPreparedDetailsLink -> static validate -> cache -> return internal URL
```

### Capture Resume Link

```text
operator/automation progresses portal -> share button copies link -> parseCapturedOdysseusLink -> classify as captured_clone/captured_cabin -> validate -> cache
```

### Use From Frontend CTA System

The frontend CTA system should not build CB URLs itself.

It should ask the backend:

```text
I need a booking link for deal/package X with these traveler setup inputs.
```

The backend calls the Link Broker and then decides whether to:

- open the URL
- email the URL
- attach it to an agent callback request
- queue validation
- request operator capture

Those delivery and callback actions are outside the Link Broker.

## Implementation Phases

### Phase 1 - Resolve Contract and Internal Builders

- create `lib/cb/link-broker`
- implement `resolveBestBookingLink(request)`
- implement request/output types
- implement package-entry builder
- implement prepared-details builder
- implement captured-link parser
- add redacted diagnostics
- add unit tests for parameter assembly

### Phase 2 - Package Lookup and Link Classification

- add Odysseus/CBAT package lookup by cruise line, ship, sail date, nights, itinerary, and departure port
- return ranked package candidates and confidence diagnostics
- classify package, details, clone, and cabin URLs
- parse `packageId`, `siid`, `officeId`, passenger setup, `clonebkg`, and `brn`
- mark portal-generated fields explicitly

### Phase 3 - Validation

- extract reusable browser validation from existing retail-link validator
- add static validation for prepared details links
- add health timestamps and failure reasons

### Phase 4 - Cache

- add local development cache
- add production storage plan
- support cache lookup by package ID, siid, link class, and traveler setup hash

### Phase 5 - Consumer APIs

- expose internal service functions to Deals, email-link generation, callback tooling, and operator tools
- keep public CTA routes thin and separate from broker internals

### Phase 6 - Operator Capture Support

- support ingesting share-button/captured links
- classify and cache `clonebkg` and `brn` links
- require validation before use

## Success Criteria

- Backend code has one reusable place to generate CB/Odysseus links.
- The main contract accepts cruise facts and traveler setup, then returns the best link without the caller choosing the link class.
- The broker can look up an actual package ID from ship/cruise line/sail date when package ID is missing.
- Prepared details links can be assembled from package ID, `siid`, and traveler setup inputs.
- `clonebkg` and `brn` are treated as portal-generated and never guessed.
- Links include correct agent attribution.
- Phone numbers are redacted in logs and not stored casually.
- Link health is tracked.
- Frontend/customer flows consume broker output but do not own broker logic.
- No hold, reservation, payment, stateroom selection, or passenger submission is performed by the broker.

## Open Questions

- Which `officeId` should be default for Leisure Life links?
- Can prepared details links work reliably without `PhoneNum`?
- Does `skipdetails=true` always land at the same phase for all cruise lines?
- How long do prepared details links remain valid?
- Is `clonebkg` always generated only after category/fare selection?
- Can `clonebkg` links be safely used in email if freshly generated?
- What browser-validation markers prove the guest landed on Category versus Staterooms?

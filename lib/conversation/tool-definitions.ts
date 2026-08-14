/**
 * Tool definitions in OpenAI Realtime function format.
 *
 * These are DEFINITIONS only - every implementation lives server-side and is
 * reached through the guarded dispatch route. The browser never chooses an
 * endpoint name or passes arbitrary fields into Booking Assistant state.
 */

export interface RealtimeToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, RealtimeToolParameterSchema>;
    required: string[];
  };
}

const DEFINITIONS: Record<string, RealtimeToolDefinition> = {
  // ── Research and pricing (existing handlers) ──────────────────────────────

  perplexity_cruise_research: {
    type: "function",
    name: "perplexity_cruise_research",
    description:
      "Research cruise availability, typical pricing ranges, ships, and destination guidance using live web research.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The research question" },
        destination: { type: "string", description: "Destination or region (optional)" },
        departure_month: { type: "string", description: 'Departure month e.g. "January 2027" (optional)' },
      },
      required: ["query"],
    },
  },

  cruise_brothers_knowledge: {
    type: "function",
    name: "cruise_brothers_knowledge",
    description:
      "Look up Cruise Brothers agency knowledge: booking procedures, cruise line policies, and what the agency can arrange.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "The question to answer" } },
      required: ["query"],
    },
  },

  excursion_finder: {
    type: "function",
    name: "excursion_finder",
    description: "Research shore excursions at a port: options, duration, and typical pricing.",
    parameters: {
      type: "object",
      properties: {
        port: { type: "string", description: 'Port of call e.g. "Cozumel"' },
        interests: { type: "string", description: 'Traveler interests e.g. "snorkeling, history" (optional)' },
        cruise_line: { type: "string", description: "Cruise line for line-specific options (optional)" },
      },
      required: ["port"],
    },
  },

  cruise_brothers_scraper: {
    type: "function",
    name: "cruise_brothers_scraper",
    description: "Search current agency cruise deals and promotions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Deal search query" },
        cruise_line: { type: "string", description: "Filter by cruise line (optional)" },
        destination: { type: "string", description: "Filter by destination (optional)" },
      },
      required: ["query"],
    },
  },

  social_media_insights: {
    type: "function",
    name: "social_media_insights",
    description: "Summarize what real travelers say about a cruise line, ship, or destination.",
    parameters: {
      type: "object",
      properties: {
        cruise_line: { type: "string", description: "Cruise line name" },
        ship_name: { type: "string", description: "Ship name (optional)" },
        destination: { type: "string", description: "Destination (optional)" },
      },
      required: ["cruise_line"],
    },
  },

  cruise_trend_analysis: {
    type: "function",
    name: "cruise_trend_analysis",
    description: "Research current cruise industry trends, optionally through a traveler demographic lens.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Topic category",
          enum: [
            "overall_industry",
            "dining_and_food",
            "onboard_entertainment",
            "shore_excursions",
            "value_and_pricing",
            "sustainability",
            "technology_and_connectivity",
            "health_and_wellness",
          ],
        },
        perspective: {
          type: "string",
          description: "Traveler demographic lens (optional)",
          enum: ["gen_z", "millennial", "gen_x", "boomer", "family", "solo", "luxury", "budget"],
        },
        cruise_line: { type: "string", description: "Focus on one cruise line (optional)" },
        timeframe: { type: "string", description: 'Time window e.g. "last 3 months" (optional)' },
      },
      required: ["category"],
    },
  },

  odysseus_search: {
    type: "function",
    name: "odysseus_search",
    description:
      "Primary and authoritative search for cruise options, itineraries, live availability, and starting prices from the Cruise Brothers booking engine. Read-only. Use this for every guest cruise search; never substitute general web research.",
    parameters: {
      type: "object",
      properties: {
        passengers: { type: "number", description: "Total number of passengers" },
        guestAges: {
          type: "array",
          description: "Age of each passenger, e.g. [42, 40]",
          items: { type: "number" },
        },
        startDate: { type: "string", description: "Search window start, MM/DD/YYYY (optional)" },
        endDate: { type: "string", description: "Search window end, MM/DD/YYYY (optional)" },
        vendorId: { type: "number", description: "Cruise line vendor id (optional)" },
      },
      required: [],
    },
  },

  pricing_comparator: {
    type: "function",
    name: "pricing_comparator",
    description: "Compute total cost, per-person and per-night breakdown, and budget fit for a package.",
    parameters: {
      type: "object",
      properties: {
        baseFare: { type: "number", description: "Base fare total for all guests" },
        taxesFeesPortExpenses: { type: "number", description: "Taxes, fees, and port expenses" },
        gratuities: { type: "number", description: "Prepaid gratuities total, 0 if none" },
        numberOfGuests: { type: "number", description: "Number of guests" },
        numberOfNights: { type: "number", description: "Number of nights" },
        clientTotalBudget: { type: "number", description: "Traveler total budget in USD" },
      },
      required: [
        "baseFare",
        "taxesFeesPortExpenses",
        "gratuities",
        "numberOfGuests",
        "numberOfNights",
        "clientTotalBudget",
      ],
    },
  },

  // ── Showcase-only synthetic memory and simulation ─────────────────────────

  showcase_preferences_read: {
    type: "function",
    name: "showcase_preferences_read",
    description: "Read the synthetic demo traveler's saved preferences.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  showcase_preferences_save: {
    type: "function",
    name: "showcase_preferences_save",
    description:
      "Save or update one synthetic demo preference after the traveler states it. The traveler confirms it on screen before it is kept.",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Preference category",
          enum: [
            "cabin",
            "ship_style",
            "entertainment",
            "dining",
            "trip_length",
            "destination",
            "budget",
            "accessibility_style",
            "other",
          ],
        },
        value: { type: "string", description: "The preference in the traveler's own words" },
      },
      required: ["key", "value"],
    },
  },

  showcase_trip_history: {
    type: "function",
    name: "showcase_trip_history",
    description: "Read the synthetic demo traveler's past cruise history.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  showcase_booking_draft_prepare: {
    type: "function",
    name: "showcase_booking_draft_prepare",
    description:
      "Prepare or update the synthetic demo booking draft with a value the traveler just gave. Nothing is reserved and no payment occurs.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "Which draft field this value fills",
          enum: ["sailing", "party_size", "cabin_category", "first_name", "trip_dates", "notes"],
        },
        value: { type: "string", description: "The proposed value" },
      },
      required: ["field", "value"],
    },
  },

  showcase_payment_handoff_simulated: {
    type: "function",
    name: "showcase_payment_handoff_simulated",
    description:
      "Present the simulated secure supplier checkout handoff. Call this when the traveler asks to pay. Never collect any card details.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  // ── Booking Assistant (authorized guest only) ─────────────────────────────

  booking_field_propose: {
    type: "function",
    name: "booking_field_propose",
    description:
      "Propose one operational contact value the guest just stated. This only creates an editable confirmation card; the guest's confirmation saves it.",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "Which booking field this value fills",
          enum: ["first_name", "email", "phone", "party_size", "traveler_ages"],
        },
        value: { type: "string", description: "The value exactly as the guest stated it" },
      },
      required: ["field", "value"],
    },
  },

  booking_progress_read: {
    type: "function",
    name: "booking_progress_read",
    description: "Read the current booking task, completion progress, and what remains.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  // ── Human escalation ─────────────────────────────────────────────────────

  request_human_help: {
    type: "function",
    name: "request_human_help",
    description:
      "Request that a Leisure Life person contacts the guest. Only state that help is on the way after this returns successfully.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One sentence on what the guest needs" },
      },
      required: ["reason"],
    },
  },

  transfer_phone_call: {
    type: "function",
    name: "transfer_phone_call",
    description:
      "Transfer this phone call to a human agent at the approved destination. Only say the transfer is happening after this returns successfully.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "One sentence on why the transfer is needed" },
      },
      required: ["reason"],
    },
  },
};

export function buildToolDefinitions(allowedToolIds: string[]): RealtimeToolDefinition[] {
  const definitions: RealtimeToolDefinition[] = [];
  for (const toolId of allowedToolIds) {
    const definition = DEFINITIONS[toolId];
    if (definition) definitions.push(definition);
  }
  return definitions;
}

export function getToolDefinition(toolId: string): RealtimeToolDefinition | null {
  return DEFINITIONS[toolId] ?? null;
}

/** Short spoken acknowledgements while a tool runs. */
const SPOKEN_TOOL_LABELS: Record<string, string> = {
  perplexity_cruise_research: "Let me look that up.",
  cruise_brothers_knowledge: "Let me check what our agency has on that.",
  excursion_finder: "I'm pulling up excursions for that port.",
  cruise_brothers_scraper: "Let me scan the current deals.",
  social_media_insights: "Let me see what travelers are saying.",
  cruise_trend_analysis: "Let me check the latest on that.",
  odysseus_search: "I'm searching live availability now - this takes a moment.",
  pricing_comparator: "Let me run those numbers.",
  showcase_preferences_read: "Let me check what I have for you.",
  showcase_preferences_save: "Noted.",
  showcase_trip_history: "Let me pull up your trips.",
  showcase_booking_draft_prepare: "Adding that to the draft.",
  showcase_payment_handoff_simulated: "Let me bring up the checkout step.",
  booking_field_propose: "Got it.",
  booking_progress_read: "Let me check where we are.",
  request_human_help: "Let me get someone for you.",
  transfer_phone_call: "One moment while I arrange that.",
};

export function getSpokenToolLabel(toolId: string): string {
  return SPOKEN_TOOL_LABELS[toolId] ?? "One moment.";
}

/** Human-readable labels for the tool status rows in the UI. */
const DISPLAY_TOOL_LABELS: Record<string, string> = {
  perplexity_cruise_research: "Researching cruises",
  cruise_brothers_knowledge: "Checking agency knowledge",
  excursion_finder: "Finding excursions",
  cruise_brothers_scraper: "Scanning current deals",
  social_media_insights: "Reading traveler reviews",
  cruise_trend_analysis: "Analyzing cruise trends",
  odysseus_search: "Searching live availability",
  pricing_comparator: "Comparing pricing",
  showcase_preferences_read: "Reading demo preferences",
  showcase_preferences_save: "Saving demo preference",
  showcase_trip_history: "Reading demo trip history",
  showcase_booking_draft_prepare: "Updating demo booking draft",
  showcase_payment_handoff_simulated: "Preparing simulated checkout",
  booking_field_propose: "Proposing a booking value",
  booking_progress_read: "Reading booking progress",
  request_human_help: "Requesting human help",
  transfer_phone_call: "Transferring the call",
};

export function getDisplayToolLabel(toolId: string): string {
  return DISPLAY_TOOL_LABELS[toolId] ?? toolId;
}

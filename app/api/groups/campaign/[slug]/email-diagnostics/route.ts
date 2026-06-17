import { NextRequest, NextResponse } from "next/server";

const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_API_VERSION = "2025-07-15";

const STAGE_METRICS: Record<string, string> = {
  waitlist_confirmation: "LLL Waitlist Confirmation",
  nurture_day3: "LLL Nurture Day 3",
  nurture_day7: "LLL Nurture Day 7",
  threshold_met: "LLL Threshold Met",
  booking_link_ready: "LLL Booking Link Ready",
  campaign_expired: "LLL Campaign Expired",
  booking_confirmed: "LLL Booking Confirmed",
  travel_prep: "LLL Travel Prep",
  final_countdown: "LLL Final Countdown",
  final_itinerary_published: "LLL Final Itinerary Published",
  tour_conductor_announced: "LLL Tour Conductor Announced",
  booking_change: "LLL Booking Change",
  post_cruise_welcome_home: "LLL Post Cruise Welcome Home",
  post_cruise_survey: "LLL Post Cruise Survey",
  alumni_rebooking_invite: "LLL Alumni Rebooking Invite",
};

const FLOW_NAMES_BY_STAGE: Record<string, string[]> = {
  waitlist_confirmation: ["LLL Waitlist Confirmation Flow"],
  nurture_day3: ["Day 3 Niche Deepener"],
  nurture_day7: ["Day 7 Momentum Check"],
  threshold_met: ["Threshold Met"],
  booking_link_ready: ["Booking Link Ready"],
  campaign_expired: ["Campaign Expired"],
  booking_confirmed: ["Booking Confirmed"],
  travel_prep: ["Travel Prep"],
  final_countdown: ["Final Countdown"],
  final_itinerary_published: ["Final Itinerary Published"],
  tour_conductor_announced: ["Tour Conductor Announced"],
  booking_change: ["Booking Change"],
  post_cruise_welcome_home: ["Post Cruise Welcome Home", "Welcome Home"],
  post_cruise_survey: ["Post Cruise Survey"],
  alumni_rebooking_invite: ["Alumni Rebooking Invite"],
};

type KlaviyoJson = {
  data?: unknown;
  included?: unknown;
  errors?: Array<{ detail?: string; title?: string; code?: string; status?: string }>;
};

interface KlaviyoProfile {
  id: string;
  attributes?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    properties?: Record<string, unknown>;
    subscriptions?: {
      email?: {
        marketing?: {
          can_receive_email_marketing?: boolean;
          consent?: string;
          suppression?: unknown[];
          list_suppressions?: unknown[];
        };
      };
    };
    created?: string;
    updated?: string;
  };
}

interface KlaviyoMetric {
  id: string;
  type: "metric";
  attributes?: {
    name?: string;
  };
}

interface KlaviyoEvent {
  id: string;
  attributes?: {
    datetime?: string;
    event_properties?: Record<string, unknown>;
  };
  relationships?: {
    metric?: {
      data?: {
        id?: string;
      };
    };
  };
}

interface KlaviyoFlow {
  id: string;
  attributes?: {
    name?: string;
    status?: string;
    archived?: boolean;
    trigger_type?: string;
    updated?: string;
  };
}

interface KlaviyoFlowAction {
  id: string;
  attributes?: {
    action_type?: string;
    status?: string;
    updated?: string;
  };
}

function getApiKey(): string {
  const key = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  if (!key) throw new Error("KLAVIYO_PRIVATE_API_KEY is not configured.");
  return key;
}

async function klaviyoGet(path: string): Promise<{ status: number; body: KlaviyoJson }> {
  const response = await fetch(`${KLAVIYO_BASE}${path}`, {
    headers: {
      Authorization: `Klaviyo-API-Key ${getApiKey()}`,
      Accept: "application/json",
      Revision: KLAVIYO_API_VERSION,
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: KlaviyoJson = {};
  if (text) {
    try {
      body = JSON.parse(text) as KlaviyoJson;
    } catch {
      body = { errors: [{ detail: text }] };
    }
  }
  return { status: response.status, body };
}

function formatKlaviyoError(status: number, body: KlaviyoJson): string {
  const first = body.errors?.[0];
  return first?.detail || first?.title || first?.code || `Klaviyo request failed with ${status}.`;
}

function getArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function includesText(value: string | undefined, candidates: string[]): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return candidates.some((candidate) => normalized.includes(candidate.toLowerCase()));
}

async function loadProfile(email: string): Promise<KlaviyoProfile | null> {
  const filter = encodeURIComponent(`equals(email,"${email}")`);
  const result = await klaviyoGet(`/profiles/?filter=${filter}&page[size]=1&additional-fields[profile]=subscriptions`);
  if (result.status >= 400) {
    throw new Error(formatKlaviyoError(result.status, result.body));
  }
  return getArray<KlaviyoProfile>(result.body.data)[0] ?? null;
}

async function loadProfileEvents(profileId: string): Promise<Array<Record<string, unknown>>> {
  const filter = encodeURIComponent(`equals(profile_id,"${profileId}")`);
  const result = await klaviyoGet(`/events/?filter=${filter}&include=metric&page[size]=25`);
  if (result.status >= 400) {
    throw new Error(formatKlaviyoError(result.status, result.body));
  }

  const metrics = new Map<string, string>();
  for (const item of getArray<KlaviyoMetric>(result.body.included)) {
    if (item.type === "metric" && item.id) {
      metrics.set(item.id, item.attributes?.name ?? item.id);
    }
  }

  return getArray<KlaviyoEvent>(result.body.data).map((event) => {
    const props = event.attributes?.event_properties ?? {};
    const metricId = event.relationships?.metric?.data?.id ?? "";
    return {
      id: event.id,
      datetime: event.attributes?.datetime,
      metric: metrics.get(metricId) ?? metricId,
      stage: props.stage,
      subject: props.Subject,
      flowId: props.$flow,
      messageId: props.$message,
      inboxProvider: props["Inbox Provider"],
      emailDomain: props["Email Domain"],
    };
  });
}

async function loadRelevantFlows(stage: string): Promise<Array<Record<string, unknown>>> {
  const result = await klaviyoGet("/flows/?page[size]=50");
  if (result.status >= 400) {
    throw new Error(formatKlaviyoError(result.status, result.body));
  }

  const candidates = FLOW_NAMES_BY_STAGE[stage] ?? [];
  const flows = getArray<KlaviyoFlow>(result.body.data).filter((flow) =>
    candidates.length > 0 ? includesText(flow.attributes?.name, candidates) : true,
  );

  const diagnostics: Array<Record<string, unknown>> = [];
  for (const flow of flows) {
    const actionsResult = await klaviyoGet(`/flows/${flow.id}/flow-actions/?page[size]=25`);
    const actions =
      actionsResult.status >= 400
        ? []
        : getArray<KlaviyoFlowAction>(actionsResult.body.data).map((action) => ({
            id: action.id,
            actionType: action.attributes?.action_type,
            status: action.attributes?.status,
            updated: action.attributes?.updated,
          }));
    diagnostics.push({
      id: flow.id,
      name: flow.attributes?.name,
      status: flow.attributes?.status,
      archived: flow.attributes?.archived,
      triggerType: flow.attributes?.trigger_type,
      updated: flow.attributes?.updated,
      actions,
    });
  }
  return diagnostics;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const email = request.nextUrl.searchParams.get("email")?.trim() ?? "";
    const stage = request.nextUrl.searchParams.get("stage")?.trim() ?? "waitlist_confirmation";
    if (!slug) {
      return NextResponse.json({ success: false, error: "Campaign slug is required." }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    const profile = await loadProfile(email);
    const profileEvents = profile ? await loadProfileEvents(profile.id) : [];
    const flows = await loadRelevantFlows(stage);
    const marketing = profile?.attributes?.subscriptions?.email?.marketing;
    const expectedMetric = STAGE_METRICS[stage] ?? null;

    const recentExpectedEvents = expectedMetric
      ? profileEvents.filter((event) => event.metric === expectedMetric)
      : [];
    const recentReceivedEmails = profileEvents.filter((event) => event.metric === "Received Email");
    const relevantFlowIds = new Set(flows.map((flow) => String(flow.id)));
    const latestExpectedAt = recentExpectedEvents[0]?.datetime;
    const latestExpectedMs = typeof latestExpectedAt === "string" ? Date.parse(latestExpectedAt) : Number.NaN;
    const recentRelevantReceivedEmails = recentReceivedEmails.filter((event) => {
      const flowId = typeof event.flowId === "string" ? event.flowId : "";
      const eventMs = typeof event.datetime === "string" ? Date.parse(event.datetime) : Number.NaN;
      const isSameFlow = relevantFlowIds.size === 0 || relevantFlowIds.has(flowId);
      const isAfterExpected = Number.isNaN(latestExpectedMs) || (!Number.isNaN(eventMs) && eventMs >= latestExpectedMs);
      return isSameFlow && isAfterExpected;
    });
    const hasRecentRelevantReceivedEmail = recentRelevantReceivedEmails.length > 0;
    const hasRecentReceivedEmail = recentReceivedEmails.length > 0;
    const priorReceivedForRelevantFlow = recentReceivedEmails.filter((event) => {
      const flowId = typeof event.flowId === "string" ? event.flowId : "";
      const eventMs = typeof event.datetime === "string" ? Date.parse(event.datetime) : Number.NaN;
      const isSameFlow = relevantFlowIds.size > 0 && relevantFlowIds.has(flowId);
      const isBeforeExpected = !Number.isNaN(latestExpectedMs) && !Number.isNaN(eventMs) && eventMs < latestExpectedMs;
      return isSameFlow && isBeforeExpected;
    });
    let likelyCause: string | null = null;
    let recommendedAction: string | null = null;
    if (recentExpectedEvents.length > 0 && !hasRecentRelevantReceivedEmail && priorReceivedForRelevantFlow.length > 0) {
      likelyCause =
        "Klaviyo recorded the trigger event, but did not record a matching Received Email event after it. This profile has received email from the same flow before, so the block is happening inside Klaviyo's flow eligibility/message-send path rather than in our API call.";
      recommendedAction =
        "Check Klaviyo flow history for this profile/event and inspect trigger filters, profile filters, re-entry, message status, and recipient eligibility. Klaviyo's native Send test is a separate preview path and does not prove the metric-triggered flow will send.";
    } else if (recentExpectedEvents.length > 0 && !hasRecentRelevantReceivedEmail && flows.length === 0) {
      likelyCause = "Klaviyo recorded the trigger event, but no matching flow was found by the diagnostic mapping.";
      recommendedAction = "Confirm the flow exists in Klaviyo and update the diagnostic stage-to-flow mapping if the flow name changed.";
    } else if (recentExpectedEvents.length > 0 && !hasRecentRelevantReceivedEmail) {
      likelyCause = "Klaviyo recorded the trigger event, but no downstream Received Email event was found yet.";
      recommendedAction = "Check Klaviyo flow trigger filters, profile filters, message status, and recipient eligibility.";
    }
    const allRelevantFlowsLive =
      flows.length > 0 &&
      flows.every((flow) => {
        const actions = getArray<Record<string, unknown>>(flow.actions);
        const sendActions = actions.filter((action) => action.actionType === "SEND_EMAIL");
        return (
          flow.status === "live" &&
          flow.archived === false &&
          sendActions.length > 0 &&
          sendActions.every((action) => action.status === "live")
        );
      });

    return NextResponse.json({
      success: true,
      diagnostics: {
        slug,
        email,
        stage,
        expectedMetric,
        profile: profile
          ? {
              id: profile.id,
              created: profile.attributes?.created,
              updated: profile.attributes?.updated,
              firstName: profile.attributes?.first_name,
              lastName: profile.attributes?.last_name,
              campaignSlug: profile.attributes?.properties?.campaign_slug,
              canReceiveEmailMarketing: marketing?.can_receive_email_marketing,
              consent: marketing?.consent,
              suppressionCount: marketing?.suppression?.length ?? 0,
              listSuppressionCount: marketing?.list_suppressions?.length ?? 0,
            }
          : null,
        flowStatus: {
          allRelevantFlowsLive,
          flows,
        },
        recentExpectedEvents,
        recentRelevantReceivedEmails,
        hasRecentRelevantReceivedEmail,
        priorReceivedForRelevantFlow,
        likelyCause,
        recommendedAction,
        recentReceivedEmails,
        hasRecentReceivedEmail,
        recentEvents: profileEvents,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Diagnostics failed." },
      { status: 500 },
    );
  }
}

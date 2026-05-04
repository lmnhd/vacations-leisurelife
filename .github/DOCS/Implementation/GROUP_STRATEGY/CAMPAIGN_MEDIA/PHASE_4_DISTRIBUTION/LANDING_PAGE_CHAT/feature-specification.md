# Landing Page Chat Feature Specification

## Purpose

Design a Tour Conductor portal for campaign landing pages that acts as a shared group chat, notification signup portal, campaign status center, and launch prep data collector.

## Requirements

1. **Answer any cruise or campaign logistics question**
   - TC must have access to campaign landing page metadata, itinerary details, schedule, capacity, booking process, and support pathways.
   - The system should also answer broader questions about the program, next steps, and related campaigns.

2. **Add guests to email and SMS notifications**
   - TC should detect when a visitor asks to join updates and offer opt-in for email and SMS if not already subscribed.
   - This should be handled as a usable capability, not just conversational text.
   - Use existing campaign lead / notification flow data structures where possible.

2.a **Gated chat access until signup**

- The chat surface may be visible on page load, but guests cannot send messages until they sign up.
- Show an elegant invitation message explaining that signing up is required to talk to the Tour Conductor.
- Preserve the shared history view so the guest can still read prior conversation before signing up.

3. **Persist the entire conversation for every visitor**
   - The chat must be scoped to the landing page campaign and replay the full shared conversation history to anyone arriving later.
   - Visitors should see all prior questions, answers, and suggestions so the group context is preserved.
   - Each campaign starts with a starter message from a "ghost user" asking "What is this cruise about?" followed by the Tour Conductor's explanatory response.

4. **Serve as a campaign status portal and discovery point**
   - The portal should let guests check cruise progress, status updates, and current capacity.
   - It should also promote other active or related campaigns when appropriate.
   - The TC persona should be able to surface other campaign options in the same chat session.

5. **Collect launch-ready campaign data**
   - Track guest intent and commitment signals (e.g. interest level, questions about deposits, group size, urgency).
   - Capture itinerary and activity suggestions for later campaign planning.
   - Save contact opt-ins, SMS consent, and email signup data as structured campaign lead data.

## Proposed Architecture

### Frontend

- A landing page chat widget that uses the campaign slug or landing page identifier as the shared `sessionId`.
- The chat interface is visible on page load, but messaging is locked until the guest signs up.
- An elegant onboarding message is shown in place of the input area explaining that sign-up is required to talk to the Tour Conductor.
- The chat window must be designed to fit neatly within the campaign's Visual Systems spec, using the same typography, spacing, and visual treatment as the selected system:
  - **System 4 (Modern Brand)**: Modular card layout with Geist sans, Newsreader italic accents, JetBrains Mono labels, and sharp accent colors.
  - **System 1 (Editorial Magazine)**: Magazine-style sidebar with Newsreader serif, oxide-red folios, and cream paper texture.
  - **System 2 (Travel Nostalgia)**: Postcard or baggage tag artifact with manila stock, deckle edges, cursive ink, and postmark elements.
  - **System 3 (Indie Zine)**: Zine collage with photocopied grain, masking tape, polaroid frames, and marker scribbles.
- A shared history timeline component that loads the latest conversation for the campaign.
- A notification signup CTA inside the chat UI for email and SMS updates.
- A campaign status panel inside the chat shell showing:
  - current threshold / booking progress
  - next milestone
  - notification count
  - related campaign links

### Backend

- Extend the existing `app/api/chat` pipeline to support campaign-level context and shared sessions.
- Add a campaign-specific chat storage layer for shared sessions and messages.
- Create a support tool for notification opt-in, e.g. `subscribeToCampaignUpdates`.
- Create a tool or extractor for `campaignSuggestion` data in user messages.
- **Deep Campaign Context**: For each campaign, inject comprehensive context including research behind crews, campaign brief, blueprint thought process, and niche opportunity details to enable informed responses.
- **Conversation Scrubbing System**: Implement automated moderation to clean redundant or negative content that accumulates over time, maintaining conversation quality. This system also acts as a data puller, extracting interesting user comments and insights to populate formatted data files over time.

### Data

- Group chat session is keyed by campaign landing page slug: `campaign-chat://[slug]`.
- Store messages with:
  - `role`: user / assistant
  - `displayName`: guest label or Tour Conductor
  - `isNotificationSignup`: boolean
  - `suggestionCategory`: excursion / activity / project / status request
  - `isStarterMessage`: boolean (for the initial ghost user question)
- Store lead/contact events in campaign lead tables for email/SMS consent.
- Store extracted launch-ready facts from chat turns as structured campaign metadata.

## TC Portal Behavior

### Primary Chat Behavior

- TC always answers cruise logistics and campaign questions first.
- TC encourages user suggestions for excursions, get-togethers, and group projects.
- TC actively encourages guests to invite friends so the group can fill faster and the trip becomes more fun for everyone.
- TC can assist with friend invitations by collecting emails and offering to send invitation requests on the guest's behalf.
- TC keeps tone collaborative: "This group is building the trip together. Tell me what you'd like to see, and I’ll help record it."
- Each campaign starts with a starter conversation: a ghost user asks "What is this cruise about?" and TC provides a comprehensive explanation of the cruise.
- For unsigned guests, the chat window should be visible but disabled, with a polished message inviting signup before speaking to the Tour Conductor.

### Notification Opt-in Behavior

- If a visitor asks for updates, TC responds with:
  - "I can add you to our campaign email and SMS list. What is the best email or phone number to use?"
- If the visitor provides contact info, save it in campaign lead records and confirm opt-in.
- If consent is required, TC should explicitly ask for permission before adding.

### Shared History Behavior

- Every return visitor or new visitor sees the same conversation transcript.
- The system should load the last N messages quickly and allow pagination if the conversation grows large.

### Status Portal Behavior

- TC can answer questions like:
  - "What is the current trip status?"
  - "How close are we to filling the group?"
  - "What are the next booking milestones?"
- TC can recommend other campaigns when a guest asks about alternative trips or related themes.

### Data Collection Behavior

- Extract and store:
  - guest travel priorities and activity ideas
  - preferred excursion types
  - move-in urgency and booking intent
  - email/SMS opt-ins and campaign notification interest
- **Automated Insight Extraction**: Conversation scrubbing system identifies and extracts valuable user comments, preferences, and suggestions for structured data collection over time.
- Use these insights later in campaign launch planning, itinerary design, and nurture messaging.

## Integration Notes

- Existing chat pipeline can be reused, but the campaign landing page chat must support a different session model than per-user chat.
- A campaign landing page chat is more like a shared public session than a one-to-one chat.
- If the system already supports tools, implement notification signup and campaign discovery as tools rather than free-form text only.
- When landing page behavior expands beyond simple Q&A into campaign workflows, adopt the hero chat agent/skill architecture as the preferred escalation path.

## Next Technical Steps

1. Design the campaign session key / shared history model.
2. Add campaign landing page metadata into the prompt assembler and TC persona.
3. Build a notification opt-in tool with email/SMS consent capability.
4. Create a campaign suggestion extraction process.
5. Add a chat landing page component that shows shared history and status.
6. Implement deep campaign context injection (research, briefs, blueprint reasoning).
7. Build automated conversation scrubbing system for content moderation and insight extraction.

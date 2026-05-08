# Landing Page Chat System Brainstorm

> **Active spec for the rebuild:** See [GUEST_PORTAL_REDESIGN.md](./GUEST_PORTAL_REDESIGN.md). The page is being reframed from "landing page with sidebar chat widget" to "Interactive Guest Portal with full-width Group Chat Hall as centerpiece" — and gains a manual visual-flavor override + audition workflow so any of the four Claude Design systems can be selected per campaign before launch.
>
> The brainstorm and feature notes below remain accurate as the *behavioral* requirements (TC persona, signup gating, shared history, idea capture). Phase A of the redesign ships the structural reframe and audition mechanism. Phase C is where the chat-as-data-collector requirements in this README get their full backend wiring.

## Overview

Implement a group chat system on campaign landing pages where visitors can interact with an AI "tour conductor" to ask questions about the cruise and suggest activities, excursions, and projects. All visitors to the same landing page share the same conversation, fostering community and co-creation of the cruise experience.

## Key Features

- **Group Chat**: Shared conversation visible to all landing page visitors
- **AI Tour Conductor**: Contextual responses based on campaign template
- **Activity Suggestions**: Encourage users to propose excursions, get-togethers, projects
- **Crew Building**: Use guest input to develop itineraries and activities
- **Real-time Updates**: Live chat experience

## Existing Chat System Analysis

The codebase has a robust chat system in `lib/chat/` with:

- DynamoDB storage for sessions
- LLM integration (OpenAI/Claude)
- Pipeline architecture with tools, memory, etc.
- Types and utilities

We can reuse this pipeline for the landing page chat.

## Architecture Ideas

- **Frontend**: React component integrated into landing page
- **Backend**: API routes using existing chat pipeline
- **Data**: Campaign context injected into chat prompts
- **Storage**: Shared session per campaign landing page
- **Real-time**: WebSocket or polling for updates

## Implementation Steps

1. Create shared chat session per campaign
2. Integrate campaign data into chat context
3. Build tour conductor persona/prompts
4. Add suggestion collection and aggregation
5. Implement real-time UI updates
6. Add moderation and safety features

## Challenges

- Scaling real-time chat for multiple campaigns
- Ensuring appropriate AI responses for group context
- Managing user-generated content for itinerary building
- Privacy and data handling for shared conversations

## Next Steps

- Review existing chat pipeline in detail
- Design campaign context injection
- Prototype tour conductor prompts
- Plan UI/UX for group chat interface

## User Requirements to Capture

- TC must answer any question about the cruise or campaign logistics
- TC should add guests to email and SMS notifications when requested
- The conversation must persist for every visitor to see the full shared history
- The portal should also act as a campaign status center and discovery point for other campaigns
- TC must collect launch-ready data from guest activity suggestions and notification signups

# Landing Page Chat Architecture Ideas

## Core Concept

Transform the existing chat pipeline into a group chat system where:

- One shared conversation per campaign landing page
- AI tour conductor responds contextually
- All visitors see real-time updates
- Guest suggestions feed into itinerary development

## Key Components

### 1. Shared Session Management

- **Campaign Session ID**: Generate based on campaign slug/URL
- **Broadcast Mechanism**: Use WebSockets or Server-Sent Events for real-time updates
- **Storage**: Extend existing DynamoDB chat storage to handle group messages

### 2. Campaign Context Integration

- **Context Resolver**: Modify to inject campaign template data instead of user profile
- **Prompt Assembly**: Include cruise theme, destination, dates, etc. in system prompts
- **Tour Conductor Persona**: Create specialized prompts for encouraging activity suggestions

### 3. Group Chat Features

- **Anonymous Participation**: No login required for landing page visitors
- **Message History**: Shared history visible to all
- **Real-time UI**: React component with live updates
- **Moderation**: Basic filtering for inappropriate content

### 4. Suggestion Collection

- **Activity Extraction**: Parse user messages for excursion/project ideas
- **Aggregation**: Store suggestions in campaign database
- **Feedback Loop**: Tour conductor acknowledges and builds on suggestions

## Technical Implementation

### Frontend (Next.js)

```tsx
// LandingPageChat component
- Use existing chat UI components
- WebSocket connection for real-time updates
- Campaign context passed as props
```

### Backend (API Routes)

```ts
// /api/campaign-chat/[campaignId]
- Reuse chat pipeline with campaign-specific context
- Handle group session management
- Broadcast messages via WebSockets
```

### Data Flow

1. Visitor loads landing page → Gets campaign session ID
2. Sends message → API processes with campaign context
3. AI responds → Message stored and broadcasted
4. All connected clients update UI

## Challenges & Solutions

- **Scalability**: Use Redis for pub/sub instead of direct DB polling
- **Context Injection**: Create campaign context resolver similar to user context
- **Real-time**: Implement WebSocket server or use Socket.io
- **Moderation**: Add content filtering before broadcasting

## Integration Points

- **Campaign Templates**: Pull theme, destinations, dates from campaign data
- **Existing Chat Pipeline**: Reuse LLM calls, response processing, tools
- **Database**: Extend Prisma schema for chat messages per campaign
- **UI Components**: Adapt existing chat components for group view</content>
  <parameter name="filePath">c:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive\.github\DOCS\Implementation\GROUP_STRATEGY\CAMPAIGN_MEDIA\PHASE_4_DISTRIBUTION\LANDING_PAGE_CHAT\architecture-ideas.md

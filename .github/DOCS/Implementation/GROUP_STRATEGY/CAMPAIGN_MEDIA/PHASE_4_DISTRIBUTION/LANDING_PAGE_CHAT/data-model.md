# Data Model for Landing Page Chat

## Overview

Extend existing chat storage to support group conversations per campaign, with real-time broadcasting and suggestion aggregation.

## Database Schema Extensions

### Campaign Chat Sessions

```prisma
model CampaignChatSession {
  id                String   @id @default(cuid())
  campaignId        String
  campaignSlug      String   @unique
  createdAt         DateTime @default(now())
  lastActivityAt    DateTime @updatedAt
  messageCount      Int      @default(0)
  activeConnections Int      @default(0)

  // Relations
  messages          CampaignChatMessage[]
  suggestions       CampaignSuggestion[]

  @@map("campaign_chat_sessions")
}
```

### Campaign Chat Messages

```prisma
model CampaignChatMessage {
  id            String   @id @default(cuid())
  sessionId     String
  userId        String?  // null for anonymous guests
  userDisplay   String   // "Guest 1", "Tour Conductor", etc.
  content       String
  role          String   // "user" | "assistant"
  timestamp     DateTime @default(now())
  isSuggestion  Boolean  @default(false)

  // Relations
  session       CampaignChatSession @relation(fields: [sessionId], references: [id])

  @@map("campaign_chat_messages")
}
```

### Campaign Suggestions

```prisma
model CampaignSuggestion {
  id          String   @id @default(cuid())
  sessionId   String
  messageId   String
  category    String   // "excursion", "activity", "project", "get-together"
  title       String
  description String?
  votes       Int      @default(0)
  createdAt   DateTime @default(now())

  // Relations
  session     CampaignChatSession @relation(fields: [sessionId], references: [id])

  @@map("campaign_suggestions")
}
```

## Real-time Broadcasting

- **WebSocket Server**: Maintain connections per campaign session
- **Redis Pub/Sub**: For scaling across multiple server instances
- **Connection Tracking**: Update activeConnections count

## Data Flow

1. **Message Received**: Store in CampaignChatMessage
2. **AI Processing**: Generate response using campaign context
3. **Response Stored**: Add assistant message to database
4. **Broadcast**: Send to all connected WebSocket clients
5. **Suggestion Extraction**: Parse and store activity suggestions

## Migration from Existing Chat

- **Session Mapping**: Create campaign sessions separate from user sessions
- **Context Injection**: Modify pipeline to use campaign data instead of user profile
- **Storage Abstraction**: Extend ChatStorageService for campaign-specific operations

## Performance Considerations

- **Message Pagination**: Load recent messages only for chat history
- **Connection Limits**: Cap concurrent connections per campaign
- **Cleanup**: Archive old sessions after campaign completion
- **Indexing**: Optimize queries for real-time message fetching

## Privacy & Security

- **Anonymous Users**: No PII stored for landing page visitors
- **Content Moderation**: Flag and filter inappropriate messages
- **Rate Limiting**: Prevent abuse from single IP addresses
- **Data Retention**: Configurable retention periods for chat data</content>
  <parameter name="filePath">c:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive\.github\DOCS\Implementation\GROUP_STRATEGY\CAMPAIGN_MEDIA\PHASE_4_DISTRIBUTION\LANDING_PAGE_CHAT\data-model.md

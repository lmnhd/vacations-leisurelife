# Landing Page Chat UI/UX Design

## Layout Integration

- **Position**: Fixed sidebar or overlay on landing page
- **Trigger**: "Chat with Tour Conductor" button or auto-show after scroll
- **Responsive**: Mobile-friendly collapsible chat

## Group Chat Interface

```
┌─────────────────────────────────────┐
│ 🚢 Tour Conductor Chat              │
├─────────────────────────────────────┤
│ Guest: What is this cruise about?    │
│ Conductor: This is a special [NICHE] │
│ cruise departing [DATE] from [PORT]. │
│ We're sailing to [DESTINATIONS]...   │
├─────────────────────────────────────┤
│ Guest1: When does the cruise leave? │
│ Conductor: March 15th from Miami!   │
│ Guest2: Let's do a beach cleanup!   │
│ Conductor: Great idea! Who's in?    │
├─────────────────────────────────────┤
│ 💬 Type your message...             │
└─────────────────────────────────────┘
```

## Key Features

- **Real-time Messages**: Live updates without refresh
- **Anonymous Users**: No login required, show as "Guest" + number or emoji
- **Message Threads**: Optional threading for activity suggestions
- **Activity Feed**: Highlight suggestions with special styling
- **Conductor Avatar**: Distinctive icon/avatar for AI responses

## User Experience Flow

1. **Entry**: Visitor sees chat widget on landing page with starter conversation already visible
2. **Starter Context**: Guest sees the initial "What is this cruise about?" question and TC's comprehensive response
3. **Onboarding**: Brief intro message from conductor
4. **Interaction**: Ask questions, get instant responses
5. **Suggestion Mode**: Encouraged to propose activities
6. **Community Building**: See others' ideas and conductor's responses

## Technical Considerations

- **WebSockets**: For real-time message delivery
- **Optimistic UI**: Show messages immediately, handle failures
- **Rate Limiting**: Prevent spam from landing page visitors
- **Offline Mode**: Queue messages when connection lost
- **Accessibility**: Screen reader support, keyboard navigation
- **Deep Context Injection**: Model receives comprehensive campaign research, briefs, and blueprint reasoning for informed responses
- **Automated Moderation**: Background system scrubs redundant or negative content to maintain conversation quality, while simultaneously extracting valuable user insights, preferences, and suggestions for structured data collection.

## Visual Design

- **Visual Systems Compliance**: The chat window must fit cleanly within the campaign's Visual Systems document and borrow the same typography, spacing, and artifact treatment.
- **System-Specific Integration**:
  - **System 4 (Modern Brand)**: Use Geist sans, Newsreader italic accents, JetBrains Mono labels. Dark mode glass with sharp accent color. Chat as a modular card with type-driven layout.
  - **System 1 (Editorial Magazine)**: Newsreader serif, oxide-red folios, cream paper texture. Chat styled as a magazine sidebar or contributor card with editorial restraint.
  - **System 2 (Travel Nostalgia)**: Manila tag stock, deckle edges, cursive ink, postmark circular. Chat as a postcard or baggage tag artifact with handwritten elements.
  - **System 3 (Indie Zine)**: Photocopied grain, masking tape, polaroid frames, marker scribbles. Chat as a zine collage with tilted elements and ripped paper edges.
- **Theme Integration**: Match landing page colors/branding and respect the selected System 4 / System 1 / System 2 / System 3 design language.
- **Cruise Themed**: Use ship, wave, or destination icons only as accent details, not as the primary brand style.
- **Engaging Animations**: Subtle entrance animations for new messages
- **Mobile Optimized**: Touch-friendly interface for phones

## Moderation UI

- **Content Filtering**: Client-side basic checks
- **Report Feature**: Allow reporting inappropriate messages
- **Admin Override**: Ability to moderate from dashboard
- **Conversation Scrubbing**: Automated system to clean redundant or negative content that accumulates over time, while also extracting valuable user insights and preferences for ongoing data collection.

## Analytics Integration

- **Engagement Tracking**: Message count, user participation
- **Suggestion Metrics**: Track popular activity ideas
- **Conversion Funnel**: How chat influences bookings</content>
  <parameter name="filePath">c:\Users\cclem\Dropbox\Source\Projects-24\Leisure_Life_Interactive\.github\DOCS\Implementation\GROUP_STRATEGY\CAMPAIGN_MEDIA\PHASE_4_DISTRIBUTION\LANDING_PAGE_CHAT\ui-design.md

## Pitch
- Easiest cruise booking
- Exhaustive cruise line scope
- Maximizes A+ vacation potential
- Themed chat experience

## Product
- Interactive learning chat agent
- Builds personalized cruise packages
- Feels like an interactive presentation
- Incorporates light trivia & mood lighting
- Powered by Cruise Brothers Travel Agency

## Interface (Hero Chat)
- Split presentation window (media vs text)
- Hero-style text display
- Typewriter effect for short text
- Fade-in effect for long text
- Dynamically shrinking text size
- Moving text container to accommodate media
- Voice mode media emphasis replacement
- Collapsed, expandable chat history sidebar
- Manual chat history reversion
- Seamless, transitionless text/voice switching

## Usage Experience
- Initial interaction sets expectation: agent learns/remembers
- Voice mode strongly encouraged
- Subsequent interactions recap goals & continue progress
- Intelligent investigative search for specific requests
- Brief package presentations in-chat
- Comprehensive package details linked via email
- Single-click payment links
- Automated booking & travel agent backend processing

## Presentation & Atmosphere
- PowerPoint-like organized presentation
- Friendly, capable host persona
- Dynamic background slideshows (ships, destinations)
- Mood-matched background transitions (Light/Sunny to Dark/Nightlife)
- Environment variables: Time (Day/Night), Setting (Indoor/Outdoor), Region (Tropical/Arctic/etc.)

## Data Collection
- Gradual, conversational secure data ingestion (CC, SSN)
- Immediate pre-auth database tracking
- Delayed association of pre-auth data to authenticated user
- Full-lifecycle travel companion (pre, during, post-cruise)
- Granular preference tracking (allergies, entertainment, etc.)

## Data & Memory Tech
- Vector DB or JSON in-memory embeddings
- Semantic search for complex insights
- Standard DB queries for initial interactions
- Automated special/perk scraping system
- Deep research & pricing advantage aggregation

## Payment System
- Automated processing or FlexPay
- Secure secret credit card storage
- Direct-to-cruiseline payment links
- Ultra-low redirect checkout flow
- Rigorous payment flow testing methodology needed

## Chat Architecture & Prompting
- JSON-based logic tree prompting
- Real-time developer readable/editable
- Dynamic 'Agent Skills' architecture
- Isolated, modular context rules (e.g., wheelchair constraints)
- Zero hardcoded prompt instructions in codebase
- Template-driven JSON connections
- Browser WebRTC primary focus (Phone secondary)

## Chat Flows
- **Fast Booking Flow**: Direct package creation from specific requests
- **Onboarding Flow**: Gradual preference profile building
- Adaptive questions based on past cruise experience
- Mandatory early trust building
- Mandatory Guest Info ingestion (GUEST_INFO.json)

## System Must-Haves
- Digital ID scanning & ingestion
- Thoughts Widget: real-time AI logic streaming
- Developer Prompt Preview: full assembled prompt display

## Exploratory Features
- Offline Mode: IndexedDB itinerary/info pre-pulling
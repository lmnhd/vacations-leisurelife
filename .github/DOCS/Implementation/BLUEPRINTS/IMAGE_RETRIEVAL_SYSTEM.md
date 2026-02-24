# Blueprint: Image Retrieval System

## Overview
The Hero Chat interface requires dynamic, high-quality visuals to create a premium, interactive presentation effect. Since the primary booking data source (Odysseus) does not provide comprehensive raw image URLs, we require a dedicated, intelligent Image Retrieval and Caching System.

This system will govern the retrieval and display of Cruise Ships, Destinations, and conversational "Mood Backgrounds" seamlessly during the chat flow.

## 1. Core Strategies

### A. Specific Ship & Destination Imagery
For highly specific entities like "Carnival Elation Balcony Cabin", exact port locations, and ship exteriors:
- **Retrieval Mechanism**: On-the-fly requests using **Google Custom Search API** (or SerpApi for Google Images). This allows us to use highly specific keywords and get extremely relevant, high-resolution results instantly.
- **Caching (`MediaCache`)**: To minimize API costs and reduce latency for common destinations and popular ships, retrieved URLs will be cached in the database mapped to the specific search query or internal ID.

### B. Mood & Background Imagery (Thematic)
For dynamic background transitions (e.g., Night/Day, Indoor/Outdoor, Tropical, Atmospheric) that match the chat's context:
- **Retrieval Mechanism**: A specially pre-generated set of high-quality, AI photo-realistic images. These images will be carefully prompted to match particular scenery types and stored locally or on a cloud CDN (e.g., AWS S3). 
  - *Note: The actual generation of these AI images will primarily execute during the 'Chat Flow' development phase.*
- **Control**: The agent will control the background transitions by selecting the appropriate pre-generated image based on the current conversation's mood and context. This guarantees instant load times and perfect visual aesthetics without AI generation artifacts or latency during the presentation.

## 2. System Architecture

The system will center around a core Next.js service: `MediaManager`.

### Component Breakdown
1. **`lib/services/media/MediaManager.ts`**: The central coordinator route/service.
2. **`lib/services/media/providers/google-images.ts`**: Handles the direct integration and querying of the Google API.
3. **Database Layer (`prisma/schema.prisma`)**:
   - `MediaCache`: A model to store `{ query, type, url, createdAt }` to prevent redundant external API calls.

### Integration with Chat Flow
1. **Agent Action**: The chat agent concludes that it needs to show the user a specific ship cabin, OR it needs to change the background mood to "Tropical Sunset".
2. **API Request**: The UI/Agent makes an internal request to `/api/media?query=Carnival+Mardi+Gras+Balcony&type=ship` or requests the `tropical-sunset` preset.
3. **Manager Resolution**: `MediaManager` checks the local `MediaCache` database or local preset asset library.
4. **Fallback/Fetch**:
    - If a specific ship/destination isn't cached, it hits the Google API, caches the resulting image URL, and returns it.
    - If a mood is requested, it instantly returns the CDN path to the pre-generated AI image.
5. **UI Update**: The Hero Chat interface gracefully fades/transitions the requested media into the presentation window.

## 3. Future Pipeline Extensions
- Add background cron jobs to preemptively search and cache images for the top 50 most popular cruise packages retrieved from Odysseus.
- Create an internal Admin UI to allow staff to manually override or select preferred images for specific cache queries (e.g., ensuring the absolute best photo is always used for "Miami Port").

# Google Ads Distribution Strategy & Concept

## Core Philosophy: Contextual Interception & Custom Intent
The primary goal of our Google Ads integration is **NOT** to target generic travel or cruise searchers. Instead, we focus on **Contextual Interception** by targeting users who are deeply engaged in the specific hobby or lifestyle relevant to the group vacation. 

For example, instead of targeting "plant cruise," we target hyper-specific Custom Intent keywords like "rare monstera cuttings" and specific niche YouTube channels. We offer a low-pressure, vacation-first experience wrapped around their existing interests.

## Technical Architecture & Pipeline

### 1. Authentication & Account Structure
*   **Manager Account Model:** The system uses a Google Ads Manager Account (467-554-8535) that is linked to a Standard Account (557-886-0884). This allows the app to manage campaigns via a login_customer_id without needing the primary owner's direct OAuth login every time.
*   **Token Storage:** OAuth tokens are securely persisted in the lll-shadow-campaigns DynamoDB table under the ACCOUNT#business label using the provider-token-store.ts. (Previously managed via Clerk).
*   **Inline Client:** The GoogleAdsApi client is instantiated dynamically at dispatch time using environment variables (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_MANAGER_ID, etc.) and the refresh token fetched from DynamoDB.

### 2. LLM-Driven Targeting Generation
Before interacting with the Google Ads API, the system uses an LLM structured object generation (generateGoogleAdsTargeting) to dynamically create the targeting and ad copy based on the Campaign Blueprint.
*   **Keywords:** Generates 5-8 hyper-specific Custom Intent keywords.
*   **Placements:** Generates 3-5 specific placement URLs (YouTube channels, niche blogs).
*   **Ad Copy:** Generates strictly constrained copy for a Responsive Display Ad:
    *   3 Short Headlines (max 30 chars)
    *   1 Long Headline (max 90 chars)
    *   2 Descriptions (max 90 chars)
    *   Business Name (max 25 chars)

### 3. Automated Draft Creation Flow
When a user runs a dispatch, the system automatically builds the campaign in a **PAUSED** state (Draft). The pipeline follows these exact steps in campaign.ts:
1.  **Asset Upload:** Fetches the campaign's active Hero Image from the media manifest and uploads it to the Google Ads Asset Library as an IMAGE asset.
2.  **Campaign Budget:** Creates a standard delivery budget (e.g., 5,000,000 micros = $5).
3.  **Display Campaign:** Creates a Display-channel campaign linked to the budget, set to PAUSED.
4.  **Ad Group:** Creates an Ad Group within the campaign with a defined CPC bid (e.g., 1,000,000 micros = $1), set to PAUSED.
5.  **Responsive Display Ad:** Assembles the ad using the uploaded Hero Image, the LLM-generated headlines/descriptions, and sets the final URL to the campaign's landing page (/groups/[slug]).

## Error Handling & Resiliency
*   **LLM Token Limits:** The LLM prompt enforces strict array lengths (e.g., exactly 5-8 keywords) and provides explicit JSON structure templates to prevent max_tokens exhaustion and schema validation failures.
*   **OAuth Scopes:** Ensures the offline access type and consent prompts are used to guarantee a long-lived efresh_token is retrieved and stored in DynamoDB.

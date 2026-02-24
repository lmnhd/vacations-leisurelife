## The Recommendation: Clerk
For this specific project, Clerk is the superior choice over Auth.js or Native auth for three reasons:

Multi-Modal Identity: Since you want a seamless transition between Voice and Text (WebRTC), Clerk’s specialized hooks (useUser, useAuth) make it easy to sync the user state across different interface components without manually managing session tokens in your socket connections.

Progressive Profiling: You mentioned starting with an "unauthenticated table" and connecting it later. Clerk handles "Guest to User" conversion gracefully through their Metadata API, allowing you to attach the temporary session ID to a permanent account once they "connect" their data.

Bot Detection: Since this is an AI-heavy tool, you’ll likely face bot scraping. Clerk has sophisticated, built-in bot protection that would be a nightmare to build natively.

## Implementation Strategy
For the "Interactive Travel Agent," the auth flow should look like this:

### 1. The "Shadow" User (Initial Phase)
Action: Do NOT force a login on the first chat.

Tech: Use a fingerprint or anonymousId stored in IndexedDB (as you did with AI Beats).

Storage: Write their initial travel preferences to your PostgreSQL database under this temporary ID.

### 2. The "Handshake" (Authentication Trigger)
Action: Trigger Clerk authentication only when the agent needs to "remember this for next time" or when the user enters the Data Collection phase (SSN, Passport, etc.).

Tech: Use Clerk’s SignUp component. Once authenticated, trigger a Prisma transaction to migrate the "Shadow" data to the new clerkId.

### 3. Sensitive Data Vaulting
Warning: Do not store Credit Cards or SSNs directly in Clerk or your primary Postgres DB.

Tech: Use Clerk's Private Metadata only for internal flags. For the actual sensitive data, use a dedicated vaulting service (like PCI Vault or Stripe's secure storage) and reference the token in your user table.
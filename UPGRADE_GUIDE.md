# NEXT.JS UPGRADE & CLERK CONFIGURATION GUIDE

## What Was Done

✅ **Next.js Upgraded**: 14.0.3 → 15.x (latest)
✅ **React Updated**: 18.x (maintained for Clerk compatibility)
✅ **Clerk Updated**: 4.27.2 → 6.37.2 (latest)
✅ **ESLint Config Updated**: Latest version
✅ **Middleware Updated**: Converted from deprecated `authMiddleware` to `clerkMiddleware` (v6 pattern)
✅ **Created**: `.env.local.example` template

## The Error You Were Experiencing

```
⨯ Missing Clerk Secret Key or API Key. 
Go to https://dashboard.clerk.com and get your key for your instance.
```

This error occurs because:
1. Clerk needs `CLERK_SECRET_KEY` (server-side) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (client-side) in your environment
2. These keys are missing from your `.env.local` file
3. Clerk initializes on app startup and checks for these keys

## How to Fix the Error

### Step 1: Get Your Clerk Keys

1. Go to **[https://dashboard.clerk.com](https://dashboard.clerk.com)**
2. Log in to your account or create one
3. Select your application
4. Navigate to **API Keys** (usually in the sidebar)
5. Copy the following:
   - **Publishable Key** (starts with `pk_`)
   - **Secret Key** (starts with `sk_`)

### Step 2: Create `.env.local`

Create a new file in your project root called `.env.local`:

```bash
# Copy .env.local.example and fill in the values
cp .env.local.example .env.local
```

### Step 3: Fill in Your Environment Variables

Edit `.env.local` and add your actual keys:

```env
# Clerk Authentication (REQUIRED)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your_actual_key_here
CLERK_SECRET_KEY=sk_live_your_actual_secret_here

# Optional: Clerk redirect URLs (only if not using defaults)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Database
DATABASE_URL=your_database_connection_string

# Add other API keys as needed
OPENAI_API_KEY=your_key
STRIPE_SECRET_KEY=your_key
```

### Step 4: Restart Your Dev Server

Once you've added the environment variables:

```bash
# Stop the current dev server (Ctrl+C)
# Then restart it
npm run dev
```

## Important Notes

⚠️ **NEVER commit `.env.local`** to version control
- `.env.local` is already in `.gitignore`
- This file contains sensitive secrets

✅ **Use `.env.local.example`** as a template
- Share this file with your team
- Colleagues can copy it and add their own keys

## Clerk Authentication Setup

The app now uses Clerk for authentication. Ensure your layouts have the `ClerkProvider`:

```tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

## API Routes Using Clerk

If you have protected API routes, use:

```tsx
import { auth } from "@clerk/nextjs/server";

export async function GET(req: Request) {
  const { userId } = await auth();
  
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Your protected logic here
}
```

## Breaking Changes in Clerk v6

### Middleware Update (CRITICAL)

The old `authMiddleware` is deprecated. Your middleware has been updated to use `clerkMiddleware`:

**Before (v4):**
```typescript
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: ["/", "/api/contact"],
});
```

**After (v6):**
```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth().protect();
});
```

### API Routes

For protected API routes, use the updated `auth()` function:

```typescript
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Protected route logic
}
```

### Components

Client-side components remain mostly the same:

```typescript
import { useAuth, UserButton } from "@clerk/nextjs";

export function MyComponent() {
  const { userId, isLoaded } = useAuth();
  
  if (!isLoaded) return <div>Loading...</div>;
  if (!userId) return <div>Not authenticated</div>;
  
  return <div>Welcome!</div>;
}
```

| Error | Solution |
|-------|----------|
| `Missing Clerk Secret Key` | Add `CLERK_SECRET_KEY` to `.env.local` |
| `Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to `.env.local` |
| `Fast Refresh had to perform a full reload` | Changes detected in middleware/env vars; normal behavior |
| `Serializing big strings impacts performance` | Minor webpack warning; can be ignored |

## Next Steps

1. Configure your Clerk instance URLs in Dashboard
2. Set up authentication flows (sign-in, sign-up, sign-out)
3. Implement protected routes using Clerk middleware
4. Test authentication with the app

## Documentation Links

- [Clerk Next.js Documentation](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk API Keys](https://dashboard.clerk.com/api-keys)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

# Voice Server Deployment Checklist

## Current Status
- ✅ Code is ready (`backend/realtime_voice/`)
- ✅ `schedule_visit` tool is configured
- ❌ Voice server NOT deployed (blocking phone calls)
- ✅ Frontend deployed on Vercel

## Step-by-Step Deployment

### 1. Deploy Voice Server to Render.com

**Why Render?** AWS App Runner blocks WebSocket (returns 403). Render.com has native WebSocket support.

#### Steps:
1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New +** > **Web Service**
3. Connect your repository
4. Configure:

| Setting | Value |
|:--------|:------|
| **Name** | `your-voice-server` |
| **Root Directory** | `backend/realtime_voice` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free (or Starter $7/mo for no cold starts) |
| **Region** | US East (Virginia) |

5. **Environment Variables** (Add these in Render dashboard):
   ```bash
   OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
   PORT=5050
   VOICE=alloy
   FRONTEND_URL=https://your-frontend-url.vercel.app
   ```

6. Click **Deploy Web Service**
7. Wait 3-5 minutes for deployment
8. Copy the Render URL (e.g., `https://your-voice-server.onrender.com`)

### 2. Update Twilio Webhook

1. Go to **Twilio Console > Phone Numbers > Active Numbers**
2. Select your Twilio phone number: `+12345678900`
3. Under **Voice & Fax** section:
   - **"A call comes in"**: Webhook
   - **URL**: `https://your-frontend-url.vercel.app/api/twilio/voice`
   - **HTTP Method**: POST
4. Click **Save**

### 3. Test End-to-End

**Call the number**: `+12345678900`

✅ **Expected Flow:**
1. Twilio receives call
2. Hits `/api/twilio/voice` webhook on Vercel
3. Vercel returns TwiML with `<Stream>` pointing to Render voice server
4. Voice server connects to OpenAI Realtime API
5. AI greets caller: "Hello, this is your AI Assistant..."
6. Caller can ask to schedule appointment
7. AI calls `schedule_visit` tool
8. Appointment appears in Dashboard within 30 seconds
9. Customer receives SMS confirmation

**Debug Checks:**
- Render logs: Check for WebSocket connection messages
- Browser console: Network tab for `/api/leads` response
- Database: Query your leads table for `type=appointment`

### 4. Update .env.example

Add Render URL to frontend `.env.example`:
```bash
VOICE_SERVER_URL=https://your-voice-server.onrender.com
```

## Troubleshooting

### Issue: Voice server returns 503 on first call
**Cause**: Render Free tier spins down after 15min idle  
**Solution**: Upgrade to Starter ($7/mo) OR accept 50s cold start

### Issue: "Cannot use import statement in a module"
**Cause**: Missing `"type": "module"` in package.json  
**Solution**: Already fixed in codebase

### Issue: 403 Forbidden on WebSocket
**Cause**: Using AWS App Runner instead of Render  
**Solution**: Deploy to Render.com ONLY

### Issue: Appointments not showing in dashboard
**Cause**: Wait 30 seconds for auto-refresh OR hard refresh browser  
**Solution**: Dashboard polls `/api/leads` every 30 seconds

## Cost Summary

| Component | Platform | Cost |
|:----------|:---------|:-----|
| Frontend | Vercel | $0 (Hobby tier) |
| Voice Server | Render.com Free | $0 (50s cold start) |
| Voice Server | Render.com Starter | $7/mo (instant) |
| Twilio | Pay-as-you-go | ~$0.015/min voice |
| DynamoDB | AWS Free Tier | $0 (< 25GB) |

**Recommended**: Deploy on Render Free first, upgrade to Starter only if cold starts are problematic.

---

**Status After Deployment**: 🟢 All 3 channels (Web Chat, SMS, Voice) will be fully operational with real-time appointment scheduling and dashboard visibility.

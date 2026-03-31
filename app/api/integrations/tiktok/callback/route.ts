import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
    exchangeTikTokAuthCode,
    getTikTokAuthConfig,
    getTikTokStateCookieName,
} from '@/lib/integrations/tiktok-auth';

function renderHtml(title: string, body: string): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 32px; }
      main { max-width: 840px; margin: 0 auto; background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
      h1 { margin-top: 0; }
      pre { white-space: pre-wrap; word-break: break-word; background: #020617; border: 1px solid #334155; border-radius: 12px; padding: 16px; overflow-x: auto; }
      code { font-family: Consolas, monospace; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(getTikTokStateCookieName())?.value;

    if (error) {
        const html = renderHtml(
            'TikTok Authorization Failed',
            `<h1>TikTok authorization failed</h1><p>${errorDescription ?? error}</p>`,
        );
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (!code) {
        const html = renderHtml(
            'TikTok Authorization Missing Code',
            '<h1>Missing TikTok authorization code</h1><p>No <code>code</code> query parameter was returned by TikTok.</p>',
        );
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (!state || !expectedState || state !== expectedState) {
        const html = renderHtml(
            'TikTok Authorization State Mismatch',
            '<h1>TikTok authorization state mismatch</h1><p>The returned <code>state</code> did not match the original request. Start the flow again from <code>/api/integrations/tiktok/connect</code>.</p>',
        );
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    try {
        const config = getTikTokAuthConfig();
        const tokenData = await exchangeTikTokAuthCode(code);
        const envBlock = [
            `TIKTOK_CLIENT_KEY=${config.clientKey}`,
            'TIKTOK_CLIENT_SECRET=REDACTED_ALREADY_IN_ENV',
            `TIKTOK_ACCESS_TOKEN=${tokenData.accessToken}`,
            `TIKTOK_OPEN_ID=${tokenData.openId}`,
            `TIKTOK_REFRESH_TOKEN=${tokenData.refreshToken}`,
        ].join('\n');

        const html = renderHtml(
            'TikTok Connected',
            `<h1>TikTok authorization succeeded</h1>
             <p>Copy the values below into your local environment or secure token store. The access token is short lived; the refresh token is what you will use to renew it on the server.</p>
             <pre><code>${envBlock}</code></pre>
             <p><strong>Access token expires at:</strong> ${tokenData.accessTokenExpiresAt}</p>
             <p><strong>Refresh token expires at:</strong> ${tokenData.refreshTokenExpiresAt}</p>
             <p><strong>Granted scope:</strong> ${tokenData.scope}</p>
             <p><strong>Redirect URI to register in TikTok:</strong> ${config.redirectUri}</p>`,
        );

        const response = new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        });
        response.cookies.delete(getTikTokStateCookieName());
        return response;
    } catch (exchangeError) {
        const message = exchangeError instanceof Error ? exchangeError.message : 'TikTok token exchange failed';
        const html = renderHtml(
            'TikTok Token Exchange Failed',
            `<h1>TikTok token exchange failed</h1><p>${message}</p>`,
        );
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
}
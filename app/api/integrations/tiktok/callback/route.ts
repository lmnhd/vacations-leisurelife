import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
    exchangeTikTokAuthCode,
    getTikTokAuthConfig,
    getTikTokStateCookieName,
} from '@/lib/integrations/tiktok-auth';

function getScopeNotice(scope: string): string {
    const grantedScopes = scope.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (grantedScopes.includes('video.publish')) {
        return '<p><strong>Direct Post capability:</strong> ready. This token set includes <code>video.publish</code>, so the app can move toward zero-manual TikTok posting once the direct-post adapter is enabled.</p>';
    }

    return '<p><strong>Direct Post capability:</strong> not yet approved. This token set does not include <code>video.publish</code>, so TikTok can only support inbox-share uploads right now. After TikTok approves <code>video.publish</code>, re-run <code>/api/integrations/tiktok/connect</code> to upgrade the stored token scopes.</p>';
}

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

        // Persist the new token set to the durable store so local dispatch
        // works immediately without manual env edits.
        const { upsertProviderToken } = await import('@/lib/integrations/provider-token-store');
        const rawLabel = process.env.TIKTOK_ACCOUNT_LABEL?.trim().toLowerCase();
        const accountLabel = rawLabel === 'business' ? 'business' : 'personal_test';
        await upsertProviderToken('tiktok', accountLabel, {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            openId: tokenData.openId,
            scope: tokenData.scope,
            accessTokenExpiresAt: new Date(tokenData.accessTokenExpiresAt),
            refreshTokenExpiresAt: new Date(tokenData.refreshTokenExpiresAt),
            lastRefreshedAt: null,
        });

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
               <p>The new TikTok token set has already been persisted to the provider token store for this account label. The values below are for bootstrap, verification, or disaster recovery only; they do not need to be manually copied on every authorization.</p>
             <pre><code>${envBlock}</code></pre>
             <p><strong>Access token expires at:</strong> ${tokenData.accessTokenExpiresAt}</p>
             <p><strong>Refresh token expires at:</strong> ${tokenData.refreshTokenExpiresAt}</p>
             <p><strong>Granted scope:</strong> ${tokenData.scope}</p>
                             ${getScopeNotice(tokenData.scope)}
               <p><strong>Redirect URI to register in TikTok:</strong> ${config.redirectUri}</p>
               <p><strong>Stored account label:</strong> ${accountLabel}</p>`,
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
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
    exchangeGoogleAuthCode,
    getGoogleAdsConfig,
    getGoogleStateCookieName,
    persistGoogleToken,
} from '@/lib/integrations/google-ads';

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
  <body><main>${body}</main></body>
</html>`;
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(getGoogleStateCookieName())?.value;

    if (error) {
        return new NextResponse(renderHtml('Google Authorization Failed', `<h1>Google authorization failed</h1><p>${errorDescription ?? error}</p>`), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }

    if (!code) {
        return new NextResponse(renderHtml('Missing Code', '<h1>Missing authorization code</h1><p>No <code>code</code> was returned by Google.</p>'), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }

    if (!state || !expectedState || state !== expectedState) {
        return new NextResponse(renderHtml('State Mismatch', '<h1>OAuth state mismatch</h1><p>Start the flow again from <code>/api/integrations/google/connect</code>.</p>'), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }

    try {
        const config = getGoogleAdsConfig();
        if (!config) throw new Error('Google Ads config missing. Check GOOGLE_ADS_* env vars.');

        const tokenData = await exchangeGoogleAuthCode(code, config);
        await persistGoogleToken(tokenData);

        const html = renderHtml('Google Ads Connected', `
            <h1>Google Ads authorization succeeded</h1>
            <p>The token has been persisted to the provider store under <strong>google / business</strong>.</p>
            <p><strong>Access token expires at:</strong> ${tokenData.accessTokenExpiresAt}</p>
            <p><strong>Granted scope:</strong> ${tokenData.scope}</p>
            <p><strong>Customer ID:</strong> ${config.customerId}</p>
            ${config.managerId ? `<p><strong>Manager account ID:</strong> ${config.managerId}</p>` : ''}
            <p>You can now dispatch Google Display campaigns via the distribution planner.</p>
        `);

        const response = new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
        response.cookies.delete(getGoogleStateCookieName());
        return response;
    } catch (exchangeError) {
        const message = exchangeError instanceof Error ? exchangeError.message : 'Token exchange failed';
        return new NextResponse(renderHtml('Token Exchange Failed', `<h1>Google token exchange failed</h1><p>${message}</p>`), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }
}

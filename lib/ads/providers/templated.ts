import { TEMPLATED_API_BASE_URL, TEMPLATED_API_KEY } from '../config';
import type { TemplatedRenderRequest, TemplatedRenderResponsePage } from '../types';

export type TemplatedRenderResponse = TemplatedRenderResponsePage | TemplatedRenderResponsePage[];

function isRenderPageArray(value: TemplatedRenderResponse): value is TemplatedRenderResponsePage[] {
    return Array.isArray(value);
}

function renderErrorMessage(responseText: string): string {
    const trimmed = responseText.trim();
    return trimmed.length > 0 ? trimmed : 'Templated render failed without a response body.';
}

/**
 * Render a prepared Templated payload and return the provider response.
 */
export async function renderWithTemplated(request: TemplatedRenderRequest): Promise<TemplatedRenderResponse> {
    if (!TEMPLATED_API_KEY) {
        throw new Error('Missing TEMPLATED_API_KEY. Set it before using the Templated render provider.');
    }

    const response = await fetch(`${TEMPLATED_API_BASE_URL.replace(/\/$/, '')}/render`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEMPLATED_API_KEY}`,
        },
        body: JSON.stringify({
            ...request,
            format: request.format ?? 'png',
            async: false,
        }),
    });

    if (!response.ok) {
        throw new Error(`Templated render failed (${response.status} ${response.statusText}): ${renderErrorMessage(await response.text())}`);
    }

    const payload = (await response.json()) as TemplatedRenderResponse;
    if (isRenderPageArray(payload)) {
        const failed = payload.find((page) => page.status === 'FAILED');
        if (failed) {
            throw new Error(`Templated render failed for page ${failed.page ?? failed.id}: ${failed.url}`);
        }
        return payload;
    }

    if (payload.status === 'FAILED') {
        throw new Error(`Templated render failed for ${payload.page ?? payload.id}: ${payload.url}`);
    }

    return payload;
}

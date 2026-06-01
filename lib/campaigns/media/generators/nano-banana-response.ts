type NanoBananaResponsePart = {
    text?: string;
    inlineData?: { data?: string; mimeType?: string };
    inline_data?: { data?: string; mime_type?: string };
    fileData?: { fileUri?: string; mimeType?: string };
    file_data?: { file_uri?: string; mime_type?: string };
};

type NanoBananaResponsePayload = {
    candidates?: Array<{
        content?: {
            parts?: NanoBananaResponsePart[];
        };
    }>;
};

export function extractNanoBananaImageBuffer(
    payload: NanoBananaResponsePayload,
    label: string,
): Buffer {
    const candidates = payload.candidates ?? [];
    for (const candidate of candidates) {
        const parts = candidate.content?.parts ?? [];
        for (const part of parts) {
            const imageData = part.inlineData?.data ?? part.inline_data?.data;
            if (imageData) {
                return Buffer.from(imageData, 'base64');
            }
        }
    }

    const candidateSummary = candidates.slice(0, 3).map((candidate, index) => {
        const parts = candidate.content?.parts ?? [];
        const partKinds = parts.map((part) => {
            if (part.inlineData?.data || part.inline_data?.data) return 'image';
            if (part.fileData?.fileUri || part.file_data?.file_uri) return 'file';
            if (typeof part.text === 'string' && part.text.trim().length > 0) return 'text';
            return 'unknown';
        });
        return `candidate_${index + 1}:${partKinds.join(',') || 'no_parts'}`;
    }).join(' | ');

    throw new Error(`${label} did not return an image payload${candidateSummary ? ` (${candidateSummary})` : ''}`);
}

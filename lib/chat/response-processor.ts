import { parseResponse } from './response-parser';
import type { DisplayDirective } from './types';

export function processResponse(input: {
    llmText: string;
}): {
    reply: string;
    display?: DisplayDirective;
} {
    const { cleanText, image, form } = parseResponse(input.llmText);

    let display: DisplayDirective | undefined;
    if (image || form) {
        display = { heroTextMode: 'typewriter' };
        if (image) {
            display.media = [
                {
                    type: image.count && image.count > 1 ? 'image_slideshow' : 'image',
                },
            ];
        }

        if (form) {
            display.form = form;
        }
    }

    return {
        reply: cleanText,
        display,
    };
}

import * as z from 'zod/v3';

export const formSchema = z.object({
    prompt: z.string().nonempty({ message: 'Prompt is required' }),
})
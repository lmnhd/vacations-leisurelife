import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const PROMPT_SCHEMA_FILE_PATH = path.join(
    process.cwd(),
    'lib',
    'chat',
    'prompt-data',
    'prompt-schema.json'
);

const SubContextNodeSchema = z.object({
    trigger: z.string().optional(),
    instructions: z.array(z.string()).optional(),
    instructions_ref: z.string().optional(),
    data_targets: z.array(z.string()).optional(),
    required_data: z.array(z.string()).optional(),
    available_tools: z.array(z.string()).optional(),
});

const ContextNodeSchema = z.object({
    priority: z.number(),
    trigger: z.string(),
    instructions: z.array(z.string()).optional(),
    instructions_ref: z.string().optional(),
    data_targets: z.array(z.string()).optional(),
    required_data: z.array(z.string()).optional(),
    available_tools: z.array(z.string()).optional(),
    sub_contexts: z.record(SubContextNodeSchema).optional(),
});

const PromptSchema = z.object({
    schema_version: z.string(),
    root: z.object({
        identity: z.object({
            name: z.string(),
            persona_ref: z.string(),
            global_rules: z.array(z.string()),
        }),
        channel_directives: z.record(z.array(z.string())).optional(),
        contexts: z.record(ContextNodeSchema),
    }),
});

async function loadPromptSchema(): Promise<z.infer<typeof PromptSchema>> {
    const fileContent = await readFile(PROMPT_SCHEMA_FILE_PATH, 'utf-8');
    return PromptSchema.parse(JSON.parse(fileContent));
}

function matchesTrigger(
    trigger: string,
    sessionState: {
        hasCruised: boolean | null;
        requestedSpecificCruise: boolean;
        incompleteProfile: boolean;
        discussesPastCruise: boolean;
        onActiveBooking?: boolean;
        completedCruise?: boolean;
    }
): boolean {
    const normalizedTrigger = trigger.trim().replace(/\s+/g, ' ');

    const evaluateAtomicCondition = (conditionExpression: string): boolean => {
        const atomicCondition = conditionExpression.trim().toLowerCase();

        if (atomicCondition === 'always') {
            return true;
        }

        if (atomicCondition === 'new_user') {
            return sessionState.incompleteProfile;
        }

        if (atomicCondition === 'incomplete_profile') {
            return sessionState.incompleteProfile;
        }

        if (atomicCondition === 'user_requests_specific_cruise') {
            return sessionState.requestedSpecificCruise;
        }

        if (atomicCondition === 'user_has_cruised == true') {
            return sessionState.hasCruised === true;
        }

        if (atomicCondition === 'user_has_cruised == false') {
            return sessionState.hasCruised === false;
        }

        if (atomicCondition === 'user_discusses_past_cruise') {
            return sessionState.discussesPastCruise;
        }

        if (atomicCondition === 'user_on_active_booking') {
            return sessionState.onActiveBooking ?? false;
        }

        if (atomicCondition === 'user_completed_cruise') {
            return sessionState.completedCruise ?? false;
        }

        return false;
    };

    const orClauses = normalizedTrigger.split(/\s+or\s+/i);
    return orClauses.some((orClause) => {
        const andClauses = orClause.split(/\s+and\s+/i);
        return andClauses.every((andClause) => evaluateAtomicCondition(andClause));
    });
}

export async function resolveContext(
    sessionState: {
        hasCruised: boolean | null;
        requestedSpecificCruise: boolean;
        incompleteProfile: boolean;
        discussesPastCruise: boolean;
        onActiveBooking?: boolean;
        completedCruise?: boolean;
    }
): Promise<{
    identityName: string;
    personaRef: string;
    globalRules: string[];
    channelDirectives: Record<string, string[]>;
    activeContextPath: string;
    instructions: string[];
    instructionRefs: string[];
    dataTargets: string[];
    requiredData: string[];
    availableTools: string[];
}> {
    const schema = await loadPromptSchema();

    const matchedTopLevelContexts = Object.entries(schema.root.contexts)
        .filter(([, contextNode]) => matchesTrigger(contextNode.trigger, sessionState))
        .sort(([, leftNode], [, rightNode]) => leftNode.priority - rightNode.priority);

    if (matchedTopLevelContexts.length === 0) {
        throw new Error('No active context could be resolved from prompt-schema.json');
    }

    const [topContextKey, topContextNode] = matchedTopLevelContexts[0];

    let activeContextPath = topContextKey;
    const instructions = [...(topContextNode.instructions ?? [])];
    const instructionRefs = topContextNode.instructions_ref ? [topContextNode.instructions_ref] : [];
    const dataTargets = [...(topContextNode.data_targets ?? [])];
    const requiredData = [...(topContextNode.required_data ?? [])];
    const availableTools = [...(topContextNode.available_tools ?? [])];

    if (topContextNode.sub_contexts) {
        for (const [subContextKey, subContextNode] of Object.entries(topContextNode.sub_contexts)) {
            if (!subContextNode.trigger || !matchesTrigger(subContextNode.trigger, sessionState)) {
                continue;
            }

            activeContextPath = `${topContextKey}.${subContextKey}`;
            instructions.push(...(subContextNode.instructions ?? []));

            if (subContextNode.instructions_ref) {
                instructionRefs.push(subContextNode.instructions_ref);
            }

            dataTargets.push(...(subContextNode.data_targets ?? []));
            requiredData.push(...(subContextNode.required_data ?? []));
            availableTools.push(...(subContextNode.available_tools ?? []));
            break;
        }
    }

    return {
        identityName: schema.root.identity.name,
        personaRef: schema.root.identity.persona_ref,
        globalRules: schema.root.identity.global_rules,
        channelDirectives: schema.root.channel_directives ?? {},
        activeContextPath,
        instructions: [...new Set(instructions)],
        instructionRefs: [...new Set(instructionRefs)],
        dataTargets: [...new Set(dataTargets)],
        requiredData: [...new Set(requiredData)],
        availableTools: [...new Set(availableTools)],
    };
}

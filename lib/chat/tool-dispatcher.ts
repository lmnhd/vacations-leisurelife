import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { runPerplexityCruiseResearch } from './tools/perplexity-research';
import { runCruiseBrothersKnowledgeLookup } from './tools/cruise-brothers-knowledge';

const TOOL_DATA_ROOT = path.join(process.cwd(), 'lib', 'chat', 'prompt-data', 'tools');
const TOOL_DIRECTIVE_PATTERN = /\[Tool:\s*([a-z0-9_\-]+)\s*(\{[^\]]*\})?\s*\]/gi;

const ToolDefinitionSchema = z.object({
    tool_id: z.string(),
    handler: z.string(),
    thoughts_stream_label: z.string().optional(),
});

const PerplexityPayloadSchema = z.object({
    query: z.string().min(1),
    destination: z.string().nullable().optional(),
    departure_month: z.string().nullable().optional(),
});

const CruiseBrothersPayloadSchema = z.object({
    query: z.string().min(1),
});

type ToolCallLogEntry = {
    toolId: string;
    payload: unknown;
    status: 'executed' | 'validated_not_implemented';
};

async function listToolDefinitionFiles(directoryPath: string): Promise<string[]> {
    const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
    const files = await Promise.all(
        directoryEntries.map(async (entry) => {
            const absoluteEntryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                return listToolDefinitionFiles(absoluteEntryPath);
            }

            if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                return [absoluteEntryPath];
            }

            return [];
        })
    );

    return files.flat();
}

async function loadToolRegistry(): Promise<Map<string, z.infer<typeof ToolDefinitionSchema>>> {
    const definitionFiles = await listToolDefinitionFiles(TOOL_DATA_ROOT);
    const toolDefinitionEntries = await Promise.all(
        definitionFiles.map(async (definitionFilePath) => {
            const definitionContent = await readFile(definitionFilePath, 'utf-8');
            const parsedDefinition = ToolDefinitionSchema.parse(JSON.parse(definitionContent));
            return [parsedDefinition.tool_id, parsedDefinition] as const;
        })
    );

    return new Map<string, z.infer<typeof ToolDefinitionSchema>>(toolDefinitionEntries);
}

async function assertToolHandlerExists(handlerPath: string): Promise<void> {
    const absoluteHandlerPath = path.join(process.cwd(), handlerPath);
    await access(absoluteHandlerPath);
}

export async function dispatchTools(input: {
    llmResponseText: string;
    activeContextPath: string;
    allowedToolIds: string[];
}): Promise<{
    finalLlmText: string;
    toolCallsLog: ToolCallLogEntry[];
}> {
    const toolRegistry = await loadToolRegistry();
    const toolCallsLog: ToolCallLogEntry[] = [];

    let updatedResponseText = input.llmResponseText;
    const directiveMatches = [...input.llmResponseText.matchAll(TOOL_DIRECTIVE_PATTERN)];

    for (const directiveMatch of directiveMatches) {
        const requestedToolId = directiveMatch[1]?.trim();
        const rawPayload = directiveMatch[2]?.trim();

        if (!requestedToolId) {
            continue;
        }

        if (!input.allowedToolIds.includes(requestedToolId)) {
            throw new Error(
                `Tool ${requestedToolId} is not allowed in context ${input.activeContextPath}.`
            );
        }

        const toolDefinition = toolRegistry.get(requestedToolId);
        if (!toolDefinition) {
            throw new Error(`Tool definition not found for ${requestedToolId}.`);
        }

        await assertToolHandlerExists(toolDefinition.handler);

        let parsedPayload: unknown = null;
        if (rawPayload) {
            try {
                parsedPayload = JSON.parse(rawPayload);
            } catch {
                throw new Error(
                    `Tool directive payload is invalid JSON for ${requestedToolId}.`
                );
            }
        }

        toolCallsLog.push({
            toolId: requestedToolId,
            payload: parsedPayload,
            status: 'executed',
        });

        if (requestedToolId === 'perplexity_cruise_research') {
            const perplexityPayload = PerplexityPayloadSchema.parse(parsedPayload ?? {});
            const researchResult = await runPerplexityCruiseResearch({
                query: perplexityPayload.query,
                destination: perplexityPayload.destination ?? null,
                departureMonth: perplexityPayload.departure_month ?? null,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${researchResult.researchSummary}`
            );
            continue;
        }

        if (requestedToolId === 'cruise_brothers_knowledge') {
            const knowledgePayload = CruiseBrothersPayloadSchema.parse(parsedPayload ?? {});
            const knowledgeResult = await runCruiseBrothersKnowledgeLookup({
                query: knowledgePayload.query,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${knowledgeResult.knowledgeSummary}`
            );
            continue;
        }

        toolCallsLog[toolCallsLog.length - 1] = {
            ...toolCallsLog[toolCallsLog.length - 1],
            status: 'validated_not_implemented',
        };

        throw new Error(
            `Tool handler invocation not implemented yet for ${requestedToolId}. ` +
            `Directive detected and validated.`
        );
    }

    updatedResponseText = updatedResponseText.replace(TOOL_DIRECTIVE_PATTERN, '').trim();

    return {
        finalLlmText: updatedResponseText,
        toolCallsLog,
    };
}

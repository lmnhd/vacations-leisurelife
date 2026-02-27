import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveContext } from './context-resolver';

const PROMPT_DATA_ROOT = path.join(process.cwd(), 'lib', 'chat', 'prompt-data');
const TOOL_DATA_ROOT = path.join(PROMPT_DATA_ROOT, 'tools');

async function readPromptDataFile(relativePath: string): Promise<string> {
    const absolutePath = path.join(PROMPT_DATA_ROOT, relativePath);
    return readFile(absolutePath, 'utf-8');
}

type ToolDefinition = {
    tool_id: string;
    display_name?: string;
    description?: string;
    input_schema?: Record<string, string>;
    thoughts_stream_label?: string;
};

async function listJsonFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const results = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return listJsonFiles(fullPath);
            if (entry.isFile() && entry.name.endsWith('.json')) return [fullPath];
            return [];
        })
    );
    return results.flat();
}

async function loadToolDefinitions(toolIds: string[]): Promise<ToolDefinition[]> {
    if (toolIds.length === 0) return [];
    const allFiles = await listJsonFiles(TOOL_DATA_ROOT);
    const definitionGroups = await Promise.all(
        allFiles.map(async (filePath) => {
            const raw = await readFile(filePath, 'utf-8');
            const parsed = JSON.parse(raw) as ToolDefinition | ToolDefinition[];
            return Array.isArray(parsed) ? parsed : [parsed];
        })
    );
    const definitions = definitionGroups.flat();
    return definitions.filter((def) => toolIds.includes(def.tool_id));
}

function buildToolCallingInstructions(tools: ToolDefinition[]): string[] {
    if (tools.length === 0) return [];

    const lines: string[] = [
        '# Tool Calling',
        'When you need external data, emit a tool directive on its own line using this exact syntax:',
        '  [Tool: tool_id {"param": "value"}]',
        'The tool result will be injected back into your context. Then write your response using that data.',
        'CRITICAL RULES:',
        '- Only call tools when you genuinely need live data — not for every response.',
        `- You may ONLY call these exact tool IDs: ${tools.map(t => t.tool_id).join(', ')}`,
        '- Never invent or assume a tool exists. If a tool is not listed above, do NOT emit a directive for it.',
        '',
        '## Available Tools',
    ];

    for (const tool of tools) {
        lines.push(`### ${tool.tool_id}`);
        if (tool.description) lines.push(`${tool.description}`);
        if (tool.input_schema) {
            lines.push('Parameters:');
            for (const [param, type] of Object.entries(tool.input_schema)) {
                lines.push(`  - ${param}: ${type}`);
            }
            const exampleParams = Object.fromEntries(
                Object.entries(tool.input_schema).map(([k, v]) => [
                    k,
                    v.includes('null') ? null : `<${k}>`,
                ])
            );
            lines.push(`Example: [Tool: ${tool.tool_id} ${JSON.stringify(exampleParams)}]`);
        }
    }

    return lines;
}

export async function assembleSystemPrompt(input: {
    channel: 'text' | 'voice' | 'voice_test';
    hasCruised: boolean | null;
    requestedSpecificCruise: boolean;
    incompleteProfile: boolean;
    discussesPastCruise: boolean;
    preResolvedContext?: Awaited<ReturnType<typeof resolveContext>>;
    activeRules?: string[];
    loadedSkills?: string[];
}): Promise<{ systemPrompt: string; activeContextPath: string }> {
    const resolvedContext = input.preResolvedContext
        ? input.preResolvedContext
        : await resolveContext({
            hasCruised: input.hasCruised,
            requestedSpecificCruise: input.requestedSpecificCruise,
            incompleteProfile: input.incompleteProfile,
            discussesPastCruise: input.discussesPastCruise,
        });

    const activeRules = input.activeRules ?? [];
    const loadedSkills = input.loadedSkills ?? [];

    const personaMarkdown = await readPromptDataFile(resolvedContext.personaRef);

    const contextInstructionBlocks = await Promise.all(
        resolvedContext.instructionRefs.map((instructionRef) => readPromptDataFile(instructionRef))
    );

    // Voice channels use Realtime function definitions (registered in session config),
    // not text-directive tool calling syntax. Skip for voice/voice_test.
    const isVoiceChannel = input.channel === 'voice' || input.channel === 'voice_test';
    const toolCallingInstructions = isVoiceChannel
        ? []
        : buildToolCallingInstructions(await loadToolDefinitions(resolvedContext.availableTools));

    const systemPrompt = [
        `# Identity`,
        `Name: ${resolvedContext.identityName}`,
        '',
        '# Persona',
        personaMarkdown.trim(),
        '',
        '# Global Rules',
        ...resolvedContext.globalRules.map((rule) => `- ${rule}`),
        '',
        '# Active Context',
        `Path: ${resolvedContext.activeContextPath}`,
        ...resolvedContext.instructions.map((instruction) => `- ${instruction}`),
        '',
        '# Active Rules',
        ...activeRules.map((rule) => `- ${rule}`),
        '',
        '# Context Skill Content',
        contextInstructionBlocks.join('\n\n').trim(),
        ...loadedSkills,
        '',
        '# Data Collection Targets',
        ...resolvedContext.dataTargets.map((targetPath) => `- ${targetPath}`),
        '',
        '# Required Data Before Progression',
        ...resolvedContext.requiredData.map((requiredPath) => `- ${requiredPath}`),
        '',
        ...toolCallingInstructions,
        '',
        '# Channel Directives',
        ...(resolvedContext.channelDirectives[input.channel] ?? []).map((d) => `- ${d}`),
    ]
        .filter((line) => line.trim().length > 0)
        .join('\n');

    return {
        systemPrompt,
        activeContextPath: resolvedContext.activeContextPath,
    };
}

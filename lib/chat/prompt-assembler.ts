import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveContext } from './context-resolver';

const PROMPT_DATA_ROOT = path.join(process.cwd(), 'lib', 'chat', 'prompt-data');

async function readPromptDataFile(relativePath: string): Promise<string> {
    const absolutePath = path.join(PROMPT_DATA_ROOT, relativePath);
    return readFile(absolutePath, 'utf-8');
}

export async function assembleSystemPrompt(input: {
    channel: 'text' | 'voice';
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
        '# Available Tools',
        ...resolvedContext.availableTools.map((toolId) => `- ${toolId}`),
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
        '# Channel Directives',
        input.channel === 'voice'
            ? '- Keep responses concise for voice playback.'
            : '- Keep responses concise and scannable for text chat.',
    ]
        .filter((line) => line.trim().length > 0)
        .join('\n');

    return {
        systemPrompt,
        activeContextPath: resolvedContext.activeContextPath,
    };
}

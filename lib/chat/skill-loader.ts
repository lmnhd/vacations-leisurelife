import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PROMPT_DATA_ROOT = path.join(process.cwd(), 'lib', 'chat', 'prompt-data');

async function readSkillFile(relativePath: string): Promise<string> {
    const absolutePath = path.join(PROMPT_DATA_ROOT, relativePath);
    return readFile(absolutePath, 'utf-8');
}

export async function loadSkills(input: {
    activeContextPath: string;
    instructionRefs: string[];
}): Promise<string[]> {
    const uniqueInstructionRefs = [...new Set(input.instructionRefs)];
    const loadedSkillBlocks = await Promise.all(
        uniqueInstructionRefs.map(async (instructionRef) => {
            const skillContent = await readSkillFile(instructionRef);
            return [`## Skill: ${instructionRef}`, skillContent.trim()].join('\n');
        })
    );

    return loadedSkillBlocks;
}

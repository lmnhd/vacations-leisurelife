import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const RULES_DIRECTORY = path.join(process.cwd(), 'lib', 'chat', 'prompt-data', 'rules');

const RuleDefinitionSchema = z.object({
    rule_id: z.string(),
    instructions: z.array(z.string().min(1)).min(1),
    applies_when: z.object({
        context_prefixes: z.array(z.string().min(1)).optional(),
        session_ids: z.array(z.string().min(1)).optional(),
    }),
});

async function listRuleFiles(directoryPath: string): Promise<string[]> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
        entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
        const errorCode = error instanceof Error && 'code' in error ? String(error.code) : '';
        if (errorCode === 'ENOENT') {
            return [];
        }

        throw error;
    }

    const nestedFileLists = await Promise.all(
        entries.map(async (entry) => {
            const absoluteEntryPath = path.join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                return listRuleFiles(absoluteEntryPath);
            }

            if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                return [absoluteEntryPath];
            }

            return [];
        })
    );

    return nestedFileLists.flat();
}

function ruleApplies(input: {
    activeContextPath: string;
    sessionId: string;
    rule: z.infer<typeof RuleDefinitionSchema>;
}): boolean {
    const contextPrefixes = input.rule.applies_when.context_prefixes ?? [];
    const sessionIds = input.rule.applies_when.session_ids ?? [];

    const contextMatch =
        contextPrefixes.length === 0
            ? true
            : contextPrefixes.some((contextPrefix) =>
                input.activeContextPath === contextPrefix ||
                input.activeContextPath.startsWith(`${contextPrefix}.`)
            );

    const sessionMatch = sessionIds.length === 0 ? true : sessionIds.includes(input.sessionId);
    return contextMatch && sessionMatch;
}

export async function injectRules(input: {
    activeContextPath: string;
    sessionId: string;
}): Promise<string[]> {
    const ruleFiles = await listRuleFiles(RULES_DIRECTORY);
    const rules = await Promise.all(
        ruleFiles.map(async (ruleFilePath) => {
            const ruleContent = await readFile(ruleFilePath, 'utf-8');
            return RuleDefinitionSchema.parse(JSON.parse(ruleContent));
        })
    );

    const activeInstructions = rules
        .filter((rule) =>
            ruleApplies({
                activeContextPath: input.activeContextPath,
                sessionId: input.sessionId,
                rule,
            })
        )
        .flatMap((rule) => rule.instructions);

    return [...new Set(activeInstructions)];
}

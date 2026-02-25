import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { runPerplexityCruiseResearch } from './tools/perplexity-research';
import { runCruiseBrothersKnowledgeLookup } from './tools/cruise-brothers-knowledge';
import { runExcursionFinder } from './tools/excursion-finder';
import { runCruiseBrothersScraper } from './tools/cruise-brothers-scraper';
import { runPricingComparator } from './tools/pricing-comparator';
import { runOdysseusSearch } from './tools/odysseus-search';
import { runCruiseGroupsManager } from './tools/cruise-groups-manager';
import { runPackageBuilder } from './tools/package-builder';

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

const ExcursionFinderPayloadSchema = z.object({
    port: z.string().min(1),
    interests: z.string().nullable().optional(),
    cruise_line: z.string().nullable().optional(),
});

const CruiseBrothersScraperPayloadSchema = z.object({
    query: z.string().min(1),
    cruise_line: z.string().nullable().optional(),
    destination: z.string().nullable().optional(),
});

const PricingComparatorPayloadSchema = z.object({
    base_fare: z.number(),
    taxes_fees_port_expenses: z.number(),
    gratuities: z.number(),
    number_of_guests: z.number(),
    number_of_nights: z.number(),
    client_total_budget: z.number(),
});

const OdysseusSearchPayloadSchema = z.object({
    vendorId: z.number().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    passengers: z.number(),
    guestAges: z.array(z.number())
});

const PackageBuilderPayloadSchema = z.object({
    packages: z.array(z.object({
        cruiseDetails: z.object({
            odysseusItineraryCode: z.string().min(1),
            shipName: z.string().min(1),
            sailDate: z.string().min(1),
            durationNights: z.number().int().positive(),
            departurePort: z.string().min(1),
            baseFarePerPerson: z.number().positive(),
            taxesAndFeesPerPerson: z.number().nonnegative(),
        }),
        guests: z.object({
            count: z.number().int().min(1),
            ages: z.array(z.number().int().nonnegative()),
        }),
        gratuityPerPerson: z.number().nonnegative().optional(),
        includedExcursions: z.array(z.object({
            excursionId: z.string(),
            label: z.string(),
            pricePerPerson: z.number().nonnegative(),
        })).optional(),
        appliedPerkCodes: z.array(z.string()).optional(),
        depositTier: z.enum(['standard', 'promo', 'group']).optional(),
    })).min(1).max(3),
});

const CruiseGroupsManagerPayloadSchema = z.object({
    action: z.enum(['search', 'create']),
    searchQuery: z.string().optional(),
    groupData: z.object({
        groupNumber: z.string().optional(),
        groupName: z.string().optional(),
        cruiseLine: z.string().optional(),
        cruiseShip: z.string().optional(),
        sailDate: z.string().optional(),
    }).optional()
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

        if (requestedToolId === 'excursion_finder') {
            const excursionPayload = ExcursionFinderPayloadSchema.parse(parsedPayload ?? {});
            const excursionResult = await runExcursionFinder({
                port: excursionPayload.port,
                interests: excursionPayload.interests ?? null,
                cruiseLine: excursionPayload.cruise_line ?? null,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${excursionResult.excursionSummary}`
            );
            continue;
        }

        if (requestedToolId === 'cruise_brothers_scraper') {
            const scraperPayload = CruiseBrothersScraperPayloadSchema.parse(parsedPayload ?? {});
            const scraperResult = await runCruiseBrothersScraper({
                query: scraperPayload.query,
                cruiseLine: scraperPayload.cruise_line ?? null,
                destination: scraperPayload.destination ?? null,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${scraperResult.dealsSummary}`
            );
            continue;
        }

        if (requestedToolId === 'pricing_comparator') {
            const compPayload = PricingComparatorPayloadSchema.parse(parsedPayload ?? {});
            const compResult = await runPricingComparator({
                baseFare: compPayload.base_fare,
                taxesFeesPortExpenses: compPayload.taxes_fees_port_expenses,
                gratuities: compPayload.gratuities,
                numberOfGuests: compPayload.number_of_guests,
                numberOfNights: compPayload.number_of_nights,
                clientTotalBudget: compPayload.client_total_budget,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n> [!NOTE]\n> ${compResult.affordabilitySummary}`
            );
            continue;
        }

        if (requestedToolId === 'odysseus_search') {
            const odyPayload = OdysseusSearchPayloadSchema.parse(parsedPayload ?? {});
            const odyResult = await runOdysseusSearch({
                vendorId: odyPayload.vendorId,
                startDate: odyPayload.startDate,
                endDate: odyPayload.endDate,
                passengers: odyPayload.passengers,
                guestAges: odyPayload.guestAges,
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${odyResult.searchSummary}\n\`\`\`json\n${JSON.stringify(odyResult.results, null, 2)}\n\`\`\``
            );
            continue;
        }

        if (requestedToolId === 'cruise_groups_manager') {
            const groupPayload = CruiseGroupsManagerPayloadSchema.parse(parsedPayload ?? {});
            const groupResult = await runCruiseGroupsManager({
                action: groupPayload.action,
                searchQuery: groupPayload.searchQuery,
                groupData: groupPayload.groupData
            });

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${groupResult.message}\n\`\`\`json\n${JSON.stringify(groupResult.results, null, 2)}\n\`\`\``
            );
            continue;
        }

        if (requestedToolId === 'package_builder') {
            const pkgPayload = PackageBuilderPayloadSchema.parse(parsedPayload ?? {});
            const pkgResult = await runPackageBuilder(pkgPayload);

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n> [!NOTE]\n> Package${pkgResult.comparisonMode ? 's' : ''} ready for presentation.\n\`\`\`json\n${JSON.stringify(pkgResult, null, 2)}\n\`\`\``
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

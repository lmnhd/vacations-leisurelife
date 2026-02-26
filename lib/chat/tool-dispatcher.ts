import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pipelineLog } from './pipeline-logger';
import { getToolCache, setToolCache } from './tool-cache';
import { runPerplexityCruiseResearch } from './tools/perplexity-research';
import { runCruiseBrothersKnowledgeLookup } from './tools/cruise-brothers-knowledge';
import { runExcursionFinder } from './tools/excursion-finder';
import { runCruiseBrothersScraper } from './tools/cruise-brothers-scraper';
import { runPricingComparator } from './tools/pricing-comparator';
import { runOdysseusSearch } from './tools/odysseus-search';
import { runCruiseGroupsManager } from './tools/cruise-groups-manager';
import { runPackageBuilder } from './tools/package-builder';
import { runSocialMediaInsights } from './tools/social-media-insights';

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

    if (directiveMatches.length === 0) {
        pipelineLog.tool('none', input.activeContextPath, 'skipped_no_directive', {
            allowedTools: input.allowedToolIds,
            responseSample: input.llmResponseText.slice(0, 150),
        });
    }

    for (const directiveMatch of directiveMatches) {
        const requestedToolId = directiveMatch[1]?.trim();
        const rawPayload = directiveMatch[2]?.trim();

        if (!requestedToolId) {
            continue;
        }

        if (!input.allowedToolIds.includes(requestedToolId)) {
            pipelineLog.warn('tool-dispatcher', input.activeContextPath, `LLM emitted unknown/disallowed tool directive: ${requestedToolId} — skipping`);
            updatedResponseText = updatedResponseText.replace(directiveMatch[0], '').trim();
            continue;
        }

        const toolDefinition = toolRegistry.get(requestedToolId);
        if (!toolDefinition) {
            pipelineLog.warn('tool-dispatcher', input.activeContextPath, `Tool directive matched allowed list but has no JSON definition: ${requestedToolId} — skipping`);
            updatedResponseText = updatedResponseText.replace(directiveMatch[0], '').trim();
            continue;
        }

        await assertToolHandlerExists(toolDefinition.handler);

        let parsedPayload: unknown = null;
        if (rawPayload) {
            try {
                parsedPayload = JSON.parse(rawPayload);
            } catch {
                pipelineLog.warn('tool-dispatcher', input.activeContextPath, `Tool ${requestedToolId} emitted invalid JSON payload — skipping`, { rawPayload });
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], '').trim();
                continue;
            }
        }

        toolCallsLog.push({
            toolId: requestedToolId,
            payload: parsedPayload,
            status: 'executed',
        });

        pipelineLog.tool(requestedToolId, input.activeContextPath, 'dispatched', { payload: parsedPayload });

        try {

        // ----------------------------------------------------------------------
        // CACHE LAYER
        // Check if we already ran this exact tool with this exact payload recently
        // ----------------------------------------------------------------------
        const cachedResponse = await getToolCache<unknown>(requestedToolId, parsedPayload ?? {});
        
        if (cachedResponse) {
            pipelineLog.tool(requestedToolId, input.activeContextPath, 'cache_hit', { payload: parsedPayload });
            
            if (requestedToolId === 'perplexity_cruise_research') {
                const res = cachedResponse as { researchSummary: string };
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], `\n\n${res.researchSummary}`);
                continue;
            }
            if (requestedToolId === 'cruise_brothers_knowledge') {
                const res = cachedResponse as { knowledgeSummary: string };
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], `\n\n${res.knowledgeSummary}`);
                continue;
            }
            if (requestedToolId === 'excursion_finder') {
                const res = cachedResponse as { excursionSummary: string };
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], `\n\n${res.excursionSummary}`);
                continue;
            }
            if (requestedToolId === 'cruise_brothers_scraper') {
                const res = cachedResponse as { dealsSummary: string };
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], `\n\n${res.dealsSummary}`);
                continue;
            }
            if (requestedToolId === 'pricing_comparator') {
                const res = cachedResponse as { affordabilitySummary: string };
                updatedResponseText = updatedResponseText.replace(directiveMatch[0], `\n\n> [!NOTE]\n> ${res.affordabilitySummary}`);
                continue;
            }
            if (requestedToolId === 'odysseus_search') {
                const res = cachedResponse as { searchSummary: string, results: unknown };
                updatedResponseText = updatedResponseText.replace(
                    directiveMatch[0],
                    `\n\n${res.searchSummary}\n\`\`\`json\n${JSON.stringify(res.results, null, 2)}\n\`\`\``
                );
                continue;
            }
            if (requestedToolId === 'social_media_insights') {
                const res = cachedResponse as { sentiment_summary: string };
                updatedResponseText = updatedResponseText.replace(
                    directiveMatch[0],
                    `\n\n${res.sentiment_summary}\n\`\`\`json\n${JSON.stringify(res, null, 2)}\n\`\`\``
                );
                continue;
            }
            // For tools with side effects (like package builder / cruise groups manager), we skip caching.
        }

        if (requestedToolId === 'perplexity_cruise_research') {
            const perplexityPayload = PerplexityPayloadSchema.parse(parsedPayload ?? {});
            const researchResult = await runPerplexityCruiseResearch({
                query: perplexityPayload.query,
                destination: perplexityPayload.destination ?? null,
                departureMonth: perplexityPayload.departure_month ?? null,
            });

            await setToolCache(requestedToolId, parsedPayload ?? {}, researchResult, 86400); // 24hr cache

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

            await setToolCache(requestedToolId, parsedPayload ?? {}, knowledgeResult, 86400 * 7); // 7 day cache

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

            await setToolCache(requestedToolId, parsedPayload ?? {}, excursionResult, 86400 * 7); // 7 day cache

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

            await setToolCache(requestedToolId, parsedPayload ?? {}, scraperResult, 3600 * 6); // 6hr cache

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

            await setToolCache(requestedToolId, parsedPayload ?? {}, compResult, 86400 * 7); // 7 day cache

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

            await setToolCache(requestedToolId, parsedPayload ?? {}, odyResult, 3600 * 4); // 4hr cache

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${odyResult.searchSummary}\n\`\`\`json\n${JSON.stringify(odyResult.results, null, 2)}\n\`\`\``
            );
            continue;
        }

        if (requestedToolId === 'social_media_insights') {
            const socialPayload = z.object({
                cruise_line: z.string(),
                ship_name: z.string().nullable().optional(),
                destination: z.string().nullable().optional()
            }).parse(parsedPayload ?? {});

            const socialResult = await runSocialMediaInsights({
                cruiseLine: socialPayload.cruise_line,
                shipName: socialPayload.ship_name ?? null,
                destination: socialPayload.destination ?? null
            });

            await setToolCache(requestedToolId, parsedPayload ?? {}, socialResult, 86400 * 30); // 30 day cache

            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${socialResult.sentiment_summary}\n\`\`\`json\n${JSON.stringify(socialResult, null, 2)}\n\`\`\``
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

            // No caching for mutation operations or dynamic lookups
            updatedResponseText = updatedResponseText.replace(
                directiveMatch[0],
                `\n\n${groupResult.message}\n\`\`\`json\n${JSON.stringify(groupResult.results, null, 2)}\n\`\`\``
            );
            continue;
        }

        if (requestedToolId === 'package_builder') {
            const pkgPayload = PackageBuilderPayloadSchema.parse(parsedPayload ?? {});
            const pkgResult = await runPackageBuilder(pkgPayload);

            // No caching for side effect operations
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

        pipelineLog.warn('tool-dispatcher', input.activeContextPath, `Tool handler not implemented for ${requestedToolId} — skipping`);
        updatedResponseText = updatedResponseText.replace(directiveMatch[0], '').trim();

        } catch (toolError) {
            pipelineLog.error('tool-dispatcher', input.activeContextPath, toolError, { toolId: requestedToolId, payload: parsedPayload });
            updatedResponseText = updatedResponseText.replace(directiveMatch[0], '').trim();
        }
    }

    updatedResponseText = updatedResponseText.replace(TOOL_DIRECTIVE_PATTERN, '').trim();

    return {
        finalLlmText: updatedResponseText,
        toolCallsLog,
    };
}

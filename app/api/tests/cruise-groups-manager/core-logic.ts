import { z } from 'zod';
import { runCruiseGroupsManager } from '@/lib/chat/tools/cruise-groups-manager';

const CruiseGroupDataSchema = z.object({
    groupNumber: z.string().optional(),
    groupName: z.string().optional(),
    cruiseLine: z.string().optional(),
    cruiseShip: z.string().optional(),
    sailDate: z.string().optional(),
});

const CruiseGroupsManagerTestRequestSchema = z.object({
    action: z.enum(['search', 'create']),
    searchQuery: z.string().optional(),
    groupData: CruiseGroupDataSchema.optional(),
});

export async function handleCruiseGroupsManagerTestRequest(
    body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
    try {
        const parsed = CruiseGroupsManagerTestRequestSchema.parse(body);

        const result = await runCruiseGroupsManager({
            action: parsed.action,
            searchQuery: parsed.searchQuery,
            groupData: parsed.groupData
        });

        return {
            status: 200,
            data: result,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 500,
            data: { error: message },
        };
    }
}

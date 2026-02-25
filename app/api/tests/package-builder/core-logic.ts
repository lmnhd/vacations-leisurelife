import { runPackageBuilder } from '@/lib/chat/tools/package-builder';
import { PackageBuilderInput } from '@/lib/chat/types';

type ApiResponse = {
    status: number;
    data: unknown;
};

export async function handlePackageBuilderTestRequest(body: unknown): Promise<ApiResponse> {
    const batchInput = body as { packages: PackageBuilderInput[] };

    if (!batchInput?.packages || !Array.isArray(batchInput.packages)) {
        return {
            status: 400,
            data: { error: 'Request body must have a "packages" array.' },
        };
    }

    try {
        const result = await runPackageBuilder(batchInput);
        return { status: 200, data: result };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { status: 400, data: { error: message } };
    }
}

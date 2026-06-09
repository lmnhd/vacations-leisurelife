import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyDestinationDealPage({
  params,
}: {
  params: Promise<{ id?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const id = Array.isArray(resolvedParams.id)
    ? resolvedParams.id.join("/")
    : resolvedParams.id;

  redirect(`/deals/${encodeURIComponent(id ?? "")}`);
}

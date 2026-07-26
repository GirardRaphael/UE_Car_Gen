import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assets, jobs } from "@/server/db/schema";
import { requireBridgeToken } from "@/server/unreal/bridgeAuth";

export const runtime = "nodejs";

type JobOutput = { assetId?: string; unrealImport?: { status?: string } } | null;

export async function GET(request: Request) {
  const authError = requireBridgeToken(request);
  if (authError) return authError;

  // Small, single-user app: scanning the most recent completed jobs in JS is
  // simpler and safer than a raw JSONB path query, and cheap at this volume.
  const recentCompleted = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "completed"))
    .orderBy(asc(jobs.updatedAt))
    .limit(50);

  const pending = recentCompleted.find((job) => {
    const output = job.output as JobOutput;
    return output?.unrealImport?.status === "pending";
  });

  if (!pending) return Response.json({ job: null });

  const output = pending.output as JobOutput;
  const assetId = output?.assetId;
  const [asset] = assetId ? await db.select().from(assets).where(eq(assets.id, assetId)).limit(1) : [];
  if (!asset) return Response.json({ job: null });

  const origin = new URL(request.url).origin;
  return Response.json({
    job: {
      jobId: pending.id,
      assetName: asset.name,
      downloadUrl: `${origin}/api/assets/${encodeURIComponent(asset.storageKey)}`
    }
  });
}

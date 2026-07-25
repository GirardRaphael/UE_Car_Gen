import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assets, jobs } from "@/server/db/schema";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  let asset = null;
  const assetId = job.output && typeof job.output.assetId === "string" ? job.output.assetId : undefined;
  if (assetId) {
    const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (row) asset = row;
  }

  return Response.json({ job, asset });
}

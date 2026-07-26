import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { jobs } from "@/server/db/schema";
import { requireBridgeToken } from "@/server/unreal/bridgeAuth";

export const runtime = "nodejs";

const reportSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("imported") }),
  z.object({ status: z.literal("error"), message: z.string().min(1).max(2_000) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireBridgeToken(request);
  if (authError) return authError;

  const { id } = await params;
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid report body" }, { status: 400 });

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

  const currentOutput = (job.output as Record<string, unknown>) ?? {};
  const unrealImport =
    parsed.data.status === "imported" ? { status: "imported" as const } : { status: "error" as const, message: parsed.data.message };

  await db
    .update(jobs)
    .set({ output: { ...currentOutput, unrealImport }, updatedAt: new Date() })
    .where(eq(jobs.id, id));

  return Response.json({ ok: true });
}

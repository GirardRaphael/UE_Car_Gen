import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";
import { db } from "@/server/db";
import { assets, jobs } from "@/server/db/schema";
import { env } from "@/server/env";
import { generateMeshyVehicle } from "@/server/providers/meshy";
import { storage } from "@/server/storage";
import { openGlbInUnrealEditor } from "@/server/unreal/openInEditor";

// maxRetriesPerRequest stays null (required for BullMQ's blocking reads), but
// connectTimeout + retryStrategy + an error listener keep a broken connection
// from failing silently — without these, a network issue looks identical to
// "no jobs queued" from the outside.
const connection = new IORedis(env().REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 10_000,
  retryStrategy: (times) => Math.min(times * 1_000, 10_000)
});
connection.on("error", (error) => console.error("[worker] Redis connection error:", error.message));
connection.on("ready", () => console.log("[worker] Redis connection ready"));

const worker = new Worker(
  "forge-generation",
  async (queueJob) => {
    const databaseJobId = String(queueJob.data.databaseJobId);
    await db.update(jobs).set({ status: "running", updatedAt: new Date() }).where(eq(jobs.id, databaseJobId));

    if (queueJob.name !== "generate_vehicle_asset") {
      throw new Error(`Worker does not support ${queueJob.name} yet`);
    }

    const prompt = String(queueJob.data.prompt);
    const texturePrompt = typeof queueJob.data.texturePrompt === "string" ? queueJob.data.texturePrompt : undefined;
    const projectId = String(queueJob.data.projectId);
    const result = await generateMeshyVehicle(prompt, texturePrompt, async (percent, message) => {
      await queueJob.updateProgress(percent);
      await db
        .update(jobs)
        .set({ progress: { percent, message }, updatedAt: new Date() })
        .where(eq(jobs.id, databaseJobId));
    });

    const modelResponse = await fetch(result.modelUrl, { signal: AbortSignal.timeout(120_000) });
    if (!modelResponse.ok) throw new Error(`Could not download generated GLB (${modelResponse.status})`);
    const bytes = new Uint8Array(await modelResponse.arrayBuffer());
    const stored = await storage().put(bytes, "glb");
    const [asset] = await db
      .insert(assets)
      .values({
        projectId,
        jobId: databaseJobId,
        kind: "model",
        name: `vehicle-${result.providerTaskId}.glb`,
        storageKey: stored.key,
        mimeType: "model/gltf-binary",
        checksum: stored.checksum,
        metadata: { provider: "meshy", providerTaskId: result.providerTaskId, size: stored.size, thumbnailUrl: result.thumbnailUrl }
      })
      .returning();

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: { percent: 100, message: "Vehicle model ready" },
        output: { assetId: asset.id, storageKey: stored.key },
        updatedAt: new Date()
      })
      .where(eq(jobs.id, databaseJobId));

    try {
      await openGlbInUnrealEditor(bytes, `vehicle_${result.providerTaskId}`);
    } catch (error) {
      console.error("[unreal] Unexpected error launching Unreal Editor:", error);
    }

    return { assetId: asset.id };
  },
  { connection, concurrency: 2 }
);

worker.on("failed", async (queueJob, error) => {
  if (!queueJob) return;
  await db
    .update(jobs)
    .set({ status: "failed", error: error.message, updatedAt: new Date() })
    .where(eq(jobs.id, String(queueJob.data.databaseJobId)));
});

console.log("Forge generation worker is running");

async function shutdown() {
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assets, jobs } from "@/server/db/schema";
import { env } from "@/server/env";
import { generateMeshyVehicle } from "@/server/providers/meshy";
import { storage } from "@/server/storage";
import { openGlbInUnrealEditor, type UnrealImportResult } from "@/server/unreal/openInEditor";

// Turns "a low, wide retro-futuristic coupe with..." into "low-wide-retro-futuristic" —
// a short, human-readable prefix so asset names mean something at a glance, with the
// provider task id suffix keeping them unique.
function slugifyPrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  return words.join("-") || "vehicle";
}

export type GenerationInput = {
  databaseJobId: string;
  projectId: string;
  toolName: string;
  prompt: string;
  texturePrompt?: string;
};

// Runs a full vehicle-generation job to completion: Meshy preview + refine,
// GLB download, asset storage, and a best-effort Unreal Editor import. Always
// updates the job row's status/progress/error itself — callers don't need to.
export async function processGenerationJob(input: GenerationInput): Promise<void> {
  const { databaseJobId, projectId, toolName, prompt, texturePrompt } = input;
  try {
    await db.update(jobs).set({ status: "running", updatedAt: new Date() }).where(eq(jobs.id, databaseJobId));

    if (toolName !== "generate_vehicle_asset") {
      throw new Error(`Generation does not support "${toolName}" yet`);
    }
    if (env().MODEL_GENERATION_PROVIDER !== "meshy") {
      throw new Error(`3D provider "${env().MODEL_GENERATION_PROVIDER}" is not implemented yet — only "meshy" is supported`);
    }

    const result = await generateMeshyVehicle(prompt, texturePrompt, async (percent, message) => {
      await db
        .update(jobs)
        .set({ progress: { percent, message }, updatedAt: new Date() })
        .where(eq(jobs.id, databaseJobId));
    });

    const modelResponse = await fetch(result.modelUrl, { signal: AbortSignal.timeout(120_000) });
    if (!modelResponse.ok) throw new Error(`Could not download generated GLB (${modelResponse.status})`);
    const bytes = new Uint8Array(await modelResponse.arrayBuffer());
    const stored = await storage().put(bytes, "glb");
    const assetName = `${slugifyPrompt(prompt)}-${result.providerTaskId.slice(0, 6)}.glb`;
    const [asset] = await db
      .insert(assets)
      .values({
        projectId,
        jobId: databaseJobId,
        kind: "model",
        name: assetName,
        storageKey: stored.key,
        mimeType: "model/gltf-binary",
        checksum: stored.checksum,
        metadata: { provider: "meshy", providerTaskId: result.providerTaskId, size: stored.size, thumbnailUrl: result.thumbnailUrl }
      })
      .returning();

    let unrealImport = await openGlbInUnrealEditor(bytes, assetName.replace(/\.glb$/, "")).catch(
      (error): UnrealImportResult => ({
        status: "error",
        message: error instanceof Error ? error.message : "Unexpected error launching Unreal Editor"
      })
    );
    // No local Unreal to launch here (typically: this is running on Vercel,
    // not your machine) — if a bridge token is configured, queue it for the
    // bridge running inside your Editor instead of giving up.
    if (unrealImport.status === "skipped" && env().UNREAL_BRIDGE_TOKEN) {
      unrealImport = { status: "pending" };
    }

    await db
      .update(jobs)
      .set({
        status: "completed",
        progress: { percent: 100, message: "Vehicle model ready" },
        output: { assetId: asset.id, storageKey: stored.key, unrealImport },
        updatedAt: new Date()
      })
      .where(eq(jobs.id, databaseJobId));
  } catch (error) {
    await db
      .update(jobs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Generation failed",
        updatedAt: new Date()
      })
      .where(eq(jobs.id, databaseJobId));
  }
}

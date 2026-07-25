import { env } from "@/server/env";

type MeshyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  progress: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
  task_error?: { message?: string };
};

const baseUrl = "https://api.meshy.ai/openapi/v2/text-to-3d";

async function meshyRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env().MESHY_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Meshy request failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function waitForTask(id: string, onProgress: (progress: number) => Promise<void>) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const task = await meshyRequest<MeshyTask>(`${baseUrl}/${id}`);
    await onProgress(task.progress ?? 0);
    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED" || task.status === "EXPIRED") {
      throw new Error(task.task_error?.message || `Meshy task ${task.status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Meshy generation timed out");
}

export async function generateMeshyVehicle(
  prompt: string,
  texturePrompt: string | undefined,
  onProgress: (percent: number, message: string) => Promise<void>
) {
  if (!env().MESHY_API_KEY) throw new Error("MESHY_API_KEY is not configured");

  const preview = await meshyRequest<{ result: string }>(baseUrl, {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt,
      should_remesh: true,
      target_polycount: 100_000,
      target_formats: ["glb"]
    })
  });
  const previewTask = await waitForTask(preview.result, (progress) =>
    onProgress(Math.round(progress * 0.45), "Generating vehicle geometry")
  );

  const refine = await meshyRequest<{ result: string }>(baseUrl, {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewTask.id,
      enable_pbr: true,
      target_formats: ["glb"],
      ...(texturePrompt ? { texture_prompt: texturePrompt } : {})
    })
  });
  const refinedTask = await waitForTask(refine.result, (progress) =>
    onProgress(45 + Math.round(progress * 0.45), "Creating PBR materials")
  );

  if (!refinedTask.model_urls?.glb) throw new Error("Meshy completed without a GLB output");
  return {
    providerTaskId: refinedTask.id,
    modelUrl: refinedTask.model_urls.glb,
    thumbnailUrl: refinedTask.thumbnail_url
  };
}

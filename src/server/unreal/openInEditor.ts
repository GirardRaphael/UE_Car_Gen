import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/server/env";

function sanitizeAssetName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 80) || "ForgeAsset";
}

async function resolveEditorExecutable(projectPath: string): Promise<string | null> {
  const override = env().UNREAL_EDITOR_EXE;
  if (override) return existsSync(override) ? override : null;

  try {
    const raw = await readFile(projectPath, "utf8");
    const engineAssociation = (JSON.parse(raw) as { EngineAssociation?: string }).EngineAssociation;
    if (!engineAssociation) return null;
    const candidate = path.join(
      "C:\\Program Files\\Epic Games",
      `UE_${engineAssociation}`,
      "Engine",
      "Binaries",
      "Win64",
      "UnrealEditor.exe"
    );
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function buildImportScript(glbPath: string, assetName: string, destinationPath: string): string {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `import unreal

glb_path = "${escape(glbPath)}"
asset_name = "${escape(assetName)}"
destination_path = "${escape(destinationPath)}"

unreal.log("ForgeAI: importing {} as {} into {}".format(glb_path, asset_name, destination_path))

task = unreal.AssetImportTask()
task.filename = glb_path
task.destination_path = destination_path
task.destination_name = asset_name
task.automated = True
task.save = True
task.replace_existing = True

unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

imported_paths = task.get_editor_property("imported_object_paths")
if not imported_paths:
    unreal.log_error("ForgeAI: import produced no assets for {}".format(glb_path))
else:
    unreal.log("ForgeAI: imported {}".format(imported_paths))
    mesh = unreal.load_asset(imported_paths[0])
    if mesh is None:
        unreal.log_error("ForgeAI: could not load imported asset {}".format(imported_paths[0]))
    else:
        try:
            actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
            actor = actor_subsystem.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
            actor_subsystem.set_selected_level_actors([actor])
            unreal.log("ForgeAI: spawned {} into the level".format(asset_name))
        except Exception as spawn_error:
            unreal.log_warning("ForgeAI: import succeeded but spawning into the level failed: {}".format(spawn_error))
        try:
            editor_subsystem = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
            camera_location = unreal.Vector(400, 400, 300)
            camera_rotation = unreal.MathLibrary.find_look_at_rotation(camera_location, unreal.Vector(0, 0, 0))
            editor_subsystem.set_level_viewport_camera_info(camera_location, camera_rotation)
        except Exception as camera_error:
            unreal.log_warning("ForgeAI: could not aim the viewport camera: {}".format(camera_error))
`;
}

// Discriminated result so callers (and the UI) can tell the difference between
// "not configured", "failed to launch", and "launched" — there is no feedback
// channel back from the detached Unreal process, so "launched" is the strongest
// claim we can honestly make; it does not mean the import inside Unreal succeeded.
export type UnrealImportResult =
  | { status: "skipped"; reason: string }
  | { status: "launched" }
  | { status: "error"; message: string };

/**
 * Launches Unreal Editor with the configured project and asks it to import the
 * generated GLB. Never throws — a missing/misconfigured Unreal setup should not
 * fail the generation job itself — but the caller must inspect the returned
 * status rather than assume success.
 */
export async function openGlbInUnrealEditor(glbBytes: Uint8Array, rawAssetName: string): Promise<UnrealImportResult> {
  const projectPath = env().UNREAL_PROJECT_PATH;
  if (!projectPath) {
    console.log("[unreal] UNREAL_PROJECT_PATH not set, skipping Unreal import");
    return { status: "skipped", reason: "UNREAL_PROJECT_PATH is not set" };
  }
  if (!existsSync(projectPath)) {
    console.error(`[unreal] Project not found at ${projectPath}, skipping Unreal import`);
    return { status: "skipped", reason: `Project not found at ${projectPath}` };
  }

  const editorExe = await resolveEditorExecutable(projectPath);
  if (!editorExe) {
    console.error("[unreal] Could not locate UnrealEditor.exe (set UNREAL_EDITOR_EXE to override), skipping Unreal import");
    return { status: "skipped", reason: "Could not locate UnrealEditor.exe (set UNREAL_EDITOR_EXE to override)" };
  }

  const assetName = sanitizeAssetName(rawAssetName);
  const stagingDir = path.join(os.tmpdir(), "forge-ai-unreal", randomUUID());
  await mkdir(stagingDir, { recursive: true });
  const glbPath = path.join(stagingDir, `${assetName}.glb`);
  const scriptPath = path.join(stagingDir, "import.py");

  await writeFile(glbPath, glbBytes);
  await writeFile(scriptPath, buildImportScript(glbPath, assetName, env().UNREAL_CONTENT_ROOT), "utf8");

  console.log(`[unreal] Launching ${editorExe} with ${projectPath}`);
  return new Promise<UnrealImportResult>((resolve) => {
    let settled = false;
    const settle = (result: UnrealImportResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(editorExe, [projectPath, `-ExecutePythonScript=${scriptPath}`], {
      detached: true,
      stdio: "ignore"
    });
    child.on("error", (error) => {
      console.error("[unreal] Failed to launch Unreal Editor:", error.message);
      settle({ status: "error", message: error.message });
    });
    child.unref();
    // A failed spawn (e.g. ENOENT) emits its 'error' event almost immediately;
    // if nothing fired within this window, treat the launch as successful.
    setTimeout(() => settle({ status: "launched" }), 500);
  });
}

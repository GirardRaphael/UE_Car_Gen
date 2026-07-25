import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(20),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ASSET_STORAGE_DRIVER: z.enum(["local", "blob", "s3"]).default("local"),
  ASSET_STORAGE_PATH: z.string().default("./storage"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  MODEL_GENERATION_PROVIDER: z.enum(["meshy", "tripo"]).default("meshy"),
  MESHY_API_KEY: z.string().optional(),
  TRIPO_API_KEY: z.string().optional(),
  UNREAL_BRIDGE_TOKEN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(32).optional()
  ),
  // Optional until the ForgeAIBridge Unreal plugin (Phase 4) lands and actually reads these.
  UNREAL_BRIDGE_WS_URL: z.string().url().optional(),
  // When set, the worker launches this project in Unreal Editor and imports each
  // finished GLB automatically. Only meaningful when the worker runs on the same
  // machine as the Unreal install.
  UNREAL_PROJECT_PATH: z.string().min(1).optional(),
  UNREAL_CONTENT_ROOT: z.string().startsWith("/Game/").default("/Game/ForgeAI"),
  // Optional override for the UnrealEditor(-Cmd).exe path. If unset, it's derived
  // from the .uproject's EngineAssociation under the standard Epic Games Launcher
  // install location.
  UNREAL_EDITOR_EXE: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional()
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
      throw new Error(`Invalid server environment:\n${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}

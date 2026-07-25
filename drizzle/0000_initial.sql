CREATE TYPE "message_role" AS ENUM ('user', 'assistant', 'tool');
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "asset_kind" AS ENUM ('reference', 'model', 'texture', 'render');

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "openai_response_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" message_role NOT NULL,
  "content" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" job_status NOT NULL DEFAULT 'queued',
  "progress" jsonb NOT NULL DEFAULT '{"percent":0,"message":"Queued"}'::jsonb,
  "input" jsonb NOT NULL,
  "output" jsonb,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "job_id" uuid REFERENCES "jobs"("id") ON DELETE SET NULL,
  "kind" asset_kind NOT NULL,
  "name" text NOT NULL,
  "storage_key" text NOT NULL UNIQUE,
  "mime_type" text NOT NULL,
  "checksum" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");
CREATE INDEX "jobs_project_created_idx" ON "jobs" ("project_id", "created_at");
CREATE INDEX "assets_project_created_idx" ON "assets" ("project_id", "created_at");

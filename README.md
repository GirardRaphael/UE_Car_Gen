# Forge AI — Unreal Vehicle Studio

Forge AI is a TypeScript production foundation for generating vehicle concepts through conversation, creating real GLB assets with Meshy, storing project history in PostgreSQL, and preparing those assets for an Unreal Engine editor bridge.

## Included

- Next.js 16 App Router and React 19 interface
- Server-only environment validation
- Anthropic Claude (Messages API) with streamed SSE output and strict tools
- Multiple projects, each with multiple chat conversations, switchable from the sidebar
- Vehicle customization panel (paint color, finish, wheels, trim, ride height, light signature) that feeds directly into the generation prompt
- PostgreSQL persistence through Drizzle ORM
- Meshy Text-to-3D preview + PBR refinement pipeline, run in the background of the chat request itself (see "Request flow") — no separate worker process or queue to host
- SHA-256 verified local/Blob asset storage
- Health and persisted studio APIs
- Docker Compose for local PostgreSQL (optional — see below)
- Standalone production build configuration

## Local setup

1. Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.
   `DATABASE_URL` can point at the local Docker Postgres below, or a hosted
   database (e.g. Neon) — nothing else changes.
2. Start application services (skip if using a hosted Postgres instead):

   ```powershell
   docker compose up -d
   ```

3. Install dependencies:

   ```powershell
   npm install
   ```

4. Apply the database migrations, in order, against whichever Postgres you're
   using:

   ```powershell
   # Local Docker Postgres:
   Get-Content drizzle/0000_initial.sql | docker compose exec -T postgres psql -U forge -d forge_ai
   Get-Content drizzle/0001_rename_provider_response_id.sql | docker compose exec -T postgres psql -U forge -d forge_ai

   # Hosted Postgres (e.g. Neon) — run each file's contents via psql or the
   # provider's SQL console instead.
   ```

5. Start the web application:

   ```powershell
   npm run dev
   ```

Open `http://localhost:3000`. Service health is available at `http://localhost:3000/api/health`.
There's no separate worker to start — vehicle generation runs in the background
of the `/api/chat` request itself (see "Request flow" below).

## Request flow

1. `POST /api/chat` validates the project conversation and persists the user message.
   If the vehicle customization panel (paint color, finish, wheels, trim,
   ride height, light signature) has any fields set, a `[Customization: …]`
   line is appended to the message so it's visible in the transcript and part
   of what the model sees — nothing is applied silently.
2. The server calls the Anthropic Claude Messages API and streams text/tool events to the browser.
3. A `generate_vehicle_asset` tool call creates a PostgreSQL job row, then hands
   it to `processGenerationJob` (`src/server/generation.ts`) via Vercel's
   `waitUntil` — the SSE response finishes and closes normally (with a
   `"queued"` tool event) while generation keeps running server-side in the
   background. The client learns about progress and completion entirely by
   polling `/api/jobs/[id]`, which already reads live job state from Postgres.
4. That background job asks Meshy for preview geometry and then PBR refinement,
   updating the job's `progress` in Postgres after each poll.
5. It downloads the GLB, computes its checksum, stores it, and creates an asset
   record named from the prompt (e.g. `low-wide-retro-coupe-a1b2c3.glb`) so
   it's identifiable in the UI and asset storage, not just a task id.
6. If `UNREAL_PROJECT_PATH` is set (only meaningful when `npm run dev` runs on
   the same machine as your Unreal install — the production deployment has no
   local Unreal to launch), it launches Unreal Editor and runs a Python import
   script against the GLB. This is best-effort: it never blocks or fails the
   generation job, and its outcome is recorded on the job separately from the
   model-generation result.
7. The future Unreal bridge (Phase 4) will replace this local launch with an
   authenticated WebSocket connection so importing doesn't depend on Unreal
   running on the same machine as whatever processes the job.

Because generation runs inside the `/api/chat` invocation's extended
(`waitUntil`) lifetime, that route sets `export const maxDuration = 800` —
comfortably above typical Meshy turnaround, but still a hard ceiling. A
generation that runs longer than that gets killed mid-flight and its job is
left stuck in `"running"` rather than marked `"failed"`; there's no resume
path for that case yet.

## Projects and conversations

The sidebar lists every project and, for the active project, every
conversation — both are real, persisted rows (`projects`/`conversations`
tables), not placeholders. "＋ New project" creates a project (with a starter
conversation) and switches to it; "＋ New chat" starts a fresh conversation
within the current project. Switching either refetches `/api/studio` with the
corresponding `projectId`/`conversationId` query params.

## Production deployment

**Live**: https://ue-car-gen.vercel.app (Vercel project `ue-car-gen`). Both the
web app and vehicle generation run entirely on Vercel Functions — there's no
separate worker process to host anywhere.

1. Provision PostgreSQL reachable from Vercel (e.g. Neon). Apply every file in
   `drizzle/`, in order, against the production database.
2. Set `ASSET_STORAGE_DRIVER=blob` and `BLOB_READ_WRITE_TOKEN` (from a Vercel
   Blob store) — the `local` filesystem driver has no shared disk across
   Vercel Function invocations, so it only works for `npm run dev`.
3. Set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `MESHY_API_KEY`, `DATABASE_URL`
   in the Vercel project (Production + Preview).
4. Deploy with `vercel deploy --prod`.

Note: there is currently no per-user authentication, project ownership, or
credential encryption — every deployment is a single shared workspace with one
project. See Phase 1 and Phase 6 of `IMPLEMENTATION_PLAN.md` for what's still
needed before this is a real multi-user product.

`UNREAL_PROJECT_PATH`, `UNREAL_CONTENT_ROOT`, and `UNREAL_EDITOR_EXE` only do
anything when `npm run dev` runs on the same machine as an Unreal install —
Vercel's production deployment has no local Unreal to launch, so generated
models there never get auto-imported; that step is silently skipped (recorded
on the job as `unrealImport: { status: "skipped", ... }`, shown honestly in
the UI). `UNREAL_BRIDGE_TOKEN` and `UNREAL_BRIDGE_WS_URL` remain unused until
the `ForgeAIBridge` plugin (Phase 4) exists to receive imports remotely.

## Unreal project requirements

Enable these plugins in `MyProject` and restart Unreal:

- Python Editor Script Plugin
- Editor Scripting Utilities
- Interchange Framework
- Interchange Editor
- Remote Control API
- Movie Render Queue

The web application is ready for the next integration phase, but Unreal import still requires the planned `ForgeAIBridge` editor plugin. The plugin must authenticate with `UNREAL_BRIDGE_TOKEN`, expose only allow-listed commands, import GLB files through Interchange, create materials/scenes, and return render outputs.

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the complete roadmap.

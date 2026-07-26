# Forge AI — Unreal Vehicle Studio

Forge AI is a TypeScript production foundation for generating vehicle concepts through conversation, creating real GLB assets with Meshy, storing project history in PostgreSQL, processing durable jobs with Redis/BullMQ, and preparing those assets for an Unreal Engine editor bridge.

## Included

- Next.js 16 App Router and React 19 interface
- Server-only environment validation
- Anthropic Claude (Messages API) with streamed SSE output and strict tools
- Multiple projects, each with multiple chat conversations, switchable from the sidebar
- Vehicle customization panel (paint color, finish, wheels, trim, ride height, light signature) that feeds directly into the generation prompt
- PostgreSQL persistence through Drizzle ORM
- Redis/BullMQ generation queue and standalone worker
- Meshy Text-to-3D preview + PBR refinement pipeline
- SHA-256 verified local/Blob asset storage
- Health and persisted studio APIs
- Docker Compose for local PostgreSQL and Redis (optional — see below)
- Standalone production build configuration

## Local setup

1. Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.
   `DATABASE_URL`/`REDIS_URL` can point at the local Docker services below, or
   at hosted services (e.g. Neon + Upstash) — nothing else changes.
2. Start application services (skip if using hosted Postgres/Redis instead):

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

6. In a second terminal, start the durable worker:

   ```powershell
   npm run worker
   ```

Open `http://localhost:3000`. Service health is available at `http://localhost:3000/api/health`.

## Request flow

1. `POST /api/chat` validates the project conversation and persists the user message.
   If the vehicle customization panel (paint color, finish, wheels, trim,
   ride height, light signature) has any fields set, a `[Customization: …]`
   line is appended to the message so it's visible in the transcript and part
   of what the model sees — nothing is applied silently.
2. The server calls the Anthropic Claude Messages API and streams text/tool events to the browser.
3. A `generate_vehicle_asset` tool call creates both a PostgreSQL job and BullMQ queue item.
4. The worker asks Meshy for preview geometry and then PBR refinement.
5. The worker downloads the GLB, computes its checksum, stores it, and creates
   an asset record named from the prompt (e.g. `low-wide-retro-coupe-a1b2c3.glb`)
   so it's identifiable in the UI and asset storage, not just a task id.
6. If `UNREAL_PROJECT_PATH` is set, the worker launches Unreal Editor on its own
   machine and runs a Python import script against the GLB (best-effort — the
   job is not blocked or failed by this step, and its outcome is recorded on
   the job separately from the model-generation result).
7. The future Unreal bridge (Phase 4) will replace this local launch with an
   authenticated WebSocket connection so the worker doesn't need to run on the
   same machine as Unreal.

## Projects and conversations

The sidebar lists every project and, for the active project, every
conversation — both are real, persisted rows (`projects`/`conversations`
tables), not placeholders. "＋ New project" creates a project (with a starter
conversation) and switches to it; "＋ New chat" starts a fresh conversation
within the current project. Switching either refetches `/api/studio` with the
corresponding `projectId`/`conversationId` query params.

## Production deployment

**Live**: https://ue-car-gen.vercel.app (web app + API routes, Vercel project
`ue-car-gen`). The worker (`npm run worker`) is not deployed there — see below
for why — so generation jobs only complete while it's running somewhere.

The web app (chat UI + API routes) deploys to Vercel. The generation worker
(`npm run worker`) holds a persistent BullMQ connection and **cannot run as a
Vercel serverless function** — run it anywhere with a long-lived process (your
own machine, a small VPS, Railway, Fly.io, etc.), pointed at the same
production `DATABASE_URL` / `REDIS_URL`.

1. Provision PostgreSQL and Redis reachable from both Vercel and the worker
   host (e.g. Neon + Upstash). Apply every file in `drizzle/`, in order,
   against the production database.
2. Set `ASSET_STORAGE_DRIVER=blob` and `BLOB_READ_WRITE_TOKEN` (from a Vercel
   Blob store) in every environment that runs the web app or the worker — the
   `local` filesystem driver only works when both share one machine.
3. Set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `MESHY_API_KEY`,
   `DATABASE_URL`, `REDIS_URL` in the Vercel project (Production + Preview)
   and in the worker host's `.env`.
4. Deploy with `vercel deploy --prod`.
5. Start the worker wherever it runs: `npm run worker`.

Note: there is currently no per-user authentication, project ownership, or
credential encryption — every deployment is a single shared workspace with one
project. See Phase 1 and Phase 6 of `IMPLEMENTATION_PLAN.md` for what's still
needed before this is a real multi-user product.

`UNREAL_PROJECT_PATH`, `UNREAL_CONTENT_ROOT`, and `UNREAL_EDITOR_EXE` are read
today by the worker's best-effort auto-import (see "Request flow" above) —
set them if the worker runs on the same machine as your Unreal install.
`UNREAL_BRIDGE_TOKEN` and `UNREAL_BRIDGE_WS_URL` remain unused until the
`ForgeAIBridge` plugin (Phase 4) exists.

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

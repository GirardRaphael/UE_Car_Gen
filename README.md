# Forge AI — Unreal Vehicle Studio

Forge AI is a TypeScript production foundation for generating vehicle concepts through conversation, creating real GLB assets with Meshy, storing project history in PostgreSQL, processing durable jobs with Redis/BullMQ, and preparing those assets for an Unreal Engine editor bridge.

## Included

- Next.js 16 App Router and React 19 interface
- Server-only environment validation
- OpenAI Responses API with streamed SSE output and strict tools
- PostgreSQL persistence through Drizzle ORM
- Redis/BullMQ generation queue and standalone worker
- Meshy Text-to-3D preview + PBR refinement pipeline
- SHA-256 verified local asset storage with an S3-ready adapter boundary
- Health and persisted studio APIs
- Docker Compose for PostgreSQL and Redis
- Standalone production build configuration

## Local setup

1. Fill `.env`. Never commit this file.
2. Start application services:

   ```powershell
   docker compose up -d
   ```

3. Install dependencies:

   ```powershell
   npm install
   ```

4. Apply the initial database migration:

   ```powershell
   Get-Content drizzle/0000_initial.sql | docker compose exec -T postgres psql -U forge -d forge_ai
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
2. The server calls the OpenAI Responses API and streams text/tool events to the browser.
3. A `generate_vehicle_asset` tool call creates both a PostgreSQL job and BullMQ queue item.
4. The worker asks Meshy for preview geometry and then PBR refinement.
5. The worker downloads the GLB, computes its checksum, stores it, and creates an asset record.
6. The future Unreal bridge consumes that asset through an authenticated job.

## Production deployment

The web app (chat UI + API routes) deploys to Vercel. The generation worker
(`npm run worker`) holds a persistent BullMQ connection and **cannot run as a
Vercel serverless function** — run it anywhere with a long-lived process (your
own machine, a small VPS, Railway, Fly.io, etc.), pointed at the same
production `DATABASE_URL` / `REDIS_URL`.

1. Provision PostgreSQL and Redis reachable from both Vercel and the worker
   host (e.g. Neon + Upstash). Apply `drizzle/0000_initial.sql` against the
   production database.
2. Set `ASSET_STORAGE_DRIVER=blob` and `BLOB_READ_WRITE_TOKEN` (from a Vercel
   Blob store) in every environment that runs the web app or the worker — the
   `local` filesystem driver only works when both share one machine.
3. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `MESHY_API_KEY` (or `TRIPO_API_KEY`),
   `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` in
   the Vercel project (Production + Preview) and in the worker host's `.env`.
4. Deploy with `vercel deploy --prod`.
5. Start the worker wherever it runs: `npm run worker`.

`UNREAL_BRIDGE_TOKEN`, `UNREAL_BRIDGE_WS_URL`, `UNREAL_PROJECT_PATH`, and
`UNREAL_CONTENT_ROOT` are optional until the `ForgeAIBridge` plugin (Phase 4)
exists — nothing in the app reads them yet.

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

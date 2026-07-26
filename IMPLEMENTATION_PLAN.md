# Forge AI — Production Implementation Plan

## Product outcome

Forge AI will turn a natural-language vehicle brief into a tracked generation job, produce a real 3D asset, import it into an open Unreal Editor project, build materials and a cinematic scene, and stream progress plus final renders back into the web UI.

## Architecture

```text
Browser UI
   │ HTTPS / server events
   ▼
Forge API + agent orchestrator ─── PostgreSQL (jobs table)
   │          │                    Vercel Function (waitUntil, no separate worker)
   │          └── 3D provider ─── GLB/FBX + textures
   │
   └── bearer-token HTTP poll (today) / authenticated WebSocket (planned)
             ▲
      Unreal Python bridge script (init_unreal.py)
             │
      AssetImportTask import + actor spawn (today)
      materials / scenes / Sequencer / Movie Render Queue (planned)
```

The browser never receives provider keys. The Unreal bridge makes an outbound authenticated connection (currently a 5s HTTP poll; a push-based WebSocket is planned), allowing a hosted Forge backend to communicate with an editor running on the user's machine without exposing an Unreal port to the internet.

## Phase 0 — Stabilize the repository

1. Preserve the current visual design as the UI reference.
2. Replace the static site with a TypeScript application and reusable components.
3. Fix the existing text-encoding corruption.
4. Add formatting, linting, type checking, unit tests, environment validation, and CI.
5. Remove browser `localStorage` credential handling and all simulated success states.

**Acceptance:** clean install, build, lint, type check, and tests all pass.

## Phase 1 — Real application foundation

1. Build the React/Next.js application shell from the existing design.
2. Add typed server routes, structured errors, request IDs, and streaming responses.
3. Add PostgreSQL models for users, projects, conversations, messages, jobs, assets, scenes, Unreal connections, and render outputs.
4. Add local filesystem storage for development and S3-compatible storage for production.
5. Add authentication and project ownership checks.
6. Implement accessible loading, empty, disconnected, error, retry, and cancellation states.

**Acceptance:** users can create projects, persist chats, upload references, and reload without losing state.

## Phase 2 — AI orchestration

1. Use the OpenAI Responses API on the server.
2. Define strict, versioned tool schemas:
   - `create_vehicle_concept`
   - `generate_vehicle_asset`
   - `inspect_generated_asset`
   - `import_asset_to_unreal`
   - `create_vehicle_materials`
   - `build_cinematic_scene`
   - `update_scene_parameter`
   - `render_sequence`
3. Require confirmation for destructive operations such as replacing assets or levels.
4. Store tool calls and outputs as an auditable job timeline.
5. Stream model text and tool progress to the UI.
6. Add prompt templates and validation for vehicle proportions, materials, topology targets, scale, and Unreal naming.

**Acceptance:** chat creates validated jobs instead of simulated cards; failures are visible and retryable.

## Phase 3 — 3D model generation pipeline

1. Integrate one provider first (Meshy or Tripo), behind a provider interface.
2. Support text-to-3D and image-to-3D from one or more concept references.
3. Poll or receive webhooks for long-running generations.
4. Download and validate meshes, textures, material slots, scale, file hashes, and licenses.
5. Create preview thumbnails and a browser 3D viewer using glTF.
6. Keep immutable asset versions so users can compare or revert generations.
7. Add optional Blender processing later for:
   - mesh cleanup and decimation;
   - wheel/body separation;
   - UV and texture repairs;
   - LOD generation;
   - collision preparation.

**Acceptance:** a generated GLB is displayed interactively in the browser and stored as a versioned project asset.

## Phase 4 — Unreal Engine bridge

**Status: a first working version is implemented**, as a deliberately smaller
slice of the plan below — see the README's "Unreal bridge" section for setup.
`Content/Python/init_unreal.py` polls `GET /api/bridge/jobs/next` (bearer-token
auth) every 5s instead of holding an authenticated WebSocket, downloads the
returned asset, imports it via `AssetImportTask` into `/Game/ForgeAI`, spawns
it into the level, and reports success/failure to
`POST /api/bridge/jobs/[id]/report`. This covers "generate on the live site,
have it show up in your Unreal project" end to end. Not yet built: a real
plugin (this is a plain Python startup script, not a packaged
`ForgeAIBridge` plugin), materials/scenes/Sequencer/render commands, and
rollback-aware multi-step jobs — those remain the items below and in Phase 5.

1. Package `ForgeAIBridge` as a proper Unreal editor plugin (currently a plain
   `Content/Python/init_unreal.py` script).
2. Enable and verify:
   - Python Editor Script Plugin;
   - Editor Scripting Utilities;
   - Interchange Framework/Editor;
   - Remote Control API;
   - Movie Render Queue.
3. Replace the 5s HTTP poll with an authenticated outbound WebSocket
   connection to Forge (push-based, lower latency; `UNREAL_BRIDGE_WS_URL` is
   reserved for this).
4. Add heartbeat, engine/project metadata, reconnect, and command acknowledgement.
5. Implement an allow-listed command dispatcher; never execute arbitrary Python supplied by the model.
6. Implement bridge commands beyond basic import:
   - health and project inspection;
   - material instance creation and texture assignment;
   - Nanite, collision, LOD, scale, and pivot configuration;
   - lights, sky, fog, post-process, camera, and Sequencer;
   - save package/level;
   - Movie Render Queue execution;
   - render upload and job completion.
7. Wrap multi-step mutations in rollback-aware jobs and avoid overwriting user assets.

**Acceptance:** pressing “Send to Unreal” imports a selected version, stages it, saves a new level, and reports every step in the UI.

## Phase 5 — Cinematic workflow

1. Create reusable Unreal scene templates: studio, city night, coast, desert, mountain, and volcanic flat.
2. Create a master automotive material with paint, clear coat, carbon, glass, tire, wheel, and emissive presets.
3. Add camera shot presets and editable focal length, aperture, focus target, movement, and duration.
4. Add Lumen/path-traced quality profiles.
5. Render thumbnail, preview, and final presets through Movie Render Queue.
6. Upload renders to the project gallery with metadata and full-resolution viewing.

**Acceptance:** a user can generate a model, choose a scene and shot, render it, and open the final result from Forge.

## Phase 6 — Production hardening

1. Encrypt provider credentials and rotate bridge tokens.
2. Add per-user authorization, rate limits, upload limits, MIME checks, and signed asset URLs.
3. Add CSRF/security headers, input validation, dependency scanning, and secret scanning.
4. Add idempotency keys and durable retries for generation/import/render jobs.
5. Add structured logs, traces, metrics, job timing, and cost tracking.
6. Add database backups and asset retention controls.
7. Add unit, API, integration, Unreal automation, and end-to-end tests.
8. Add staging and production deployments with separate secrets and databases.

**Acceptance:** threat model reviewed, recovery tested, monitored staging flow passes end to end.

## Recommended implementation order

1. Repository/toolchain migration.
2. Database and project persistence.
3. Real streaming chat with tool schemas.
4. First 3D provider and browser GLB viewer.
5. Unreal bridge health connection.
6. Import/model/material commands.
7. Scene/Sequencer/render commands.
8. Authentication, storage, observability, testing, and deployment hardening.

## User inputs required before Phase 2

1. OpenAI API key.
2. One 3D generation provider key: Meshy or Tripo.
3. Absolute path to the target `.uproject`.
4. Installed Unreal Engine version.
5. Choice of initial workflow:
   - Editor-only local tool (fastest);
   - hosted multi-user product (production target).

Do not commit or share `.env`. Commit `.env.example` only.

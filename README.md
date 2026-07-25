# Forge AI

A polished, dependency-free frontend prototype for conversational vehicle creation in Unreal Engine.

## Run locally

From this folder:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Integration points

- Open **Connections** from the profile/settings control to set an AI provider, API key, and MCP endpoint.
- The current UI simulates MCP tool calls (`create_vehicle_model`, `build_cinematic_scene`, and `update_vehicle_scene`).
- For production, proxy model requests through a backend. Do not store API keys in browser storage as this prototype does.
- Connect the MCP endpoint to an Unreal Editor plugin or bridge that exposes safe, allow-listed scene operations.

The included cinematic car image was generated specifically for this project.

"""
Forge AI Unreal Bridge.

Auto-run by Unreal's Python Editor Script Plugin on Editor startup, provided
this file lives at <YourProject>/Content/Python/init_unreal.py. Polls the
deployed Forge AI backend for vehicle-generation jobs waiting to be imported,
downloads each finished GLB, imports it via AssetImportTask (same logic Forge
AI's local auto-import already uses), and reports success/failure back so the
web UI reflects real status instead of guessing.

Setup: copy this file and forge_bridge_config.example.json (renamed to
forge_bridge_config.json, with your real values) into your project's
Content/Python/ folder, then restart Unreal Editor. Watch the Output Log for
lines starting with "ForgeAI bridge:", or read Saved/ForgeBridge/bridge.log
directly (same messages, plus full tracebacks and HTTP response bodies).
"""

import datetime
import json
import os
import threading
import time
import traceback
import urllib.error
import urllib.request

import unreal

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "forge_bridge_config.json")
_POLL_INTERVAL_SECONDS = 5
_DESTINATION_PATH = "/Game/ForgeAI"  # keep in sync with UNREAL_CONTENT_ROOT
_LOG_DIR = os.path.join(unreal.Paths.project_saved_dir(), "ForgeBridge")
_LOG_PATH = os.path.join(_LOG_DIR, "bridge.log")

_pending_imports = []
_lock = threading.Lock()
_log_lock = threading.Lock()


def _log(level, message):
    line = "[{}] {}: {}".format(datetime.datetime.now().isoformat(timespec="seconds"), level, message)
    with _log_lock:
        try:
            os.makedirs(_LOG_DIR, exist_ok=True)
            with open(_LOG_PATH, "a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        except Exception:
            pass  # logging must never crash the bridge
    if level == "ERROR":
        unreal.log_error(message)
    elif level == "WARN":
        unreal.log_warning(message)
    else:
        unreal.log(message)


def _load_config():
    with open(_CONFIG_PATH, "r", encoding="utf-8") as handle:
        config = json.load(handle)
    server_url = config.get("serverUrl", "").rstrip("/")
    token = config.get("token", "")
    if not server_url or not token:
        raise ValueError("forge_bridge_config.json must set serverUrl and token")
    return server_url, token


def _read_http_error_body(error):
    try:
        return error.read().decode("utf-8", errors="replace")
    except Exception:
        return "(could not read response body)"


def _http_json(url, token, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", "Bearer {}".format(token))
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _download(url, token):
    request = urllib.request.Request(url)
    request.add_header("Authorization", "Bearer {}".format(token))
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def _report(server_url, token, job_id, status, message=None):
    body = {"status": status}
    if message:
        body["message"] = message[:2000]
    try:
        _http_json("{}/api/bridge/jobs/{}/report".format(server_url, job_id), token, method="POST", body=body)
    except urllib.error.HTTPError as error:
        _log("ERROR", "could not report job {} — HTTP {}: {}".format(job_id, error.code, _read_http_error_body(error)))
    except Exception:
        _log("ERROR", "could not report job {}\n{}".format(job_id, traceback.format_exc()))


def _poll_loop():
    try:
        server_url, token = _load_config()
    except Exception:
        _log("ERROR", "could not load {}\n{}".format(_CONFIG_PATH, traceback.format_exc()))
        return

    _log("INFO", "polling {} every {}s (log: {})".format(server_url, _POLL_INTERVAL_SECONDS, _LOG_PATH))
    while True:
        try:
            result = _http_json("{}/api/bridge/jobs/next".format(server_url), token)
            job = result.get("job")
            if job:
                _log("INFO", "claimed job {} ({})".format(job["jobId"], job["assetName"]))
                glb_bytes = _download(job["downloadUrl"], token)
                _log("INFO", "downloaded {} bytes for job {}".format(len(glb_bytes), job["jobId"]))
                with _lock:
                    _pending_imports.append((job["jobId"], job["assetName"], glb_bytes, server_url, token))
        except urllib.error.HTTPError as error:
            _log("WARN", "poll failed — HTTP {}: {}".format(error.code, _read_http_error_body(error)))
        except urllib.error.URLError as error:
            _log("WARN", "poll failed — could not reach server: {}".format(error.reason))
        except Exception:
            _log("WARN", "poll failed\n{}".format(traceback.format_exc()))
        time.sleep(_POLL_INTERVAL_SECONDS)


def _sanitize_name(name):
    cleaned = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in name)
    return cleaned[:80] or "ForgeAsset"


def _import_one(job_id, asset_name, glb_bytes, server_url, token):
    asset_name = _sanitize_name(asset_name.replace(".glb", ""))
    staging_dir = os.path.join(unreal.Paths.project_saved_dir(), "ForgeBridge")
    os.makedirs(staging_dir, exist_ok=True)
    glb_path = os.path.join(staging_dir, "{}.glb".format(asset_name))
    with open(glb_path, "wb") as handle:
        handle.write(glb_bytes)

    try:
        task = unreal.AssetImportTask()
        task.filename = glb_path
        task.destination_path = _DESTINATION_PATH
        task.destination_name = asset_name
        task.automated = True
        task.save = True
        task.replace_existing = True
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

        imported_paths = task.get_editor_property("imported_object_paths")
        if not imported_paths:
            raise RuntimeError("import produced no assets")

        mesh = unreal.load_asset(imported_paths[0])
        if mesh is None:
            raise RuntimeError("could not load imported asset {}".format(imported_paths[0]))

        actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        actor = actor_subsystem.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
        actor_subsystem.set_selected_level_actors([actor])
        _log("INFO", "imported and spawned {}".format(asset_name))
        _report(server_url, token, job_id, "imported")
    except Exception as error:
        _log("ERROR", "import failed for {}\n{}".format(asset_name, traceback.format_exc()))
        _report(server_url, token, job_id, "error", str(error))


def _tick(_delta_seconds):
    with _lock:
        batch = list(_pending_imports)
        _pending_imports.clear()
    for job_id, asset_name, glb_bytes, server_url, token in batch:
        _import_one(job_id, asset_name, glb_bytes, server_url, token)


try:
    _tick_handle = unreal.register_slate_post_tick_callback(_tick)
    _poll_thread = threading.Thread(target=_poll_loop, daemon=True)
    _poll_thread.start()
    _log("INFO", "started")
except Exception:
    _log("ERROR", "failed to start\n{}".format(traceback.format_exc()))

import { env } from "@/server/env";

// The bridge endpoints let a caller download generated assets and flip job
// state, so unlike the rest of the read-mostly API they require a real,
// explicitly configured secret — never "no token configured, allow anyway".
export function requireBridgeToken(request: Request): Response | null {
  const token = env().UNREAL_BRIDGE_TOKEN;
  if (!token) {
    return Response.json({ error: "UNREAL_BRIDGE_TOKEN is not configured on this deployment" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (provided !== token) {
    return Response.json({ error: "Invalid or missing bridge token" }, { status: 401 });
  }
  return null;
}

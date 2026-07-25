import { storage } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const data = await storage().get(decodeURIComponent(key));
    return new Response(data.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}

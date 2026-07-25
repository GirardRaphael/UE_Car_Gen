import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { assets } from "@/server/db/schema";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const storageKey = decodeURIComponent(key);
    const [asset] = await db.select().from(assets).where(eq(assets.storageKey, storageKey)).limit(1);
    if (!asset) return Response.json({ error: "Asset not found" }, { status: 404 });

    const data = await storage().get(storageKey);
    return new Response(data.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}

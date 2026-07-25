import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/queue";

export const runtime = "nodejs";

export async function GET() {
  const checks = { database: false, redis: false };
  try {
    await db.execute(sql`select 1`);
    checks.database = true;
  } catch {}
  try {
    checks.redis = (await redis.ping()) === "PONG";
  } catch {}
  return Response.json(
    { ok: checks.database && checks.redis, checks, timestamp: new Date().toISOString() },
    { status: checks.database && checks.redis ? 200 : 503 }
  );
}

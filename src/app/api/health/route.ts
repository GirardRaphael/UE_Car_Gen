import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  const checks = { database: false };
  try {
    await db.execute(sql`select 1`);
    checks.database = true;
  } catch {}
  return Response.json(
    { ok: checks.database, checks, timestamp: new Date().toISOString() },
    { status: checks.database ? 200 : 503 }
  );
}

import { getStudioState } from "@/server/projects";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getStudioState());
  } catch (error) {
    return Response.json(
      { error: "Studio services are unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}

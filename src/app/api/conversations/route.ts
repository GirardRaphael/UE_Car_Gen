import { z } from "zod";
import { createConversation, listConversations } from "@/server/projects";

export const runtime = "nodejs";

const createSchema = z.object({ projectId: z.string().uuid() });

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

  try {
    return Response.json(await listConversations(projectId));
  } catch (error) {
    return Response.json(
      { error: "Studio services are unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid conversation request" }, { status: 400 });

  try {
    return Response.json(await createConversation(parsed.data.projectId), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "Could not create conversation", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}

import { z } from "zod";
import { createProject, listProjects } from "@/server/projects";

export const runtime = "nodejs";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function GET() {
  try {
    return Response.json(await listProjects());
  } catch (error) {
    return Response.json(
      { error: "Studio services are unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid project name" }, { status: 400 });

  try {
    return Response.json(await createProject(parsed.data.name), { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "Could not create project", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}

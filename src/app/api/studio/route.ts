import { getStudioState } from "@/server/projects";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const conversationId = url.searchParams.get("conversationId") ?? undefined;

  try {
    return Response.json(await getStudioState({ projectId, conversationId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const notFound = message === "Project not found" || message === "Conversation not found";
    return Response.json(
      { error: notFound ? message : "Studio services are unavailable", detail: message },
      { status: notFound ? 404 : 503 }
    );
  }
}

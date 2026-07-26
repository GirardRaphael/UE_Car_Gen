import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { conversations, jobs, messages } from "@/server/db/schema";
import { env } from "@/server/env";
import { processGenerationJob } from "@/server/generation";
import { forgeTools } from "@/server/tools";

export const runtime = "nodejs";
// Generous ceiling so a queued vehicle generation (Meshy preview + refine +
// GLB download, run via waitUntil after the SSE response closes) has room to
// finish — the request itself returns in seconds; this bounds the background
// work Vercel keeps the function alive for.
export const maxDuration = 800;

const inputSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(8_000)
});

const encoder = new TextEncoder();
const event = (type: string, data: unknown) =>
  encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid chat request" }, { status: 400 });

  const { projectId, conversationId, message } = parsed.data;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation || conversation.projectId !== projectId) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  await db.insert(messages).values({ conversationId, role: "user", content: message });
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      try {
        const anthropicStream = client.messages.stream({
          model: env().ANTHROPIC_MODEL,
          max_tokens: 4096,
          system:
            "You are Forge AI, an automotive design and Unreal Engine production agent. Be concise, explain planned changes, and call tools only when a real generation or import is requested. Never claim a tool completed unless its output confirms completion. When calling generate_vehicle_asset, synthesize prompt and texturePrompt from every relevant detail the user has given across the whole conversation, not just the latest message.",
          messages: history.map((row) => ({
            role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: row.content
          })),
          tools: forgeTools
        });

        anthropicStream.on("text", (delta) => {
          assistantText += delta;
          controller.enqueue(event("text", { delta }));
        });

        const finalMessage = await anthropicStream.finalMessage();

        if (assistantText) {
          await db.insert(messages).values({ conversationId, role: "assistant", content: assistantText });
        }

        for (const block of finalMessage.content) {
          if (block.type === "tool_use" && block.name === "generate_vehicle_asset") {
            const args = block.input as Record<string, unknown>;
            const [job] = await db
              .insert(jobs)
              .values({ projectId, type: block.name, input: args })
              .returning();
            controller.enqueue(event("tool", { id: job.id, name: block.name, status: "queued" }));
            waitUntil(
              processGenerationJob({
                databaseJobId: job.id,
                projectId,
                toolName: block.name,
                prompt: String(args.prompt ?? ""),
                texturePrompt: typeof args.texturePrompt === "string" ? args.texturePrompt : undefined
              })
            );
          }
        }

        await db
          .update(conversations)
          .set({ providerResponseId: finalMessage.id, updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
        controller.enqueue(event("done", { responseId: finalMessage.id }));
      } catch (error) {
        const message =
          error instanceof Anthropic.APIError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Generation failed";
        controller.enqueue(event("error", { message }));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

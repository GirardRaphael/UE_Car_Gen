import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { conversations, jobs, messages } from "@/server/db/schema";
import { env } from "@/server/env";
import { generationQueue } from "@/server/queue";
import { forgeTools } from "@/server/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const client = new OpenAI({ apiKey: env().OPENAI_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      let responseId: string | undefined;
      try {
        const response = await client.responses.create({
          model: env().OPENAI_MODEL,
          stream: true,
          store: true,
          previous_response_id: conversation.openaiResponseId ?? undefined,
          instructions:
            "You are Forge AI, an automotive design and Unreal Engine production agent. Be concise, explain planned changes, and call tools only when a real generation or import is requested. Never claim a tool completed unless its output confirms completion.",
          input: [{ role: "user", content: message }],
          tools: forgeTools
        });

        for await (const item of response) {
          if (item.type === "response.created") responseId = item.response.id;
          if (item.type === "response.output_text.delta") {
            assistantText += item.delta;
            controller.enqueue(event("text", { delta: item.delta }));
          }
          if (item.type === "response.output_item.done" && item.item.type === "function_call") {
            const args = JSON.parse(item.item.arguments) as Record<string, unknown>;
            const [job] = await db
              .insert(jobs)
              .values({ projectId, type: item.item.name, input: args })
              .returning();
            await generationQueue.add(
              item.item.name,
              { databaseJobId: job.id, projectId, ...args },
              { jobId: job.id }
            );
            controller.enqueue(event("tool", { id: job.id, name: item.item.name, status: "queued" }));
          }
        }

        if (assistantText) {
          await db.insert(messages).values({ conversationId, role: "assistant", content: assistantText });
        }
        if (responseId) {
          await db
            .update(conversations)
            .set({ openaiResponseId: responseId, updatedAt: new Date() })
            .where(eq(conversations.id, conversationId));
        }
        controller.enqueue(event("done", { responseId }));
      } catch (error) {
        controller.enqueue(event("error", { message: error instanceof Error ? error.message : "Generation failed" }));
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

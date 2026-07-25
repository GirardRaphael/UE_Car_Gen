import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { conversations, messages, projects } from "@/server/db/schema";

export async function ensureDefaultProject() {
  const existing = await db.select().from(projects).limit(1);
  if (existing[0]) return existing[0];
  const [project] = await db
    .insert(projects)
    .values({ name: "Apex GT", description: "AI automotive concept studio" })
    .returning();
  return project;
}

export async function ensureConversation(projectId: string) {
  const existing = await db.select().from(conversations).where(eq(conversations.projectId, projectId)).limit(1);
  if (existing[0]) return existing[0];
  const [conversation] = await db.insert(conversations).values({ projectId }).returning();
  return conversation;
}

export async function getStudioState() {
  const project = await ensureDefaultProject();
  const conversation = await ensureConversation(project.id);
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));
  return { project, conversation, messages: history };
}

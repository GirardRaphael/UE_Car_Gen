import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { conversations, messages, projects } from "@/server/db/schema";

export async function listProjects() {
  return db.select().from(projects).orderBy(desc(projects.updatedAt));
}

export async function createProject(name: string) {
  const [project] = await db.insert(projects).values({ name }).returning();
  await createConversation(project.id);
  return project;
}

async function ensureAnyProject() {
  const [existing] = await listProjects();
  if (existing) return existing;
  const [project] = await db
    .insert(projects)
    .values({ name: "Apex GT", description: "AI automotive concept studio" })
    .returning();
  return project;
}

export async function listConversations(projectId: string) {
  return db.select().from(conversations).where(eq(conversations.projectId, projectId)).orderBy(desc(conversations.updatedAt));
}

export async function createConversation(projectId: string) {
  const [conversation] = await db.insert(conversations).values({ projectId }).returning();
  return conversation;
}

async function ensureConversation(projectId: string) {
  const [existing] = await listConversations(projectId);
  if (existing) return existing;
  return createConversation(projectId);
}

export async function getStudioState(options: { projectId?: string; conversationId?: string } = {}) {
  const project = options.projectId
    ? (await db.select().from(projects).where(eq(projects.id, options.projectId)).limit(1))[0]
    : undefined;
  if (options.projectId && !project) throw new Error("Project not found");
  const activeProject = project ?? (await ensureAnyProject());

  const conversation = options.conversationId
    ? (await db.select().from(conversations).where(eq(conversations.id, options.conversationId)).limit(1))[0]
    : undefined;
  if (options.conversationId && (!conversation || conversation.projectId !== activeProject.id)) {
    throw new Error("Conversation not found");
  }
  const activeConversation = conversation ?? (await ensureConversation(activeProject.id));

  const [allProjects, projectConversations, history] = await Promise.all([
    listProjects(),
    listConversations(activeProject.id),
    db.select().from(messages).where(eq(messages.conversationId, activeConversation.id)).orderBy(asc(messages.createdAt))
  ]);

  return {
    project: activeProject,
    projects: allProjects,
    conversation: activeConversation,
    conversations: projectConversations,
    messages: history
  };
}

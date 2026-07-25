import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const messageRole = pgEnum("message_role", ["user", "assistant", "tool"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const assetKind = pgEnum("asset_kind", ["reference", "model", "texture", "render"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  openaiResponseId: text("openai_response_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRole("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  progress: jsonb("progress").$type<{ percent: number; message: string }>().notNull().default({ percent: 0, message: "Queued" }),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  kind: assetKind("kind").notNull(),
  name: text("name").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  checksum: text("checksum").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

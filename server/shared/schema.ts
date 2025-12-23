import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tabel untuk menyimpan Profile Persona (Gwen Stacy, dll)
export const personas = pgTable("personas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g. "Gwen Stacy"
  description: text("description"), // Deskripsi singkat
  systemPrompt: text("system_prompt").notNull(), // Instruksi "Jiwa" dari file .md
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tabel untuk Knowledge Base Files
export const knowledgeFiles = pgTable("knowledge_files", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").references(() => personas.id).notNull(), // Link ke persona
  filename: text("filename").notNull(),
  content: text("content").notNull(), // Isi file teks
  fileType: text("file_type").notNull(), // .md, .txt, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  model: text("model").notNull().default("gpt-5.1"), // "gpt-5.1" or "ollama"
  personaId: integer("persona_id").references(() => personas.id), // Link ke persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => chatSessions.id).notNull(),
  role: text("role").notNull(), // "user", "assistant", "system"
  content: text("content").notNull(),
  meta: jsonb("meta"), // Untuk menyimpan info tambahan (misal token usage)
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPersonaSchema = createInsertSchema(personas).omit({ id: true, createdAt: true });
export const insertKnowledgeFileSchema = createInsertSchema(knowledgeFiles).omit({ id: true, createdAt: true });
export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Persona = typeof personas.$inferSelect;
export type KnowledgeFile = typeof knowledgeFiles.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;

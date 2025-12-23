import { db } from "./db";
import { 
  chatSessions, messages, personas, knowledgeFiles, learnedKnowledge,
  type ChatSession, type InsertChatSession, 
  type Message, type InsertMessage,
  type Persona, type InsertPersona,
  type KnowledgeFile,
  type LearnedKnowledge, type InsertLearnedKnowledge
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Personas
  getAllPersonas(): Promise<Persona[]>;
  getPersona(id: number): Promise<Persona | undefined>;
  createPersona(persona: InsertPersona): Promise<Persona>;
  updatePersona(id: number, updates: Partial<InsertPersona>): Promise<Persona | undefined>;
  seedDefaultPersona(): Promise<void>;

  // Knowledge
  addKnowledgeFile(personaId: number, filename: string, content: string, fileType: string): Promise<KnowledgeFile>;
  getKnowledgeFiles(personaId: number): Promise<KnowledgeFile[]>;
  
  // Learned Knowledge
  addLearnedKnowledge(data: InsertLearnedKnowledge): Promise<LearnedKnowledge>;
  getLearnedKnowledge(personaId: number): Promise<LearnedKnowledge[]>;
  searchLearnedKnowledge(personaId: number, query: string): Promise<LearnedKnowledge | undefined>;

  // Sessions
  getAllSessions(): Promise<ChatSession[]>;
  getSession(id: number): Promise<ChatSession | undefined>;
  createSession(session: InsertChatSession): Promise<ChatSession>;
  deleteSession(id: number): Promise<void>;

  // Messages
  getMessages(sessionId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class DatabaseStorage implements IStorage {
  // --- Persona ---
  async getAllPersonas(): Promise<Persona[]> {
    return await db.select().from(personas);
  }

  async getPersona(id: number): Promise<Persona | undefined> {
    const [persona] = await db.select().from(personas).where(eq(personas.id, id));
    return persona;
  }

  async createPersona(insertPersona: InsertPersona): Promise<Persona> {
    const [persona] = await db.insert(personas).values(insertPersona).returning();
    return persona;
  }

  async updatePersona(id: number, updates: Partial<InsertPersona>): Promise<Persona | undefined> {
    const [updated] = await db.update(personas)
        .set(updates)
        .where(eq(personas.id, id))
        .returning();
    return updated;
  }

  async seedDefaultPersona(): Promise<void> {
    const existing = await this.getAllPersonas();
    if (existing.length === 0) {
        await this.createPersona({
            name: "Gwen Stacy",
            description: "The Spider-Woman from another universe.",
            systemPrompt: `You are Gwen Stacy. You play drums, you save the city, and you're a bit of a rebel. 
            Speak casually, act cool, but care deeply about your friends.`,
            isDefault: true
        });
    }
  }

  // --- Knowledge ---
  async addKnowledgeFile(personaId: number, filename: string, content: string, fileType: string): Promise<KnowledgeFile> {
      const [file] = await db.insert(knowledgeFiles).values({
          personaId,
          filename,
          content,
          fileType
      }).returning();
      return file;
  }

  async getKnowledgeFiles(personaId: number): Promise<KnowledgeFile[]> {
      return await db.select().from(knowledgeFiles).where(eq(knowledgeFiles.personaId, personaId));
  }

  // --- Learned Knowledge ---
  async addLearnedKnowledge(data: InsertLearnedKnowledge): Promise<LearnedKnowledge> {
      const [learned] = await db.insert(learnedKnowledge).values(data).returning();
      return learned;
  }

  async getLearnedKnowledge(personaId: number): Promise<LearnedKnowledge[]> {
      return await db.select().from(learnedKnowledge)
          .where(eq(learnedKnowledge.personaId, personaId))
          .orderBy(desc(learnedKnowledge.createdAt));
  }

  async searchLearnedKnowledge(personaId: number, query: string): Promise<LearnedKnowledge | undefined> {
      const all = await this.getLearnedKnowledge(personaId);
      const queryLower = query.toLowerCase();
      for (const item of all) {
          if (item.question.toLowerCase().includes(queryLower) || 
              queryLower.includes(item.question.toLowerCase().slice(0, 30))) {
              return item;
          }
      }
      return undefined;
  }

  // --- Sessions ---
  async getAllSessions(): Promise<ChatSession[]> {
    return await db.select().from(chatSessions).orderBy(desc(chatSessions.createdAt));
  }

  async getSession(id: number): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async createSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const [session] = await db.insert(chatSessions).values(insertSession).returning();
    return session;
  }

  async deleteSession(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.sessionId, id));
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  // --- Messages ---
  async getMessages(sessionId: number): Promise<Message[]> {
    return await db.select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(messages.createdAt);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }
}

export const storage = new DatabaseStorage();

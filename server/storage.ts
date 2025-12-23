import { db } from "./db";
import { 
  chatSessions, messages, personas,
  type ChatSession, type InsertChatSession, 
  type Message, type InsertMessage,
  type Persona, type InsertPersona
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Personas
  getAllPersonas(): Promise<Persona[]>;
  getPersona(id: number): Promise<Persona | undefined>;
  createPersona(persona: InsertPersona): Promise<Persona>;
  updatePersona(id: number, updates: Partial<InsertPersona>): Promise<Persona | undefined>;
  seedDefaultPersona(): Promise<void>;

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
            systemPrompt: `You are Gwen Stacy, also known as Spider-Woman or Ghost-Spider. 
            You are cool, witty, drumming in a band, and slightly rebellious but deeply caring.
            You speak with a modern, youthful tone. You often use metaphors related to music or webs.
            Always stay in character.`,
            isDefault: true
        });
    }
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

import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/image/client"; // Use pre-configured client
import OpenAI from "openai";

// Client khusus untuk chat streaming
const chatOpenAI = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // --- PERSONA ROUTES ---
  app.get(api.personas.list.path, async (req, res) => {
    const personas = await storage.getAllPersonas();
    res.json(personas);
  });

  app.post(api.personas.create.path, async (req, res) => {
    try {
      const input = api.personas.create.input.parse(req.body);
      const persona = await storage.createPersona(input);
      res.status(201).json(persona);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.personas.update.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const input = api.personas.update.input.parse(req.body);
      const persona = await storage.updatePersona(id, input);
      if (!persona) return res.status(404).json({ message: "Persona not found" });
      res.json(persona);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ message: err.errors[0].message });
        }
        res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- SESSION ROUTES ---
  app.get(api.sessions.list.path, async (req, res) => {
    const sessions = await storage.getAllSessions();
    res.json(sessions);
  });

  app.post(api.sessions.create.path, async (req, res) => {
    try {
      const input = api.sessions.create.input.parse(req.body);
      const session = await storage.createSession(input);
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.sessions.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const session = await storage.getSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    
    const messages = await storage.getMessages(id);
    const persona = session.personaId ? await storage.getPersona(session.personaId) : null;
    
    res.json({ ...session, messages, persona });
  });

  app.delete(api.sessions.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteSession(id);
    res.status(204).send();
  });

  // --- MESSAGE ROUTES ---
  app.post(api.messages.create.path, async (req, res) => {
      // Endpoint ini hanya untuk save manual jika diperlukan
      // Biasanya flow chat lewat /api/chat stream
      try {
        const sessionId = parseInt(req.params.id);
        const input = api.messages.create.input.parse(req.body);
        const message = await storage.createMessage({ ...input, sessionId });
        res.status(201).json(message);
      } catch (err) {
        res.status(400).json({ message: "Invalid input" });
      }
  });

  // --- CHAT STREAMING ---
  app.post(api.chat.stream.path, async (req, res) => {
    const { message, sessionId } = req.body;
    
    // 1. Save user message
    await storage.createMessage({
      sessionId,
      role: "user",
      content: message
    });

    // 2. Get Context (Session & Persona)
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    let systemPrompt = "You are a helpful AI assistant.";
    if (session.personaId) {
        const persona = await storage.getPersona(session.personaId);
        if (persona) systemPrompt = persona.systemPrompt;
    }

    // 3. Get History (Last 10 messages for context)
    const history = await storage.getMessages(sessionId);
    const apiMessages = [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content
        }))
    ];

    // 4. Stream Response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    try {
        const stream = await chatOpenAI.chat.completions.create({
            model: "gpt-5.1", // Default to OpenAI for now
            messages: apiMessages as any,
            stream: true,
            max_completion_tokens: 4096,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                fullResponse += content;
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }
        
        // 5. Save assistant response
        await storage.createMessage({
            sessionId,
            role: "assistant",
            content: fullResponse
        });

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

    } catch (error) {
        console.error("AI Error:", error);
        res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
        res.end();
    }
  });

  // Seed default "Gwen Stacy" persona if empty
  await storage.seedDefaultPersona();

  return httpServer;
}

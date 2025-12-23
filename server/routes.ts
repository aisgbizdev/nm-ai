import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/image/client"; 
import multer from "multer";
import { streamQuery, loadCoreKnowledge, buildSystemPrompt } from "./ai-engine";

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
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

  // --- KNOWLEDGE BASE UPLOAD ---
  app.post(api.personas.uploadKnowledge.path, upload.array("files"), async (req, res) => {
      try {
          const personaId = parseInt(req.params.id);
          const files = req.files as Express.Multer.File[];
          
          if (!files || files.length === 0) {
              return res.status(400).json({ message: "No files uploaded" });
          }

          const uploadedFiles = [];
          for (const file of files) {
              // Convert buffer to string (assuming text files like .md, .txt)
              const content = file.buffer.toString("utf-8");
              const savedFile = await storage.addKnowledgeFile(
                  personaId, 
                  file.originalname, 
                  content, 
                  file.mimetype || "text/plain"
              );
              uploadedFiles.push(savedFile);
          }

          res.status(201).json({ message: "Files uploaded", count: uploadedFiles.length });
      } catch (err) {
          console.error("Upload error:", err);
          res.status(500).json({ message: "Failed to upload knowledge files" });
      }
  });

  app.get(api.personas.getKnowledge.path, async (req, res) => {
      const personaId = parseInt(req.params.id);
      const files = await storage.getKnowledgeFiles(personaId);
      res.json(files);
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
      try {
        const sessionId = parseInt(req.params.id);
        const input = api.messages.create.input.parse(req.body);
        const message = await storage.createMessage({ ...input, sessionId });
        res.status(201).json(message);
      } catch (err) {
        res.status(400).json({ message: "Invalid input" });
      }
  });

  // --- CHAT STREAMING with 3-Tier Engine ---
  app.post(api.chat.stream.path, async (req, res) => {
    const { message, sessionId } = req.body;
    
    await storage.createMessage({
      sessionId,
      role: "user",
      content: message
    });

    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const personaId = session.personaId || 1;
    
    const history = await storage.getMessages(sessionId);
    const apiMessages = history.slice(-10).map(m => ({
        role: m.role,
        content: m.content
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    let responseSource = "openai";

    try {
        for await (const chunk of streamQuery(message, apiMessages, personaId)) {
            if (chunk.content) {
                fullResponse += chunk.content;
                res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
            }
            if (chunk.source) {
                responseSource = chunk.source;
            }
            if (chunk.done) {
                break;
            }
        }
        
        if (fullResponse) {
            await storage.createMessage({
                sessionId,
                role: "assistant",
                content: fullResponse
            });
        }

        res.write(`data: ${JSON.stringify({ done: true, source: responseSource })}\n\n`);
        res.end();

    } catch (error) {
        console.error("AI Error:", error);
        res.write(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`);
        res.end();
    }
  });

  await storage.seedDefaultPersona();

  return httpServer;
}

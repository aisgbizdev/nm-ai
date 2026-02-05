import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/image/client"; 
import multer from "multer";
import { streamQuery, loadCoreKnowledge, buildSystemPrompt, streamChartAnalysis, streamStatementAnalysis, detectImageType } from "./ai-engine";
import { db } from "./db";
import { messages as messagesTable } from "@shared/schema";
import { eq } from "drizzle-orm";

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Store last follow-up questions per session for number expansion
const sessionFollowUps: Map<number, string[]> = new Map();

function extractFollowUpQuestions(response: string): string[] {
  const lines = response.split('\n');
  const questions: string[] = [];
  
  for (const line of lines) {
    const match = line.match(/^[1-3]\.\s*"(.+)"$/);
    if (match && match[1]) {
      questions.push(match[1]);
    }
  }
  
  return questions;
}

// Default follow-up questions for new sessions (matching welcome message)
const DEFAULT_FOLLOWUPS = [
  "Harga gold sekarang berapa?",
  "Kalender ekonomi hari ini",
  "Berapa lot ideal untuk modal $10,000?"
];

function expandNumberToQuestion(sessionId: number, message: string): string {
  const trimmed = message.trim();
  
  // Check if message is just a number 1, 2, or 3
  if (/^[1-3]$/.test(trimmed)) {
    const questions = sessionFollowUps.get(sessionId) || DEFAULT_FOLLOWUPS;
    const questionIndex = parseInt(trimmed) - 1;
    if (questions.length > questionIndex) {
      return questions[questionIndex];
    }
  }
  
  return message;
}

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
    
    // Expand number to question if user typed just 1, 2, or 3
    const expandedMessage = expandNumberToQuestion(sessionId, message);
    
    await storage.createMessage({
      sessionId,
      role: "user",
      content: message  // Store original message for display
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
        // Use expanded message for AI processing
        for await (const chunk of streamQuery(expandedMessage, apiMessages, personaId)) {
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
            // Extract and store follow-up questions for next turn
            const followUps = extractFollowUpQuestions(fullResponse);
            if (followUps.length > 0) {
                sessionFollowUps.set(sessionId, followUps);
            }
            
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

  // --- MESSAGE FEEDBACK ---
  app.post("/api/messages/:messageId/feedback", async (req, res) => {
    try {
      const messageId = parseInt(req.params.messageId);
      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
      }
      
      const allMessages = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
      if (!allMessages.length) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      const targetMessage = allMessages[0];
      if (targetMessage.role !== "assistant") {
        return res.status(400).json({ message: "Can only rate assistant messages" });
      }
      
      const { feedback, comment } = req.body;
      if (!feedback || !["up", "down"].includes(feedback)) {
        return res.status(400).json({ message: "Feedback must be 'up' or 'down'" });
      }
      
      const result = await storage.submitFeedback({
        messageId,
        feedback,
        comment: comment || null
      });
      
      res.json(result);
    } catch (error) {
      console.error("Feedback error:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get("/api/messages/:messageId/feedback", async (req, res) => {
    try {
      const messageId = parseInt(req.params.messageId);
      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
      }
      
      const feedback = await storage.getFeedback(messageId);
      res.json(feedback || null);
    } catch (error) {
      console.error("Get feedback error:", error);
      res.status(500).json({ message: "Failed to get feedback" });
    }
  });

  // --- IMAGE ANALYSIS (Chart or Statement) - Support Multiple Images ---
  app.post("/api/analyze-chart", upload.array("images", 5), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { message, sessionId } = req.body;
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const parsedSessionId = parseInt(sessionId);
      if (isNaN(parsedSessionId)) {
        return res.status(400).json({ message: "Invalid session ID" });
      }

      const imagesData = files.map(file => ({
        base64: file.buffer.toString("base64"),
        mimeType: file.mimetype || "image/png"
      }));

      const firstImage = imagesData[0];
      const imageType = await detectImageType(firstImage.base64, firstImage.mimeType);
      console.log(`Detected image type: ${imageType}, Total images: ${files.length}`);

      const requestLabel = imageType === "statement" 
        ? "[Statement Analysis Request]" 
        : "[Chart Analysis Request]";
      
      const defaultMessage = imageType === "statement"
        ? "Analisa statement trading ini dan berikan rekomendasi trading plan"
        : files.length > 1 
          ? `Analisa ${files.length} gambar ini secara berurutan`
          : "Analisa chart ini";

      const userMessage = message || "";
      
      const imageDataArray = imagesData.map((img, idx) => `data:${img.mimeType};base64,${img.base64}`);
      
      await storage.createMessage({
        sessionId: parsedSessionId,
        role: "user",
        content: `${requestLabel} ${userMessage || defaultMessage}`,
        meta: { 
          imageData: imageDataArray[0],
          additionalImages: imageDataArray.slice(1)
        }
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      const analysisStream = imageType === "statement"
        ? streamStatementAnalysis(firstImage.base64, userMessage || defaultMessage, firstImage.mimeType, imagesData.slice(1))
        : streamChartAnalysis(firstImage.base64, userMessage || defaultMessage, firstImage.mimeType, imagesData.slice(1));

      for await (const chunk of analysisStream) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      if (fullResponse) {
        await storage.createMessage({
          sessionId: parsedSessionId,
          role: "assistant",
          content: fullResponse
        });
      }

      res.write(`data: ${JSON.stringify({ done: true, source: "vision", imageType, imageCount: files.length })}\n\n`);
      res.end();

    } catch (error) {
      console.error("Image analysis error:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });

  await storage.seedDefaultPersona();

  return httpServer;
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertChatSession, type InsertMessage, type InsertChatSession as PersonaInput } from "@shared/schema"; // Reusing types, InsertChatSession was a mistake in prompt but I'll use InsertPersonaSchema content type if I can or infer from routes

// Infer types from routes to be safe
import { z } from "zod";

type Persona = z.infer<typeof api.personas.list.responses[200]>[0];
type CreatePersonaInput = z.infer<typeof api.personas.create.input>;
type UpdatePersonaInput = z.infer<typeof api.personas.update.input>;
type ChatSession = z.infer<typeof api.sessions.list.responses[200]>[0];
type CreateSessionInput = z.infer<typeof api.sessions.create.input>;
type SessionDetail = z.infer<typeof api.sessions.get.responses[200]>;
type CreateMessageInput = z.infer<typeof api.messages.create.input>;

// ==========================================
// PERSONAS
// ==========================================

export function usePersonas() {
  return useQuery({
    queryKey: [api.personas.list.path],
    queryFn: async () => {
      const res = await fetch(api.personas.list.path);
      if (!res.ok) throw new Error("Failed to fetch personas");
      return api.personas.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePersonaInput) => {
      const res = await fetch(api.personas.create.path, {
        method: api.personas.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create persona");
      return api.personas.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.personas.list.path] }),
  });
}

export function useUpdatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdatePersonaInput) => {
      const url = buildUrl(api.personas.update.path, { id });
      const res = await fetch(url, {
        method: api.personas.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update persona");
      return api.personas.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.personas.list.path] }),
  });
}

// ==========================================
// SESSIONS
// ==========================================

export function useSessions() {
  return useQuery({
    queryKey: [api.sessions.list.path],
    queryFn: async () => {
      const res = await fetch(api.sessions.list.path);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return api.sessions.list.responses[200].parse(await res.json());
    },
  });
}

export function useSession(id: number | null) {
  return useQuery({
    queryKey: [api.sessions.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("No ID");
      const url = buildUrl(api.sessions.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch session");
      return api.sessions.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateSessionInput) => {
      const res = await fetch(api.sessions.create.path, {
        method: api.sessions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create session");
      return api.sessions.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] }),
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.sessions.delete.path, { id });
      const res = await fetch(url, { method: api.sessions.delete.method });
      if (!res.ok) throw new Error("Failed to delete session");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] }),
  });
}

// ==========================================
// MESSAGES (Simple Create - for Manual Entry)
// ==========================================

export function useCreateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, ...data }: { sessionId: number } & CreateMessageInput) => {
      // NOTE: The endpoint is /api/sessions/:id/messages
      // But the api definition in routes.ts might have been generic.
      // Let's assume consistent path construction:
      const path = `/api/sessions/${sessionId}/messages`; 
      
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save message");
      return api.messages.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
        // Invalidate the specific session to refresh message list
        queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, variables.sessionId] });
    },
  });
}

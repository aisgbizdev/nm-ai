import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertChatSession, InsertPersona } from "@shared/schema";
import { z } from "zod";

// --- SESSIONS HOOKS ---

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
      if (!id) return null;
      const url = buildUrl(api.sessions.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch session");
      return api.sessions.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertChatSession) => {
      const res = await fetch(api.sessions.create.path, {
        method: api.sessions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create session");
      return api.sessions.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] });
    },
  });
}

// --- PERSONA HOOKS ---

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
    mutationFn: async (data: InsertPersona) => {
      const res = await fetch(api.personas.create.path, {
        method: api.personas.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create persona");
      return api.personas.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.personas.list.path] });
    },
  });
}

export function useUpdatePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertPersona>) => {
      const url = buildUrl(api.personas.update.path, { id });
      const res = await fetch(url, {
        method: api.personas.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update persona");
      return api.personas.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.personas.list.path] });
    },
  });
}

// --- KNOWLEDGE HOOKS ---

export function usePersonaKnowledge(personaId: number) {
  return useQuery({
    queryKey: [api.personas.getKnowledge.path, personaId],
    enabled: !!personaId,
    queryFn: async () => {
      const url = buildUrl(api.personas.getKnowledge.path, { id: personaId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch knowledge");
      return api.personas.getKnowledge.responses[200].parse(await res.json());
    },
  });
}

export function useUploadKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ personaId, formData }: { personaId: number; formData: FormData }) => {
      const url = buildUrl(api.personas.uploadKnowledge.path, { id: personaId });
      const res = await fetch(url, {
        method: api.personas.uploadKnowledge.method,
        body: formData, // Do NOT set Content-Type header, browser sets it for FormData
      });
      if (!res.ok) throw new Error("Failed to upload file");
      return api.personas.uploadKnowledge.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [api.personas.getKnowledge.path, variables.personaId],
      });
    },
  });
}

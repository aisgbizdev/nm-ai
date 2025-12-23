import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertChatSession, InsertMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// ============================================
// SESSIONS HOOKS
// ============================================

export function useSessions() {
  return useQuery({
    queryKey: [api.sessions.list.path],
    queryFn: async () => {
      const res = await fetch(api.sessions.list.path, { credentials: "include" });
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
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch session");
      return api.sessions.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: InsertChatSession) => {
      const res = await fetch(api.sessions.create.path, {
        method: api.sessions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to create session");
      }
      
      return api.sessions.create.responses[201].parse(await res.json());
    },
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.sessions.delete.path, { id });
      const res = await fetch(url, {
        method: api.sessions.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete session");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sessions.list.path] });
      toast({
        title: "Deleted",
        description: "Chat session deleted successfully",
      });
    },
  });
}

// ============================================
// MESSAGE HOOKS
// ============================================

export function useCreateMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ sessionId, content, role }: { sessionId: number, content: string, role: "user" | "assistant" }) => {
      const url = buildUrl(api.messages.create.path, { id: sessionId });
      const res = await fetch(url, {
        method: api.messages.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to save message");
      return api.messages.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // We'll manually manage cache updates in the UI for smoother experience
      // or invalidate here if strictly needed
      queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, variables.sessionId] });
    },
  });
}

// Helper to trigger the AI streaming endpoint
export async function streamChatResponse(
  sessionId: number, 
  message: string, 
  model: string,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void
) {
  try {
    const res = await fetch(api.chat.stream.path, {
      method: api.chat.stream.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message, model }),
      credentials: "include",
    });

    if (!res.ok || !res.body) throw new Error("Streaming failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // SSE format often prefixes lines with "data: "
      // We need to parse that carefully depending on how backend sends it.
      // Assuming raw text stream or standard SSE.
      
      // Simple parsing logic assuming backend sends raw text chunks or standard event stream
      // Adjust if backend sends "data: {...json}" lines
      onChunk(chunk);
    }
    
    onComplete();
  } catch (err) {
    onError(err instanceof Error ? err : new Error("Unknown streaming error"));
  }
}

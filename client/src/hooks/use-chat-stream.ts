import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

interface UseChatStreamProps {
  onChunk?: (chunk: string) => void;
  onFinish?: () => void;
  onError?: (err: Error) => void;
}

export function useChatStream({ onChunk, onFinish, onError }: UseChatStreamProps = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const streamMessage = useCallback(async (sessionId: number, message: string, model?: string) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(api.chat.stream.path, {
        method: api.chat.stream.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, model }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(res.statusText);
      }

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Server sends SSE format: "data: ... \n\n"
        // We need to parse this properly, handling split chunks
        buffer += chunk;
        
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (dataStr === "[DONE]") continue; // Standard OpenAI SSE end marker
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.error) {
                throw new Error(data.error);
              }

              if (data.content) {
                onChunk?.(data.content);
              }
              
              if (data.done) {
                 // Explicit done signal from our backend
              }
            } catch (e) {
              console.error("Failed to parse SSE data", e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      onFinish?.();
      // Invalidate the session to fetch the final saved message from DB
      queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, sessionId] });
    }
  }, [onChunk, onFinish, onError, queryClient]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  return { streamMessage, isLoading, stop };
}

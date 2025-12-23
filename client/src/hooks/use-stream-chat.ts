import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@shared/routes';

interface UseStreamChatProps {
  sessionId: number | null;
  onIncomingMessage?: () => void;
}

export function useStreamChat({ sessionId, onIncomingMessage }: UseStreamChatProps) {
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (message: string) => {
    if (!sessionId) return;
    
    setIsStreaming(true);
    setStreamingContent("");
    setError(null);
    
    // Optimistically update UI or just handle state locally
    // The parent component handles adding the user message to the UI list
    
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(api.chat.stream.path, {
        method: api.chat.stream.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(res.statusText);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              
              if (json.done) {
                // Stream finished
                setIsStreaming(false);
                setStreamingContent("");
                // Invalidate query to fetch the full saved message from DB
                queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, sessionId] });
                break;
              }
              
              if (json.error) {
                throw new Error(json.error);
              }

              if (json.content) {
                setStreamingContent(prev => prev + json.content);
                onIncomingMessage?.();
              }
            } catch (e) {
              console.error("Error parsing SSE data", e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || "Failed to send message");
        console.error("Stream error:", err);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream();
  }, []);

  return { sendMessage, streamingContent, isStreaming, error, stopStream };
}

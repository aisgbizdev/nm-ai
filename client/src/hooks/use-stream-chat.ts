import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@shared/routes';

interface UseStreamChatProps {
  sessionId: number | null;
  onIncomingMessage?: () => void;
}

const TYPEWRITER_DELAY = 18;

export function useStreamChat({ sessionId, onIncomingMessage }: UseStreamChatProps) {
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const bufferRef = useRef<string>("");
  const displayedRef = useRef<string>("");
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);
  const streamDoneRef = useRef<boolean>(false);

  const processBuffer = () => {
    if (displayedRef.current.length < bufferRef.current.length) {
      const nextChar = bufferRef.current[displayedRef.current.length];
      displayedRef.current += nextChar;
      setStreamingContent(displayedRef.current);
      onIncomingMessage?.();
      
      typewriterRef.current = setTimeout(processBuffer, TYPEWRITER_DELAY);
    } else if (streamDoneRef.current) {
      setIsStreaming(false);
      setStreamingContent("");
      bufferRef.current = "";
      displayedRef.current = "";
      streamDoneRef.current = false;
    }
  };

  const sendMessage = async (message: string) => {
    if (!sessionId) return;
    
    setIsStreaming(true);
    setStreamingContent("");
    setError(null);
    bufferRef.current = "";
    displayedRef.current = "";
    streamDoneRef.current = false;
    
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
    }
    
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
      let typewriterStarted = false;

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
                streamDoneRef.current = true;
                queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, sessionId] });
                break;
              }
              
              if (json.error) {
                throw new Error(json.error);
              }

              if (json.content) {
                bufferRef.current += json.content;
                if (!typewriterStarted) {
                  typewriterStarted = true;
                  processBuffer();
                }
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
      if (!streamDoneRef.current) {
        setIsStreaming(false);
      }
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
    }
    setIsStreaming(false);
    bufferRef.current = "";
    displayedRef.current = "";
    streamDoneRef.current = false;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
      }
    };
  }, []);

  return { sendMessage, streamingContent, isStreaming, error, stopStream };
}

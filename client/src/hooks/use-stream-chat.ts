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
  const sessionIdRef = useRef<number | null>(null);
  const requestIdRef = useRef<number>(0);
  const stoppedRef = useRef<boolean>(false);

  const processBuffer = (currentRequestId: number) => {
    if (stoppedRef.current || currentRequestId !== requestIdRef.current) {
      return;
    }
    
    if (displayedRef.current.length < bufferRef.current.length) {
      const nextChar = bufferRef.current[displayedRef.current.length];
      displayedRef.current += nextChar;
      setStreamingContent(displayedRef.current);
      onIncomingMessage?.();
      
      typewriterRef.current = setTimeout(() => processBuffer(currentRequestId), TYPEWRITER_DELAY);
    } else if (streamDoneRef.current) {
      if (sessionIdRef.current) {
        queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, sessionIdRef.current] });
      }
      setIsStreaming(false);
      setStreamingContent("");
      bufferRef.current = "";
      displayedRef.current = "";
      streamDoneRef.current = false;
    } else {
      typewriterRef.current = setTimeout(() => processBuffer(currentRequestId), TYPEWRITER_DELAY);
    }
  };

  const sendMessage = async (message: string) => {
    if (!sessionId) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    
    stoppedRef.current = false;
    setIsStreaming(true);
    setStreamingContent("");
    setError(null);
    bufferRef.current = "";
    displayedRef.current = "";
    streamDoneRef.current = false;
    sessionIdRef.current = sessionId;
    
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(api.chat.stream.path, {
        method: api.chat.stream.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(res.statusText);
      
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let typewriterStarted = false;

      while (true) {
        if (stoppedRef.current || currentRequestId !== requestIdRef.current) {
          reader.cancel();
          break;
        }
        
        const { done, value } = await reader.read();
        if (done) break;

        if (currentRequestId !== requestIdRef.current) {
          reader.cancel();
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              
              if (json.done) {
                streamDoneRef.current = true;
                break;
              }
              
              if (json.error) {
                throw new Error(json.error);
              }

              if (json.content && currentRequestId === requestIdRef.current && !stoppedRef.current) {
                bufferRef.current += json.content;
                if (!typewriterStarted) {
                  typewriterStarted = true;
                  processBuffer(currentRequestId);
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
      if (currentRequestId === requestIdRef.current && !streamDoneRef.current) {
        setIsStreaming(false);
      }
    }
  };

  const stopStream = () => {
    stoppedRef.current = true;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
      typewriterRef.current = null;
    }
    
    setIsStreaming(false);
    setStreamingContent("");
    bufferRef.current = "";
    displayedRef.current = "";
    streamDoneRef.current = false;
  };

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
      }
    };
  }, []);

  return { sendMessage, streamingContent, isStreaming, error, stopStream };
}

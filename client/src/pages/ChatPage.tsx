import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession, useCreateMessage } from "@/hooks/use-chat";
import { useChatStream } from "@/hooks/use-chat-stream";
import { Send, Sparkles, StopCircle } from "lucide-react";
import { useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";

export default function ChatPage() {
  const [match, params] = useRoute("/chat/:id");
  const sessionId = params?.id ? parseInt(params.id) : null;
  
  const { data: session, isLoading: isSessionLoading } = useSession(sessionId);
  const createMessage = useCreateMessage();
  const [input, setInput] = useState("");
  
  // Local state for optimistic updates and streaming
  const [streamedContent, setStreamedContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { streamMessage, isLoading: isStreaming, stop } = useChatStream({
    onChunk: (chunk) => setStreamedContent(prev => prev + chunk),
    onFinish: () => setStreamedContent(""), // Clear stream buffer as react-query will fetch the full saved message
    onError: () => setStreamedContent("")
  });

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !sessionId || isStreaming) return;

    const userMsg = input.trim();
    setInput("");

    try {
      // 1. Save user message to DB
      await createMessage.mutateAsync({
        sessionId,
        role: "user",
        content: userMsg
      });

      // 2. Start streaming AI response
      await streamMessage(sessionId, userMsg);
      
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages, streamedContent, sessionId]);

  if (!sessionId) {
    return (
      <div className="flex h-screen w-full bg-[#0A0A12] text-white font-sans overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center flex-col gap-6 p-8 relative overflow-hidden">
          {/* Background Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none translate-x-20 -translate-y-20" />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center space-y-4 z-10"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(255,0,92,0.4)] mb-6">
              <Sparkles size={40} className="text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight">
              NM Ai <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Gwen Mode</span>
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-lg leading-relaxed">
              Your intelligent assistant with a multiverse twist. 
              Select a conversation or start a new one to begin.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#0A0A12] text-white font-sans overflow-hidden">
      <Sidebar />
      
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center px-6 justify-between bg-[#0A0A12]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-lg text-white/90">
              {session?.title || "Conversation"}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-primary/20 text-primary uppercase font-bold tracking-wider border border-primary/20">
              Gwen v5.1
            </span>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden relative">
          <div 
            ref={scrollRef}
            className="h-full overflow-y-auto pb-4 scroll-smooth"
          >
            <div className="max-w-3xl mx-auto min-h-full flex flex-col">
              {/* Message List */}
              <AnimatePresence initial={false}>
                {session?.messages.map((msg) => (
                  <ChatMessage key={msg.id} role={msg.role as "user"|"assistant"} content={msg.content} />
                ))}
              </AnimatePresence>

              {/* Streaming Content */}
              {isStreaming && streamedContent && (
                <ChatMessage role="assistant" content={streamedContent} />
              )}
              
              {/* Typing Indicator (if loading but no stream yet) */}
              {isStreaming && !streamedContent && (
                <div className="flex gap-4 p-6 bg-white/[0.02]">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                    <Sparkles size={16} className="text-primary animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1 h-8">
                    <span className="w-2 h-2 bg-white/20 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-white/20 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-white/20 rounded-full animate-bounce"></span>
                  </div>
                </div>
              )}
              
              {/* Spacing at bottom */}
              <div className="h-4" />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#0A0A12] border-t border-white/5 relative z-20">
          <div className="max-w-3xl mx-auto relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Gwen..."
              className="pr-12 min-h-[56px] max-h-[200px] bg-white/5 border-white/10 focus:border-primary/50 text-base"
              disabled={isStreaming}
            />
            <div className="absolute right-2 bottom-2">
              {isStreaming ? (
                 <Button 
                   size="icon" 
                   variant="destructive" 
                   className="h-8 w-8 rounded-lg"
                   onClick={stop}
                 >
                   <StopCircle size={16} />
                 </Button>
              ) : (
                <Button 
                  size="icon" 
                  className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_10px_rgba(255,0,92,0.4)] disabled:opacity-50 disabled:shadow-none transition-all"
                  onClick={() => handleSubmit()}
                  disabled={!input.trim()}
                >
                  <Send size={16} />
                </Button>
              )}
            </div>
          </div>
          <div className="text-center mt-2">
             <span className="text-[10px] text-muted-foreground/50">
               NM Ai can make mistakes. Consider checking important information.
             </span>
          </div>
        </div>
      </div>
    </div>
  );
}

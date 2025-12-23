import { useState, useEffect, useRef } from "react";
import { useSessions, useSession, useCreateSession, useCreateMessage, useDeleteSession, streamChatResponse } from "@/hooks/use-chat";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ModelSelector } from "@/components/ModelSelector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Menu, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-5.1");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Streaming state (ephemeral)
  const [streamedContent, setStreamedContent] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Queries & Mutations
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessions();
  const { data: sessionData, isLoading: isLoadingMessages } = useSession(currentSessionId);
  
  const createSession = useCreateSession();
  const createMessage = useCreateMessage();
  const deleteSession = useDeleteSession();

  // Scroll to bottom when messages change or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionData?.messages, streamedContent, isGenerating]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  // Handlers
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setInputValue("");
    setStreamedContent("");
    setIsSidebarOpen(false);
    // Focus input
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleSelectSession = (id: number) => {
    setCurrentSessionId(id);
    setIsSidebarOpen(false);
    setStreamedContent("");
  };

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      await deleteSession.mutateAsync(id);
      if (currentSessionId === id) {
        handleNewChat();
      }
    }
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let activeSessionId = currentSessionId;

    try {
      setIsGenerating(true);

      // 1. Create session if needed
      if (!activeSessionId) {
        const newSession = await createSession.mutateAsync({
          title: userMessage.slice(0, 30) + "...",
          model: selectedModel,
        });
        activeSessionId = newSession.id;
        setCurrentSessionId(newSession.id);
      }

      // 2. Save user message to DB
      await createMessage.mutateAsync({
        sessionId: activeSessionId!,
        role: "user",
        content: userMessage,
      });

      // 3. Start streaming AI response
      await streamChatResponse(
        activeSessionId!,
        userMessage,
        selectedModel,
        (chunk) => {
           // Parse SSE "data: ..." format if backend sends standard SSE
           // Assuming raw text or simple JSON lines for now based on typical implementations
           // This simple regex handles standard "data: {content: '...'}" lines
           const lines = chunk.split('\n');
           for (const line of lines) {
             if (line.startsWith('data: ')) {
               try {
                 const data = JSON.parse(line.slice(6));
                 if (data.content) {
                   setStreamedContent(prev => prev + data.content);
                 }
               } catch (e) {
                 // console.error("Failed to parse chunk", e);
               }
             }
           }
        },
        () => {
          setIsGenerating(false);
          setStreamedContent("");
          queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, activeSessionId] });
        },
        (error) => {
          setIsGenerating(false);
          toast({ title: "Error", description: "Failed to generate response", variant: "destructive" });
        }
      );
    } catch (error) {
      console.error(error);
      setIsGenerating(false);
      toast({ title: "Error", description: "Something went wrong", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground font-sans">
      
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        
        {/* Header */}
        <header className="h-16 border-b border-border/40 flex items-center justify-between px-4 sticky top-0 bg-background/80 backdrop-blur z-20">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <ModelSelector value={selectedModel} onValueChange={setSelectedModel} />
          </div>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
          <div className="max-w-3xl mx-auto flex flex-col min-h-full">
            
            {/* Welcome State */}
            {!currentSessionId && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-primary/5">
                  <SparklesIcon className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl font-display font-bold mb-3">How can I help you today?</h1>
                <p className="text-muted-foreground max-w-md">
                  I can help you write code, draft emails, analyze data, or just have a conversation. Select a model to get started.
                </p>
              </div>
            )}

            {/* Message History */}
            {sessionData?.messages?.map((msg) => (
              <ChatMessage 
                key={msg.id} 
                role={msg.role as "user" | "assistant"} 
                content={msg.content} 
              />
            ))}

            {/* Streaming Content (Active Generation) */}
            {isGenerating && (
              <ChatMessage 
                role="assistant" 
                content={streamedContent}
                isStreaming={true}
              />
            )}
            
            <div ref={bottomRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-background via-background to-transparent pt-10">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            
            <div className="relative flex items-end gap-2 bg-secondary/80 backdrop-blur-md border border-border/50 rounded-2xl p-2 shadow-2xl ring-1 ring-white/5">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                className="min-h-[50px] max-h-[200px] w-full bg-transparent border-0 focus-visible:ring-0 resize-none py-3 px-4 text-base placeholder:text-muted-foreground/50"
                rows={1}
              />
              <Button 
                onClick={handleSubmit} 
                disabled={!inputValue.trim() || isGenerating}
                size="icon"
                className={cn(
                  "mb-1 mr-1 rounded-xl w-10 h-10 transition-all duration-300",
                  inputValue.trim() ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:scale-105" : "bg-muted text-muted-foreground"
                )}
              >
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
            
            <div className="text-center mt-3 text-xs text-muted-foreground/50">
              AI can make mistakes. Consider checking important information.
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

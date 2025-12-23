import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useSession, useCreateSession, useSessions, useDeleteSession } from "@/hooks/use-chat";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { PersonaSettings } from "@/components/PersonaSettings";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Send, Menu, Trash2, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function ChatPage() {
  const [match, params] = useRoute("/chat/:id");
  const sessionId = match && params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputMessage, setInputMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const { data: sessions, isLoading: isLoadingSessions } = useSessions();
  const { data: sessionData, isLoading: isLoadingChat } = useSession(sessionId);
  
  // Mutations
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  // Stream Hook
  const { sendMessage, streamingContent, isStreaming } = useStreamChat({
    sessionId,
    onIncomingMessage: () => scrollToBottom(),
  });

  // Auto-scroll on new content
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessionData?.messages, streamingContent]);

  const handleNewChat = async () => {
    try {
        const newSession = await createSession.mutateAsync({
            title: "New Conversation",
            model: "gpt-5.1"
        });
        setLocation(`/chat/${newSession.id}`);
    } catch (err) {
        console.error("Failed to create session");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
        await deleteSession.mutateAsync(id);
        if (sessionId === id) {
            setLocation("/");
        }
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || !sessionId || isStreaming) return;
    
    const messageToSend = inputMessage;
    setInputMessage("");
    // Reset height of textarea
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }

    await sendMessage(messageToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // If on root /, create a session automatically or show welcome screen
  // For simplicity, let's show a welcome screen
  if (!sessionId) {
    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
             <Sidebar 
                sessions={sessions || []} 
                currentId={null} 
                onNewChat={handleNewChat} 
                onDelete={handleDeleteSession}
                open={sidebarOpen}
                toggle={() => setSidebarOpen(!sidebarOpen)}
            />
            <main className="flex-1 flex flex-col items-center justify-center relative bg-gradient-to-b from-background to-background/95">
                <div className="absolute inset-0 bg-[url('https://pixabay.com/get/g1087f920e637006b3efed4b660d5dd6518c6d381d2acdfc03a330d7802b4032fa410bce95c85da9a1ef7ec7b18435df136035ed18d7030f6219448b1fdf5b178_1280.jpg')] bg-cover opacity-5 pointer-events-none" />
                <div className="z-10 text-center space-y-8 p-8 max-w-2xl animate-in fade-in zoom-in duration-500">
                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-7xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-secondary text-glow">
                            NM Ai
                        </h1>
                        <p className="text-2xl text-muted-foreground font-light tracking-wide">
                            Gwen Stacy Mode
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        <div className="bg-card/50 border border-border/50 p-6 rounded-xl hover:border-primary/50 transition-colors">
                            <h3 className="text-lg font-semibold text-primary mb-2">Dual Engine</h3>
                            <p className="text-sm text-muted-foreground">Seamlessly powered by OpenAI and Ollama integration.</p>
                        </div>
                        <div className="bg-card/50 border border-border/50 p-6 rounded-xl hover:border-secondary/50 transition-colors">
                            <h3 className="text-lg font-semibold text-secondary mb-2">Knowledge Base</h3>
                            <p className="text-sm text-muted-foreground">Upload your files to expand Gwen's understanding.</p>
                        </div>
                    </div>

                    <Button onClick={handleNewChat} size="lg" className="text-lg px-8 h-14 rounded-full shadow-2xl shadow-primary/20 hover:scale-105 transition-transform">
                        Start New Conversation
                    </Button>
                </div>
            </main>
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Sidebar 
        sessions={sessions || []} 
        currentId={sessionId} 
        onNewChat={handleNewChat} 
        onDelete={handleDeleteSession}
        open={sidebarOpen}
        toggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-14 border-b border-border/40 bg-background/80 backdrop-blur flex items-center justify-between px-4 z-20">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden">
                    <Menu className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Chatting with</span>
                    <span className="text-sm font-bold text-primary flex items-center gap-1">
                        Gwen Stacy <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    </span>
                </div>
            </div>
            <PersonaSettings />
        </header>

        {/* Messages */}
        <div 
            className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar" 
            ref={scrollRef}
        >
            <div className="flex flex-col min-h-full pb-32">
                {isLoadingChat ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        Loading conversation...
                    </div>
                ) : (
                    <>
                        {sessionData?.messages.map((msg) => (
                            <ChatMessage 
                                key={msg.id}
                                role={msg.role}
                                content={msg.content}
                                createdAt={msg.createdAt}
                            />
                        ))}
                        {isStreaming && (
                            <ChatMessage 
                                role="assistant"
                                content={streamingContent}
                                isStreaming={true}
                            />
                        )}
                        {!sessionData?.messages.length && !isStreaming && (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50 gap-4">
                                <Bot className="h-12 w-12" />
                                <p>Say hello to Gwen!</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-4">
            <div className="max-w-4xl mx-auto relative">
                <div className="relative flex items-end gap-2 bg-card/80 backdrop-blur border border-border/50 rounded-2xl p-2 shadow-2xl focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                    <Textarea
                        ref={textareaRef}
                        value={inputMessage}
                        onChange={(e) => {
                            setInputMessage(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Message Gwen Stacy..."
                        className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 py-3 px-4 text-base"
                        rows={1}
                    />
                    <Button 
                        onClick={handleSend} 
                        disabled={!inputMessage.trim() || isStreaming}
                        size="icon"
                        className={cn(
                            "h-10 w-10 shrink-0 rounded-xl transition-all mb-1",
                            inputMessage.trim() ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        )}
                    >
                        <Send className="h-5 w-5" />
                    </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-2">
                    NM Ai can make mistakes. Consider checking important information.
                </p>
            </div>
        </div>
      </main>
    </div>
  );
}

function Sidebar({ sessions, currentId, onNewChat, onDelete, open, toggle }: any) {
  const [, setLocation] = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex flex-col border-r border-border bg-card/50 backdrop-blur z-30 h-full relative"
        >
            <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <Button onClick={onNewChat} className="flex-1 justify-start gap-2 bg-background/50 hover:bg-background border border-border/50 text-foreground">
                    <Plus className="h-4 w-4" />
                    New Chat
                </Button>
                <Button variant="ghost" size="icon" onClick={toggle} className="ml-2 md:flex hidden">
                    <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>

            <ScrollArea className="flex-1 px-2 py-4">
                <div className="space-y-1">
                    {sessions.map((session: any) => (
                        <div
                            key={session.id}
                            className={cn(
                                "group relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all cursor-pointer",
                                currentId === session.id 
                                    ? "bg-accent/50 text-accent-foreground font-medium shadow-sm" 
                                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                            )}
                            onClick={() => setLocation(`/chat/${session.id}`)}
                        >
                            <MessageSquare className="h-4 w-4 shrink-0" />
                            <span className="truncate flex-1">{session.title || "New Conversation"}</span>
                            
                            <Button
                                onClick={(e) => onDelete(e, session.id)}
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 hover:bg-destructive/20 hover:text-destructive"
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground">
                            No history yet.
                        </div>
                    )}
                </div>
            </ScrollArea>
        </motion.aside>
      )}
      {!open && (
         <div className="absolute top-4 left-4 z-30 hidden md:block">
            <Button variant="outline" size="icon" onClick={toggle} className="bg-background/80 backdrop-blur">
                <PanelLeft className="h-5 w-5" />
            </Button>
         </div>
      )}
    </AnimatePresence>
  );
}

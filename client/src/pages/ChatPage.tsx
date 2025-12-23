import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useSession, useCreateSession, useSessions, useDeleteSession } from "@/hooks/use-chat";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const [match, params] = useRoute("/chat/:id");
  const sessionId = match && params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  
  const [inputMessage, setInputMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: sessions } = useSessions();
  const { data: sessionData, isLoading: isLoadingChat } = useSession(sessionId);
  
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const { sendMessage, streamingContent, isStreaming } = useStreamChat({
    sessionId,
    onIncomingMessage: () => scrollToBottom(),
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessionData?.messages, streamingContent]);

  useEffect(() => {
    if (!sessionId && sessions && sessions.length > 0) {
      setLocation(`/chat/${sessions[0].id}`);
    } else if (!sessionId && sessions && sessions.length === 0) {
      handleNewChat();
    }
  }, [sessionId, sessions]);

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

  const handleClearChat = async () => {
    if (!sessionId) return;
    if (confirm("Hapus semua riwayat chat?")) {
      await deleteSession.mutateAsync(sessionId);
      handleNewChat();
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || !sessionId || isStreaming) return;
    
    const messageToSend = inputMessage;
    setInputMessage("");
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

  if (!sessionId) {
    return (
      <div className="flex h-screen bg-background text-foreground items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-secondary">
            NM Ai
          </h1>
          <p className="text-xl text-muted-foreground">Gwen Stacy Mode</p>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <header className="h-14 border-b border-border/40 bg-background/80 backdrop-blur flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-500">
            NM Ai
          </h1>
          <span className="text-sm text-muted-foreground">Gwen Stacy</span>
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleClearChat}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Clear Chat"
          data-testid="button-clear-chat"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </header>

      <div 
        className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar" 
        ref={scrollRef}
      >
        <div className="flex flex-col min-h-full pb-32">
          {isLoadingChat ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Loading...
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
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50 gap-4 py-20">
                  <Bot className="h-16 w-16" />
                  <div className="text-center space-y-2">
                    <p className="text-lg font-medium">Halo! Saya NM Ai</p>
                    <p className="text-sm">Tanyakan apapun tentang trading, analisa pasar, atau finansial.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
              placeholder="Tanya apapun..."
              className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 py-3 px-4 text-base"
              rows={1}
              data-testid="input-message"
            />
            <Button 
              onClick={handleSend} 
              disabled={!inputMessage.trim() || isStreaming}
              size="icon"
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl transition-all mb-1",
                inputMessage.trim() ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              )}
              data-testid="button-send"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            NM Ai dapat membuat kesalahan. Periksa info penting.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useSession, useCreateSession, useSessions, useDeleteSession } from "@/hooks/use-chat";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, TrendingUp, Calculator, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";

const QUICK_PROMPTS = [
  { icon: TrendingUp, text: "Analisa pasar hari ini", prompt: "Bagaimana kondisi pasar hari ini?" },
  { icon: Calculator, text: "Hitung Pivot Point", prompt: "Hitung pivot point dengan O:2640 H:2660 L:2630 C:2655" },
  { icon: Calendar, text: "Kalender Ekonomi", prompt: "Tampilkan kalender ekonomi hari ini" },
];

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

  const handleSend = async (customMessage?: string) => {
    const messageToSend = customMessage || inputMessage;
    if (!messageToSend.trim() || !sessionId || isStreaming) return;
    
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
          <div className="flex items-center justify-center">
            <img src={nmLogo} alt="NM Ai" className="h-24 md:h-32 w-auto object-contain" />
          </div>
          <p className="text-xl text-muted-foreground">Gwen Stacy Mode</p>
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <header className="h-14 border-b border-border/40 bg-background/80 backdrop-blur flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <img src={nmLogo} alt="NM Ai" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-sm text-muted-foreground">Gwen Stacy</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
          </div>
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
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
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
                <div className="flex-1 flex flex-col items-center justify-center gap-8 py-16 px-4">
                  <div className="text-center space-y-4">
                    <img src={nmLogo} alt="NM Ai" className="h-24 mx-auto object-contain" />
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-foreground">Halo! Saya Gwen</h2>
                      <p className="text-muted-foreground max-w-md">
                        Asisten AI dari Newsmaker.id. Siap membantu analisa pasar, kalkulasi trading, dan edukasi finansial.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
                    {QUICK_PROMPTS.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(item.prompt)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 bg-card/50 text-sm text-muted-foreground hover:bg-card hover:text-foreground hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5"
                        data-testid={`button-quick-prompt-${idx}`}
                      >
                        <item.icon className="h-4 w-4 text-primary" />
                        {item.text}
                      </button>
                    ))}
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
              onClick={() => handleSend()} 
              disabled={!inputMessage.trim() || isStreaming}
              size="icon"
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl transition-all mb-1",
                inputMessage.trim() ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground"
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

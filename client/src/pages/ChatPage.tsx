import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useSession, useCreateSession, useSessions, useDeleteSession } from "@/hooks/use-chat";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, TrendingUp, Calculator, Calendar, BookOpen, Shield, MessageCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";

const MENU_OPTIONS = [
  { 
    icon: TrendingUp, 
    title: "Market Hub", 
    desc: "Wawasan pasar, strategi & perilaku trading",
    prompt: "Jelaskan tentang Market Hub dan bagaimana memahami logika pasar berjangka" 
  },
  { 
    icon: BookOpen, 
    title: "Trading Rules", 
    desc: "Regulasi SPA & peraturan Bappebti",
    prompt: "Jelaskan trading rules SPA berdasarkan peraturan Bappebti" 
  },
  { 
    icon: Calculator, 
    title: "Risk Planner", 
    desc: "Simulasi margin, equity & ketahanan modal",
    prompt: "Hitung margin 1 lot XAUUSD leverage 1:100" 
  },
  { 
    icon: Shield, 
    title: "User Protection", 
    desc: "Legalitas & perlindungan dari penipuan",
    prompt: "Jelaskan tentang perlindungan nasabah dan cara menghindari penipuan investasi" 
  },
  { 
    icon: Calendar, 
    title: "Kalender Ekonomi", 
    desc: "Jadwal berita & event penting hari ini",
    prompt: "Tampilkan kalender ekonomi hari ini" 
  },
  { 
    icon: MessageCircle, 
    title: "Obrolan Bebas", 
    desc: "Tanya apapun tentang trading & finansial",
    prompt: "Halo Gwen, apa kabar?" 
  },
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
                <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8 px-4">
                  <div className="text-center space-y-3">
                    <img src={nmLogo} alt="NM Ai" className="h-20 mx-auto object-contain" />
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-foreground">Selamat Datang di NM Ai</h2>
                      <p className="text-sm text-muted-foreground max-w-lg">
                        Sistem edukatif terpadu untuk memahami logika pasar, risiko, dan psikologi perdagangan berjangka.
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl w-full">
                    {MENU_OPTIONS.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(item.prompt)}
                        className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border/50 bg-card/50 text-left hover:bg-card hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 group"
                        data-testid={`button-menu-${idx}`}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 max-w-2xl p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-amber-600 dark:text-amber-400">Perhatian:</span> Seluruh informasi yang disajikan bersifat edukatif dan tidak dimaksudkan sebagai rekomendasi atau saran transaksi. Keputusan investasi sepenuhnya menjadi tanggung jawab pengguna. NM Ai dapat menghasilkan informasi yang tidak akurat, harap verifikasi data penting secara mandiri.
                    </p>
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

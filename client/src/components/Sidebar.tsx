import { useSessions, useCreateSession, useDeleteSession } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, Settings, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";

export function Sidebar() {
  const { data: sessions, isLoading } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const [location, setLocation] = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const handleNewChat = async () => {
    try {
      const newSession = await createSession.mutateAsync({
        title: "New Conversation",
        model: "gpt-5.1"
      });
      setLocation(`/chat/${newSession.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      await deleteSession.mutateAsync(id);
      if (location === `/chat/${id}`) {
        setLocation("/");
      }
    }
  };

  const currentId = parseInt(location.split("/").pop() || "0");

  return (
    <div className="w-[280px] h-full flex flex-col bg-[#050508] border-r border-white/5 flex-shrink-0">
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded bg-primary/20 border border-primary/50 flex items-center justify-center text-primary font-bold font-display">
            NM
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white">NM Ai</span>
        </div>
        
        <Button 
          onClick={handleNewChat} 
          disabled={createSession.isPending}
          className="w-full justify-start gap-2 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 shadow-none"
        >
          <Plus size={18} />
          <span>New Chat</span>
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-2">
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-muted-foreground animate-pulse">Loading chats...</div>
          ) : sessions?.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No chats yet</div>
          ) : (
            sessions?.map((session) => (
              <Link 
                key={session.id} 
                href={`/chat/${session.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all group relative",
                  currentId === session.id 
                    ? "bg-white/10 text-white font-medium" 
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                <MessageSquare size={16} />
                <span className="truncate pr-8">{session.title}</span>
                
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </Link>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-white/5 space-y-2">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-2 text-muted-foreground hover:text-white"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={18} />
          <span>Persona Settings</span>
        </Button>
        <div className="text-[10px] text-muted-foreground/40 px-3 pt-2 font-mono text-center">
          Gwen Stacy Mode Active • v1.0
        </div>
      </div>

      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}

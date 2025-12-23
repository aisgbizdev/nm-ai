import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { ChatSession } from "@shared/schema";
import { useLocation } from "wouter";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: number | null;
  onNewChat: () => void;
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number, e: React.MouseEvent) => void;
}

export function Sidebar({ 
  isOpen, 
  onClose,
  sessions, 
  currentSessionId, 
  onNewChat, 
  onSelectSession, 
  onDeleteSession 
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "fixed md:relative inset-y-0 left-0 z-50 w-[280px] bg-card border-r border-border transition-transform duration-300 ease-in-out flex flex-col",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 flex flex-col gap-4">
          <Button 
            onClick={onNewChat} 
            className="w-full justify-start gap-2 h-12 text-base font-medium shadow-md hover:shadow-primary/20 transition-all border border-border/50 bg-secondary/50 hover:bg-secondary hover:border-border"
            variant="outline"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </Button>
        </div>

        <div className="px-4 py-2">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider pl-2">History</h3>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="flex flex-col gap-1 pb-4">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground/50 text-sm">
                No chat history yet
              </div>
            ) : (
              sessions.map((session) => (
                <div 
                  key={session.id}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all duration-200",
                    currentSessionId === session.id 
                      ? "bg-primary/10 text-primary-foreground border border-primary/20 shadow-sm" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  onClick={() => onSelectSession(session.id)}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 truncate text-sm font-medium">
                    {session.title || "New Conversation"}
                  </div>
                  
                  {/* Hover Actions */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 text-muted-foreground hover:text-destructive transition-opacity absolute right-2"
                    onClick={(e) => onDeleteSession(session.id, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500" />
            <div className="text-sm font-medium">
              <div className="text-foreground">User</div>
              <div className="text-xs text-muted-foreground">Pro Plan</div>
            </div>
          </div>
        </div>
        
        {/* Mobile Close Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 md:hidden"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </aside>
    </>
  );
}

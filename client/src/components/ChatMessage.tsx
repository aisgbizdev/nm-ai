import ReactMarkdown from 'react-markdown';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { User, Bot } from "lucide-react";
import { motion } from "framer-motion";

interface ChatMessageProps {
  role: string;
  content: string;
  createdAt?: string | Date;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, createdAt, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
            "group flex w-full gap-4 px-4 py-8 transition-colors",
            isUser ? "bg-background" : "bg-card/30 border-y border-border/20"
        )}
    >
      <div className="container max-w-4xl mx-auto flex gap-4 md:gap-6">
        <div className={cn(
            "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-lg",
            isUser 
                ? "bg-background border-border text-foreground" 
                : "bg-primary/10 border-primary/20 text-primary shadow-primary/20"
        )}>
          {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </div>
        
        <div className="flex-1 space-y-2 overflow-hidden">
          <div className="flex items-center justify-between">
            <span className={cn("text-sm font-semibold", isUser ? "text-foreground" : "text-primary")}>
                {isUser ? "You" : "Gwen Stacy"}
            </span>
            {createdAt && (
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {format(new Date(createdAt), "h:mm a")}
                </span>
            )}
          </div>
          
          <div className={cn(
              "prose prose-invert prose-p:leading-relaxed prose-pre:p-0 min-w-full break-words text-base",
              isStreaming && !isUser && "animate-pulse-subtle" // Subtle pulse while streaming
          )}>
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 align-middle bg-primary animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

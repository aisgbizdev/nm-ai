import ReactMarkdown from 'react-markdown';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { User, Sparkles } from "lucide-react";
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
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group flex w-full gap-4 px-4 py-6 transition-colors",
        isUser ? "bg-background" : "bg-card/30 border-y border-border/10"
      )}
    >
      <div className="container max-w-4xl mx-auto flex gap-4 md:gap-5">
        <div className={cn(
          "flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-xl shadow-lg transition-all",
          isUser 
            ? "bg-background border border-border text-foreground" 
            : "bg-gradient-to-br from-primary via-purple-500 to-secondary text-white shadow-primary/20"
        )}>
          {isUser ? <User className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
        
        <div className="flex-1 space-y-2 overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-sm font-semibold", isUser ? "text-foreground" : "text-primary")}>
              {isUser ? "Anda" : "Gwen Stacy"}
            </span>
            {createdAt && (
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {format(new Date(createdAt), "HH:mm")}
              </span>
            )}
          </div>
          
          <div className={cn(
            "prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none break-words",
            "prose-headings:text-foreground prose-strong:text-foreground prose-code:text-primary",
            "[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
          )}>
            <ReactMarkdown>{content || (isStreaming ? "" : "")}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 ml-1">
                <motion.span 
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                />
                <motion.span 
                  className="w-2 h-2 rounded-full bg-purple-500"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                />
                <motion.span 
                  className="w-2 h-2 rounded-full bg-secondary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                />
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

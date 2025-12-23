import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex w-full gap-4 p-6 border-b border-white/5 last:border-0",
        isUser ? "bg-transparent" : "bg-white/[0.02]"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border",
        isUser 
          ? "bg-secondary/10 border-secondary/30 text-secondary" 
          : "bg-primary/10 border-primary/30 text-primary"
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-bold font-display uppercase tracking-wider",
            isUser ? "text-secondary" : "text-primary"
          )}>
            {isUser ? "You" : "NM Ai"}
          </span>
          {!isUser && (
            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/20">
              Gwen Mode
            </span>
          )}
        </div>
        
        <div className={cn(
          "prose prose-invert max-w-none text-[15px] leading-7",
          isUser ? "text-gray-200" : "text-gray-100"
        )}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}

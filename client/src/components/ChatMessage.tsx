import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { motion } from "framer-motion";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "w-full flex gap-4 p-6 text-base md:gap-6 border-b border-border/10",
        isUser ? "bg-transparent" : "bg-card/30"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg",
        isUser ? "bg-primary text-primary-foreground" : "bg-emerald-600 text-white"
      )}>
        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </div>
      
      <div className="flex-1 overflow-hidden">
        <div className="prose prose-invert max-w-none">
          {content ? (
            <ReactMarkdown>{content}</ReactMarkdown>
          ) : (
            isStreaming && (
              <div className="flex gap-1 h-6 items-center">
                <span className="w-1.5 h-1.5 bg-current rounded-full typing-dot opacity-60"></span>
                <span className="w-1.5 h-1.5 bg-current rounded-full typing-dot opacity-60"></span>
                <span className="w-1.5 h-1.5 bg-current rounded-full typing-dot opacity-60"></span>
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}

import { useState } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { User, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion } from "framer-motion";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessageProps {
  role: string;
  content: string;
  createdAt?: string | Date;
  isStreaming?: boolean;
  messageId?: number;
}

export function ChatMessage({ role, content, createdAt, isStreaming, messageId }: ChatMessageProps) {
  const isUser = role === "user";
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (type: "up" | "down") => {
    if (!messageId || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/messages/${messageId}/feedback`, {
        feedback: type
      });
      setFeedback(type);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group flex w-full gap-2 sm:gap-4 px-2 sm:px-4 py-3 sm:py-6 transition-colors",
        isUser ? "bg-background" : "bg-card/30 border-y border-border/10"
      )}
    >
      <div className="container max-w-4xl mx-auto flex gap-2 sm:gap-4 md:gap-5">
        <div className={cn(
          "flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 select-none items-center justify-center rounded-lg sm:rounded-xl shadow-lg transition-all overflow-hidden",
          isUser 
            ? "bg-background border border-border text-foreground" 
            : "bg-white/90 shadow-primary/20"
        )}>
          {isUser ? <User className="h-4 w-4 sm:h-5 sm:w-5" /> : <img src={nmLogo} alt="NM Ai" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />}
        </div>
        
        <div className="flex-1 space-y-1 sm:space-y-2 overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-xs sm:text-sm font-semibold", isUser ? "text-foreground" : "text-primary")}>
              {isUser ? "Anda" : "Gwen Stacy"}
            </span>
            {createdAt && (
              <span className="text-[10px] sm:text-xs text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {format(new Date(createdAt), "HH:mm")}
              </span>
            )}
          </div>
          
          <div className={cn(
            "prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none break-words",
            "prose-headings:text-foreground prose-strong:text-foreground prose-code:text-primary",
            "text-sm sm:text-base",
            "[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs sm:[&_table]:text-sm [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:p-1.5 sm:[&_th]:p-2 [&_th]:bg-muted [&_th]:whitespace-nowrap [&_td]:border [&_td]:border-border [&_td]:p-1.5 sm:[&_td]:p-2 [&_td]:whitespace-nowrap",
            "[&_pre]:text-xs sm:[&_pre]:text-sm [&_pre]:overflow-x-auto",
            "[&_ol]:pl-4 sm:[&_ol]:pl-6 [&_ul]:pl-4 sm:[&_ul]:pl-6"
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || (isStreaming ? "" : "")}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-flex items-center gap-0.5 sm:gap-1 ml-1">
                <motion.span 
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                />
                <motion.span 
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-secondary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                />
                <motion.span 
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-secondary"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                />
              </span>
            )}
          </div>
          
          {!isUser && !isStreaming && messageId && (
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleFeedback("up")}
                disabled={isSubmitting || feedback !== null}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  feedback === "up" 
                    ? "text-green-500 bg-green-500/10" 
                    : "text-muted-foreground hover:text-green-500 hover:bg-green-500/10",
                  (isSubmitting || feedback !== null) && feedback !== "up" && "opacity-50 cursor-not-allowed"
                )}
                data-testid={`button-feedback-up-${messageId}`}
                title="Respons bagus"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleFeedback("down")}
                disabled={isSubmitting || feedback !== null}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  feedback === "down" 
                    ? "text-red-500 bg-red-500/10" 
                    : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10",
                  (isSubmitting || feedback !== null) && feedback !== "down" && "opacity-50 cursor-not-allowed"
                )}
                data-testid={`button-feedback-down-${messageId}`}
                title="Respons kurang bagus"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              {feedback && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  Terima kasih atas feedback!
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

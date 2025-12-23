import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { User } from "lucide-react";
import { motion } from "framer-motion";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";

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
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-purple-500"
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
        </div>
      </div>
    </motion.div>
  );
}

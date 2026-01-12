import { useState, useMemo } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { User, ThumbsUp, ThumbsDown, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessageProps {
  role: string;
  content: string;
  createdAt?: string | Date;
  isStreaming?: boolean;
  messageId?: number;
  meta?: { imageData?: string } | null;
  isLastMessage?: boolean;
  onQuickReply?: (question: string) => void;
  onResetChat?: () => void;
}

function extractQuickReplies(content: string): string[] {
  const lines = content.split('\n');
  const questions: string[] = [];
  
  for (const line of lines) {
    // More flexible pattern to match various formats:
    // 1. "text", 1. text, 1."text", 1) "text", etc.
    const trimmedLine = line.trim();
    
    // Pattern 1: Numbered with quotes - 1. "text" or 1."text"
    let match = trimmedLine.match(/^[1-3][.)]\s*"([^"]+)"$/);
    if (match && match[1]) {
      questions.push(match[1].trim());
      continue;
    }
    
    // Pattern 2: Numbered without quotes - 1. text
    match = trimmedLine.match(/^[1-3][.)]\s+([^"]+)$/);
    if (match && match[1]) {
      const cleaned = match[1].trim();
      // Skip if it looks like a heading or too short
      if (cleaned.length > 5 && !cleaned.startsWith('#') && !cleaned.startsWith('*')) {
        questions.push(cleaned);
      }
    }
  }
  
  // If we got valid questions, return up to 3
  if (questions.length >= 1) {
    return questions.slice(0, 3);
  }
  
  return questions;
}

function generateFallbackQuickReplies(content: string): string[] {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('gold') || lowerContent.includes('emas') || lowerContent.includes('xau')) {
    return [
      "Harga gold sekarang berapa?",
      "Berapa lot ideal untuk trading gold?",
      "Berita terbaru tentang gold"
    ];
  }
  if (lowerContent.includes('margin') || lowerContent.includes('lot') || lowerContent.includes('modal')) {
    return [
      "Hitung margin untuk 2 lot gold",
      "Berapa lot ideal untuk modal $5,000?",
      "Jelaskan risiko overlot"
    ];
  }
  if (lowerContent.includes('berita') || lowerContent.includes('news') || lowerContent.includes('ekonomi')) {
    return [
      "Kalender ekonomi hari ini",
      "Berita terbaru tentang USD",
      "Apa dampak NFP terhadap market?"
    ];
  }
  if (lowerContent.includes('penipuan') || lowerContent.includes('legal') || lowerContent.includes('bappebti')) {
    return [
      "Cara cek legalitas broker",
      "Ciri-ciri investasi bodong",
      "Apa itu SPA trading?"
    ];
  }
  if (lowerContent.includes('pivot') || lowerContent.includes('fibonacci') || lowerContent.includes('support') || lowerContent.includes('resistance')) {
    return [
      "Hitung pivot point gold",
      "Jelaskan cara pakai fibonacci",
      "Strategi trading dengan pivot"
    ];
  }
  
  return [
    "Harga gold sekarang berapa?",
    "Kalender ekonomi hari ini",
    "Berapa lot ideal untuk modal $10,000?"
  ];
}

function removeQuickRepliesFromContent(content: string): string {
  const lines = content.split('\n');
  const filteredLines: string[] = [];
  let inQuickReplySection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect start of quick reply section - prompt lines that indicate follow-up questions
    if (trimmedLine.includes('Mau lanjut') || 
        trimmedLine.includes('Ketik angkanya') || 
        trimmedLine.includes('Want to explore') ||
        trimmedLine.includes('Pertanyaan lanjutan')) {
      inQuickReplySection = true;
      continue;
    }
    
    // If we're in quick reply section, skip numbered items 1-3
    if (inQuickReplySection) {
      // Skip quick reply numbered items
      if (/^[1-3][.)]\s*"?/.test(trimmedLine)) {
        continue;
      }
      // Keep signature lines
      if (trimmedLine.startsWith('---') || trimmedLine.startsWith('*NM Ai')) {
        filteredLines.push(line);
        inQuickReplySection = false;
        continue;
      }
      // Empty line ends the quick reply section
      if (trimmedLine === '') {
        inQuickReplySection = false;
      }
      continue;
    }
    
    // Normal content - keep everything
    filteredLines.push(line);
  }
  
  return filteredLines.join('\n').trim();
}

export function ChatMessage({ role, content, createdAt, isStreaming, messageId, meta, isLastMessage, onQuickReply, onResetChat }: ChatMessageProps) {
  const isUser = role === "user";
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  
  const handleLinkClick = (href: string | undefined, text: string, e: React.MouseEvent) => {
    const linkText = text.trim().toLowerCase();
    
    // If it's an external URL, let it open normally in a new tab
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      // Don't prevent default - let the browser handle it
      return;
    }
    
    // For internal action links, prevent default and handle
    e.preventDefault();
    
    if (linkText === "gwen stacy") {
      onResetChat?.();
    } else if (onQuickReply) {
      // Map link text to appropriate questions
      if (linkText === "obrolan bebas") {
        onQuickReply("Halo, saya mau tanya seputar trading dan finansial");
      } else if (linkText === "analisis dokumen") {
        onQuickReply("Saya ingin menganalisis gambar chart atau dokumen keuangan");
      } else if (linkText === "kalender ekonomi") {
        onQuickReply("Tampilkan kalender ekonomi hari ini");
      } else {
        onQuickReply(`Jelaskan tentang ${text.trim()}`);
      }
    }
  };
  
  const quickReplies = useMemo(() => {
    if (isUser || isStreaming) return [];
    const extracted = extractQuickReplies(content);
    if (extracted.length > 0) return extracted;
    return generateFallbackQuickReplies(content);
  }, [content, isUser, isStreaming]);
  
  const cleanContent = useMemo(() => {
    if (isUser || quickReplies.length === 0) return content;
    return removeQuickRepliesFromContent(content);
  }, [content, isUser, quickReplies]);
  const imageData = meta?.imageData;
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
          
          {imageData && (
            <div className="mb-3">
              <img 
                src={imageData} 
                alt="Uploaded image" 
                className="max-w-xs sm:max-w-sm rounded-lg border border-border/50 shadow-sm"
              />
            </div>
          )}
          <div className={cn(
            "prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none break-words",
            "prose-headings:text-foreground prose-strong:text-foreground prose-code:text-primary",
            "text-sm sm:text-base",
            "[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs sm:[&_table]:text-sm [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:p-1.5 sm:[&_th]:p-2 [&_th]:bg-muted [&_th]:whitespace-nowrap [&_td]:border [&_td]:border-border [&_td]:p-1.5 sm:[&_td]:p-2 [&_td]:whitespace-nowrap",
            "[&_pre]:text-xs sm:[&_pre]:text-sm [&_pre]:overflow-x-auto",
            "[&_ol]:pl-4 sm:[&_ol]:pl-6 [&_ul]:pl-4 sm:[&_ul]:pl-6"
          )}>
            <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children, href, ...props }) => {
                      const text = String(children);
                      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
                      return (
                        <a 
                          href={href || "#"}
                          onClick={(e) => handleLinkClick(href, text, e)}
                          className="text-primary hover:underline cursor-pointer font-medium"
                          data-testid={`link-${text.toLowerCase().replace(/\s+/g, '-')}`}
                          target={isExternal ? "_blank" : undefined}
                          rel={isExternal ? "noopener noreferrer" : undefined}
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    }
                  }}
                >{cleanContent || (isStreaming ? "" : "")}</ReactMarkdown>
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
          
          {isLastMessage && quickReplies.length > 0 && onQuickReply && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/20">
              {quickReplies.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => onQuickReply(question)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-full border border-primary/50 bg-primary/20 text-primary-foreground hover:bg-primary/30 hover:border-primary transition-all active:scale-[0.98]"
                  data-testid={`button-quick-reply-${idx}`}
                >
                  <MessageCircle className="h-3 w-3" />
                  <span className="line-clamp-1">{question}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

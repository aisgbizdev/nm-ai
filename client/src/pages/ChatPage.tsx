import { useState, useRef, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useSession, useCreateSession, useDeleteSession } from "@/hooks/use-chat";
import { api } from "@shared/routes";
import { useStreamChat } from "@/hooks/use-stream-chat";
import { ChatMessage } from "@/components/ChatMessage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, TrendingUp, Calculator, Calendar, BookOpen, Shield, MessageCircle, AlertTriangle, Home, ImagePlus, X, Download, FileImage, Camera, FolderOpen, FileText, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import nmLogo from "@assets/Logo_NM23_Ai-22_1766480039004.png";
import { format } from "date-fns";

const MENU_OPTIONS = [
  { 
    icon: TrendingUp, 
    title: "Market Hub", 
    desc: "Wawasan pasar, strategi & perilaku trading",
    prompt: "Jelaskan tentang Market Hub dan bagaimana memahami logika pasar berjangka" 
  },
  { 
    icon: FileImage, 
    title: "Analisis Dokumen", 
    desc: "Upload chart atau laporan keuangan",
    prompt: ""
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
    prompt: "" 
  },
];

export default function ChatPage() {
  const [match, params] = useRoute("/chat/:id");
  const sessionId = match && params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();
  
  const [inputMessage, setInputMessage] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [chartStreamingContent, setChartStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: sessionData, isLoading: isLoadingChat } = useSession(sessionId);
  
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  const { sendMessage, streamingContent, isStreaming } = useStreamChat({
    sessionId,
    onIncomingMessage: () => scrollToBottom(),
  });

  const WELCOME_MESSAGE = `Halo! Saya **Gwen Stacy**, asisten AI edukasi trading dari Newsmaker.id.

Saya bisa membantu kamu untuk:
- **Market Hub** - Memahami logika pasar dan strategi trading
- **Analisis Dokumen** - Upload gambar chart atau statement untuk dianalisis
- **Risk Planner** - Simulasi margin dan ketahanan modal
- **User Protection** - Legalitas dan perlindungan dari penipuan
- **Kalender Ekonomi** - Jadwal berita dan event penting
- **Obrolan Bebas** - Tanya apa saja tentang trading dan finansial

Silakan tanya atau upload gambar untuk analisis!`;

  const handleQuickReply = (question: string) => {
    if (!isStreaming && !isAnalyzing && sessionId) {
      sendMessage(question);
    }
  };

  // Helper to clean content - remove quick reply section
  const cleanContentForExport = (content: string): string => {
    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    let skipSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Start skipping when we see the follow-up prompt
      if (trimmedLine.includes('Mau lanjut eksplor') || trimmedLine.includes('Ketik angkanya')) {
        skipSection = true;
        continue;
      }
      
      // Skip numbered quick reply options
      if (/^[1-3][.)]\s*"/.test(trimmedLine)) {
        continue;
      }
      
      if (!skipSection) {
        cleanedLines.push(line);
      }
      
      // Reset skip section on signature
      if (skipSection && (trimmedLine.startsWith('---') || trimmedLine.startsWith('*NM Ai'))) {
        cleanedLines.push(line);
        skipSection = false;
      }
    }
    
    return cleanedLines.join('\n').trim();
  };

  // Get last Q&A pair (user question + AI response)
  const getLastQAPair = () => {
    if (!sessionData?.messages?.length) return [];
    const messages = sessionData.messages;
    const lastAssistantIdx = messages.map(m => m.role).lastIndexOf("assistant");
    if (lastAssistantIdx === -1) return [];
    
    // Find the user message before this assistant message
    let userIdx = lastAssistantIdx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") {
      userIdx--;
    }
    
    if (userIdx >= 0) {
      return [messages[userIdx], messages[lastAssistantIdx]];
    }
    return [messages[lastAssistantIdx]];
  };

  const handleExportNote = (lastOnly: boolean = false) => {
    if (!sessionData?.messages?.length) return;
    
    const messagesToExport = lastOnly ? getLastQAPair() : sessionData.messages;
    if (!messagesToExport.length) return;
    
    const exportText = messagesToExport.map(msg => {
      const role = msg.role === "user" ? "Anda" : "Gwen Stacy";
      const time = msg.createdAt ? format(new Date(msg.createdAt), "dd/MM/yyyy HH:mm") : "";
      const cleanContent = cleanContentForExport(msg.content);
      return `[${time}] ${role}:\n${cleanContent}\n`;
    }).join("\n---\n\n");
    
    const title = lastOnly ? "NM Ai - Resume Terakhir" : "NM Ai - Full Conversation";
    const header = `${title}\nTanggal: ${format(new Date(), "dd/MM/yyyy HH:mm")}\n\n${"=".repeat(50)}\n\n`;
    const blob = new Blob([header + exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nm-ai-${lastOnly ? "last" : "full"}-${format(new Date(), "yyyy-MM-dd-HHmm")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMD = (lastOnly: boolean = false) => {
    if (!sessionData?.messages?.length) return;
    
    const messagesToExport = lastOnly ? getLastQAPair() : sessionData.messages;
    if (!messagesToExport.length) return;
    
    const exportText = messagesToExport.map(msg => {
      const role = msg.role === "user" ? "**Anda**" : "**Gwen Stacy**";
      const time = msg.createdAt ? format(new Date(msg.createdAt), "dd/MM/yyyy HH:mm") : "";
      const cleanContent = cleanContentForExport(msg.content);
      return `### ${role} - ${time}\n\n${cleanContent}\n`;
    }).join("\n---\n\n");
    
    const title = lastOnly ? "NM Ai - Resume Terakhir" : "NM Ai - Full Conversation";
    const header = `# ${title}\n\n**Tanggal:** ${format(new Date(), "dd MMMM yyyy, HH:mm")}\n\n**Platform:** Newsmaker.id AI Trading Assistant\n\n---\n\n`;
    const footer = `\n---\n\n*Dokumen ini digenerate oleh NM Ai - Newsmaker.id*\n\n*Informasi bersifat edukatif, bukan rekomendasi transaksi.*`;
    
    const blob = new Blob([header + exportText + footer], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nm-ai-${lastOnly ? "last" : "full"}-${format(new Date(), "yyyy-MM-dd-HHmm")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = (lastOnly: boolean = false) => {
    if (!sessionData?.messages?.length) return;
    
    const messagesToExport = lastOnly ? getLastQAPair() : sessionData.messages;
    if (!messagesToExport.length) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let yPos = margin;
    
    // Helper function to add new page if needed
    const checkNewPage = (height: number) => {
      if (yPos + height > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };
    
    const title = lastOnly ? "NM Ai - Resume Terakhir" : "NM Ai - Full Conversation";
    
    // Header
    doc.setFillColor(0, 82, 147);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, 18);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Newsmaker.id AI Trading Assistant`, margin, 26);
    doc.text(`${format(new Date(), "dd MMMM yyyy, HH:mm")}`, pageWidth - margin - 45, 26);
    
    yPos = 50;
    
    // Messages
    messagesToExport.forEach((msg, idx) => {
      const isUser = msg.role === "user";
      const role = isUser ? "Anda" : "Gwen Stacy";
      const time = msg.createdAt ? format(new Date(msg.createdAt), "dd/MM/yyyy HH:mm") : "";
      
      // Clean content - remove quick replies
      const cleanContent = cleanContentForExport(msg.content);
      
      // Role header
      checkNewPage(20);
      doc.setTextColor(isUser ? 80 : 0, isUser ? 80 : 82, isUser ? 80 : 147);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${role}`, margin, yPos);
      
      doc.setTextColor(128, 128, 128);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text(time, margin + 35, yPos);
      yPos += 6;
      
      // Message content - parse markdown-like formatting
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      
      const lines = cleanContent.split('\n');
      lines.forEach(line => {
        // Skip empty lines but add spacing
        if (!line.trim()) {
          yPos += 3;
          return;
        }
        
        // Handle headers
        if (line.startsWith('## ') || line.startsWith('# ')) {
          checkNewPage(10);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(0, 82, 147);
          const headerText = line.replace(/^#+\s*/, '');
          const splitHeader = doc.splitTextToSize(headerText, maxWidth);
          doc.text(splitHeader, margin, yPos);
          yPos += splitHeader.length * 5 + 3;
          doc.setFontSize(10);
          doc.setTextColor(40, 40, 40);
          doc.setFont("helvetica", "normal");
          return;
        }
        
        // Handle bold text markers
        if (line.startsWith('**') && line.endsWith('**')) {
          checkNewPage(8);
          doc.setFont("helvetica", "bold");
          const boldText = line.replace(/\*\*/g, '');
          const splitBold = doc.splitTextToSize(boldText, maxWidth);
          doc.text(splitBold, margin, yPos);
          yPos += splitBold.length * 4 + 2;
          doc.setFont("helvetica", "normal");
          return;
        }
        
        // Handle bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
          checkNewPage(8);
          const bulletText = line.substring(2);
          const splitBullet = doc.splitTextToSize(bulletText, maxWidth - 8);
          doc.text('\u2022', margin, yPos);
          doc.text(splitBullet, margin + 6, yPos);
          yPos += splitBullet.length * 4 + 1;
          return;
        }
        
        // Handle table rows (simplified)
        if (line.startsWith('|') && line.endsWith('|')) {
          checkNewPage(8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const cleanLine = line.replace(/\|/g, '  ').trim();
          if (!cleanLine.match(/^[-\s]+$/)) {
            const splitTable = doc.splitTextToSize(cleanLine, maxWidth);
            doc.text(splitTable, margin, yPos);
            yPos += splitTable.length * 4;
          }
          doc.setFontSize(10);
          return;
        }
        
        // Regular text
        checkNewPage(8);
        // Handle inline bold
        let processedLine = line.replace(/\*\*([^*]+)\*\*/g, '$1');
        processedLine = processedLine.replace(/\*([^*]+)\*/g, '$1');
        const splitText = doc.splitTextToSize(processedLine, maxWidth);
        doc.text(splitText, margin, yPos);
        yPos += splitText.length * 4 + 1;
      });
      
      // Separator between messages
      yPos += 5;
      if (idx < messagesToExport.length - 1) {
        checkNewPage(5);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;
      }
    });
    
    // Footer on last page
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.setFont("helvetica", "italic");
      doc.text(
        "NM Ai - Newsmaker.id | Informasi bersifat edukatif, bukan rekomendasi transaksi",
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
      doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    }
    
    doc.save(`nm-ai-${lastOnly ? "last" : "full"}-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [sessionData?.messages, streamingContent]);

  // Auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      // Small delay to ensure DOM is updated
      setTimeout(() => scrollToBottom(), 50);
    }
  }, [isStreaming]);

  useEffect(() => {
    if (sessionId && pendingPrompt && !isStreaming) {
      sendMessage(pendingPrompt);
      setPendingPrompt(null);
    }
  }, [sessionId, pendingPrompt, isStreaming]);

  const handleMenuClick = async (prompt: string) => {
    try {
      const newSession = await createSession.mutateAsync({
        title: "New Conversation",
        model: "gpt-5.1"
      });
      setLocation(`/chat/${newSession.id}`);
      
      if (prompt) {
        setPendingPrompt(prompt);
      }
    } catch (err) {
      console.error("Failed to create session");
    }
  };

  const handleClearChat = async () => {
    if (!sessionId) return;
    if (confirm("Hapus riwayat chat dan kembali ke menu?")) {
      await deleteSession.mutateAsync(sessionId);
      setLocation("/");
    }
  };

  const handleBackToHome = () => {
    setLocation("/");
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

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Pilih file gambar (PNG, JPG, dll)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran file maksimal 5MB");
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const handleChartAnalysis = async () => {
    if (!selectedImage || !sessionId || isAnalyzing || isStreaming) return;

    setIsAnalyzing(true);
    setChartStreamingContent("");
    const formData = new FormData();
    formData.append("image", selectedImage);
    formData.append("message", inputMessage || "Analisa gambar ini");
    formData.append("sessionId", sessionId.toString());

    setInputMessage("");
    clearImage();

    try {
      const response = await fetch("/api/analyze-chart", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to analyze");
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let streamContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                streamContent += data.content;
                setChartStreamingContent(streamContent);
                scrollToBottom();
              }
              if (data.done) {
                break;
              }
            } catch {}
          }
        }
      }

      const { queryClient } = await import("@/lib/queryClient");
      await queryClient.invalidateQueries({ queryKey: [api.sessions.get.path, sessionId] });
      await queryClient.refetchQueries({ queryKey: [api.sessions.get.path, sessionId] });

    } catch (error) {
      console.error("Image analysis error:", error);
      alert("Gagal menganalisis gambar. Coba lagi.");
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setChartStreamingContent(""), 500);
    }
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col min-h-screen min-h-[100dvh] bg-background text-foreground">
        <main className="flex-1 flex flex-col items-center justify-start sm:justify-center gap-4 sm:gap-6 py-4 sm:py-8 px-3 sm:px-4 overflow-y-auto">
          <div className="text-center space-y-2 sm:space-y-3">
            <img src={nmLogo} alt="NM Ai" className="h-16 sm:h-24 mx-auto object-contain" />
            <div className="space-y-1">
              <h1 className="text-lg sm:text-2xl font-bold text-foreground">Selamat Datang di NM Ai</h1>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-lg px-2">
                Asisten AI edukatif untuk ekonomi, keuangan, dan pasar - dari berita terkini hingga analisis mendalam.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-w-3xl w-full">
            {MENU_OPTIONS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleMenuClick(item.prompt)}
                className="flex flex-col items-start gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-border/50 bg-card/50 text-left hover:bg-card hover:border-primary/30 transition-all active:scale-[0.98] group"
                data-testid={`button-menu-${idx}`}
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary group-hover:scale-110 transition-transform" />
                  <span className="text-xs sm:text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 leading-tight">{item.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2 max-w-2xl w-full p-2.5 sm:p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-amber-600 dark:text-amber-400">Perhatian:</span> Informasi bersifat edukatif, bukan rekomendasi transaksi. Keputusan investasi tanggung jawab pengguna. NM Ai dapat menghasilkan informasi tidak akurat.
            </p>
          </div>

          <p className="text-[10px] sm:text-xs text-muted-foreground text-center pb-2">
            NM Ai - Newsmaker.id Editorial Engine 2025
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-background text-foreground overflow-hidden font-sans">
      <header className="h-12 sm:h-14 border-b border-border/40 bg-background/80 backdrop-blur flex items-center justify-between px-2 sm:px-4 z-20 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBackToHome}
            className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-9 sm:w-9"
            title="Kembali ke Menu"
            data-testid="button-home"
          >
            <Home className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-sm text-foreground font-medium">Gwen Stacy</span>
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline"
                size="sm"
                disabled={!sessionData?.messages?.length}
                className="gap-1.5 text-foreground border-primary/50 hover:bg-primary/10 hover:border-primary h-8 sm:h-9 px-2.5 sm:px-3"
                title="Download Chat"
                data-testid="button-export-chat"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline text-xs font-medium">Download</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Resume Terakhir (Q&A terakhir)
              </DropdownMenuLabel>
              <DropdownMenuItem 
                onClick={() => handleExportNote(true)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-last-note"
              >
                <FileText className="h-4 w-4" />
                <span>Note (.txt)</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExportMD(true)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-last-md"
              >
                <FileDown className="h-4 w-4" />
                <span>Markdown (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExportPDF(true)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-last-pdf"
              >
                <FileImage className="h-4 w-4" />
                <span>PDF (.pdf)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Full Conversation (semua chat)
              </DropdownMenuLabel>
              <DropdownMenuItem 
                onClick={() => handleExportNote(false)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-full-note"
              >
                <FileText className="h-4 w-4" />
                <span>Note (.txt)</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExportMD(false)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-full-md"
              >
                <FileDown className="h-4 w-4" />
                <span>Markdown (.md)</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleExportPDF(false)}
                className="gap-2 cursor-pointer"
                data-testid="menu-export-full-pdf"
              >
                <FileImage className="h-4 w-4" />
                <span>PDF (.pdf)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleClearChat}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 sm:h-9 sm:w-9"
            title="Hapus Chat"
            data-testid="button-clear-chat"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div 
        className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar" 
        ref={scrollRef}
      >
        <div className="flex flex-col min-h-full pb-4">
          {isLoadingChat ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          ) : (
            <>
              {sessionData?.messages.map((msg, idx) => (
                <ChatMessage 
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  createdAt={msg.createdAt || undefined}
                  messageId={msg.id}
                  meta={msg.meta as { imageData?: string } | null}
                  isLastMessage={idx === sessionData.messages.length - 1 && msg.role === "assistant"}
                  onQuickReply={handleQuickReply}
                />
              ))}
              {isStreaming && streamingContent && (
                <ChatMessage 
                  role="assistant"
                  content={streamingContent}
                  isStreaming={true}
                />
              )}
              {isAnalyzing && chartStreamingContent && (
                <ChatMessage 
                  role="assistant"
                  content={chartStreamingContent}
                  isStreaming={true}
                />
              )}
              {((isStreaming && !streamingContent) || (isAnalyzing && !chartStreamingContent)) && (
                <div className="flex w-full gap-2 sm:gap-4 px-2 sm:px-4 py-3 sm:py-6 bg-card/30 border-y border-border/10">
                  <div className="container max-w-4xl mx-auto flex gap-2 sm:gap-4 md:gap-5">
                    <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl shadow-lg bg-white/90 overflow-hidden">
                      <img src={nmLogo} alt="NM Ai" className="h-6 w-6 sm:h-8 sm:w-8 object-contain" />
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">Gwen sedang mengetik</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!sessionData?.messages.length && !isStreaming && (
                <ChatMessage 
                  role="assistant"
                  content={WELCOME_MESSAGE}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/30 bg-background px-2 sm:px-4 pt-3 sm:pt-4 pb-3 sm:pb-4">
        <div className="max-w-4xl mx-auto">
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img 
                src={imagePreview} 
                alt="Chart preview" 
                className="h-20 sm:h-24 rounded-lg border border-border/50 object-cover"
              />
              <button
                onClick={clearImage}
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 hover:bg-destructive/80 transition-colors"
                data-testid="button-remove-image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5 sm:gap-2 bg-card/80 backdrop-blur border border-border/50 rounded-xl sm:rounded-2xl p-1.5 sm:p-2 shadow-lg focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
              data-testid="input-image"
            />
            <input
              type="file"
              ref={cameraInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="input-camera"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isStreaming || isAnalyzing}
                  className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 text-muted-foreground hover:text-primary mb-0.5 sm:mb-1"
                  title="Upload Chart untuk Analisis"
                  data-testid="button-upload-chart"
                >
                  <ImagePlus className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem 
                  onClick={() => cameraInputRef.current?.click()}
                  className="gap-2 cursor-pointer"
                  data-testid="menu-camera"
                >
                  <Camera className="h-4 w-4" />
                  <span>Ambil Foto</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 cursor-pointer"
                  data-testid="menu-file"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Pilih dari File</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={selectedImage ? "Tambah instruksi (opsional)..." : "Tanya apapun... (Ctrl+V untuk paste gambar)"}
              className="min-h-[40px] sm:min-h-[44px] max-h-[120px] sm:max-h-[200px] w-full resize-none border-0 bg-transparent focus-visible:ring-0 py-2.5 sm:py-3 px-2 sm:px-3 text-sm sm:text-base"
              rows={1}
              data-testid="input-message"
            />
            <Button 
              onClick={() => selectedImage ? handleChartAnalysis() : handleSend()} 
              disabled={(!inputMessage.trim() && !selectedImage) || isStreaming || isAnalyzing}
              size="icon"
              className={cn(
                "h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl transition-all mb-0.5 sm:mb-1",
                (inputMessage.trim() || selectedImage) ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground"
              )}
              data-testid="button-send"
            >
              {isAnalyzing ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </Button>
          </div>
          <p className="text-center text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2">
            {selectedImage ? "Upload chart untuk analisis teknikal" : "NM Ai dapat membuat kesalahan. Periksa info penting."}
          </p>
        </div>
      </div>
    </div>
  );
}

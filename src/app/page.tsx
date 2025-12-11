"use client";

import { useEffect, useRef, useState } from "react";
import LoadingSplash from "@/components/LoadingSplash";

import { ensureAnonAuth } from "@/lib/auth";
import {
  loadMessages,
  saveMessage,
  clearSessionMessages,
  type ChatMessage,
} from "@/lib/chatStore";

import { UiMessage, ApiRoute, stripMarkdown } from "@/components/chat/types";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { DeleteHistoryModal } from "@/components/chat/DeleteHistoryModal";
import { CopyToast } from "@/components/chat/CopyToast";
import { WelcomeNavigator } from "@/components/chat/WelcomeNavigator";
import { ScrollToBottomButton } from "@/components/chat/ScrollToBottomButton";

const MIN_SPLASH_MS = 5000; // minimal 5 detik splash

export default function Home() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [apiRoute, setApiRoute] = useState<ApiRoute>("/api/GwenStacy");
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [isCopyToastVisible, setIsCopyToastVisible] = useState(false);
  const [renderScrollDown, setRenderScrollDown] = useState(false);
  const [renderDeleteModal, setRenderDeleteModal] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);

  // 🔥 SPLASH STATE
  const [showSplash, setShowSplash] = useState(true);
  const [isFadingSplash, setIsFadingSplash] = useState(false);
  const [isFadingIn, setIsFadingIn] = useState(false);

  const copyToastTimeout = useRef<NodeJS.Timeout | null>(null);
  const copyToastHideTimeout = useRef<NodeJS.Timeout | null>(null);
  const scrollDownHideTimeout = useRef<NodeJS.Timeout | null>(null);
  const deleteModalHideTimeout = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null!);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRequestRef = useRef<AbortController | null>(null);

  // TTS
  const [canSpeak, setCanSpeak] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // const isGwen = apiRoute === "/api/nm-ai";
  // const isStacy = apiRoute === "/api/chatgpt";
  const isGwenStacy = apiRoute === "/api/GwenStacy";
  const canAttachFile = isGwenStacy;

  const modelOptions = [
    // {
    //   value: "/api/nm-ai" as ApiRoute,
    //   label: "Gwen (NM Ai)",
    //   icon: "",
    //   description: "Cepat, ringan, tanpa lampiran.",
    // },
    // {
    //   value: "/api/chatgpt" as ApiRoute,
    //   label: "Stacy (GPT-5 Nano)",
    //   icon: "",
    //   description: "Lebih pintar, dukung lampiran.",
    // },
    {
      value: "/api/GwenStacy" as ApiRoute,
      label: "Gwen Stacy (NM Ai)",
      icon: "",
      description: "Lebih pintar, dukung lampiran.",
    },
  ];

  // ====== SPLASH 5 DETIK + FADE OUT ======

  useEffect(() => {
    // Setelah durasi splash → mulai fade out
    const fadeOutTimer = setTimeout(() => {
      setIsFadingSplash(true);
    }, MIN_SPLASH_MS);

    // Setelah fade out selesai → remove dari DOM
    const hideTimer = setTimeout(() => {
      setShowSplash(false);
    }, MIN_SPLASH_MS + 500);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // ====== TTS SUPPORT CHECK ======
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const a = new Audio();
      setCanSpeak(typeof a.play === "function");
    } catch {
      setCanSpeak(false);
    }
  }, []);

  // ====== Firebase anon auth ======
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const uid = await ensureAnonAuth();
        if (!cancelled) setSessionId(uid);
      } catch (error) {
        console.error("Firebase anon auth failed:", error);
        if (!cancelled) {
          setFirebaseError("Gagal menghubungkan ke Firebase. Coba muat ulang.");
        }
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ====== Load messages dari Firebase ======
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    const mapToUiMessage = (msg: ChatMessage): UiMessage => {
      const rawDate = (msg.createdAt as any) || null;
      let timestamp = new Date();

      if (rawDate?.toDate) {
        timestamp = rawDate.toDate();
      } else if (typeof rawDate?.seconds === "number") {
        timestamp = new Date(rawDate.seconds * 1000);
      }

      return {
        id:
          msg.id ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now())),
        text: msg.text,
        sender: msg.role === "ai" ? "ai" : "user",
        timestamp,
      };
    };

    setIsLoadingHistory(true);
    loadMessages(sessionId)
      .then((history) => {
        if (cancelled) return;
        setMessages(history.map(mapToUiMessage));
      })
      .catch((error) => {
        console.error("Failed to load chat history:", error);
        if (!cancelled) {
          setFirebaseError("Gagal memuat riwayat chat.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ====== Scroll ke bawah saat ada pesan baru / typing ======
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // ====== Close model dropdown on outside click ======
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target as Node)
      ) {
        setIsModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ====== Scroll menu rekomendasi ======
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      setShowScrollDown(!isAtBottom);
    };

    handleScroll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [messages.length]);

  // ====== Scroll utama ======
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12;
      setShowScrollDown(!isAtBottom);
    };

    handleScroll();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [messages.length, isTyping]);

  // ====== Control render scroll-down button ======
  useEffect(() => {
    if (scrollDownHideTimeout.current) {
      clearTimeout(scrollDownHideTimeout.current);
    }

    if (showScrollDown) {
      setRenderScrollDown(true);
    } else {
      scrollDownHideTimeout.current = setTimeout(() => {
        setRenderScrollDown(false);
      }, 260);
    }

    return () => {
      if (scrollDownHideTimeout.current) {
        clearTimeout(scrollDownHideTimeout.current);
      }
    };
  }, [showScrollDown]);

  // ====== Sync tinggi textarea ======
  const syncTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;

    const lineHeight = 24;
    const maxHeight = lineHeight * 7 + 24;
    const minHeight = 56;

    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(next, minHeight)}px`;
  };

  useEffect(() => {
    syncTextareaHeight();
  }, [inputValue]);

  // ====== Copy toast ======
  const showCopyToast = (text: string) => {
    if (copyToastTimeout.current) clearTimeout(copyToastTimeout.current);
    if (copyToastHideTimeout.current)
      clearTimeout(copyToastHideTimeout.current);

    setCopyToast(text);
    setIsCopyToastVisible(true);

    copyToastTimeout.current = setTimeout(() => {
      setIsCopyToastVisible(false);
      copyToastHideTimeout.current = setTimeout(() => {
        setCopyToast(null);
      }, 260);
    }, 2000);
  };

  const handleCopy = async (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showCopyToast("Konten berhasil dipindahkan ke clipboard.");
    } catch (error) {
      console.error("Gagal menyalin teks:", error);
      showCopyToast("Gagal menyalin teks.");
    }
  };

  const handleShare = async (text: string) => {
    const plainText = stripMarkdown(text);
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text: plainText });
        showCopyToast("Tautan/teks dibagikan.");
        return;
      }

      await handleCopy(plainText);
    } catch (error) {
      console.error("Gagal membagikan:", error);
      showCopyToast("Gagal membagikan konten.");
    }
  };

  // ====== TTS ======
  const stopSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  };

  const interruptResponse = () => {
    if (pendingRequestRef.current) {
      pendingRequestRef.current.abort();
      pendingRequestRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setTypingMessageId(null);
    setIsRegenerating(false);
    setIsTyping(false);
  };

  const speakText = async (text: string) => {
    const plainText = stripMarkdown(text);
    if (!plainText.trim() || !canSpeak) return;

    try {
      stopSpeech();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: plainText,
          voice: "alloy",
        }),
      });

      if (!res.ok) {
        console.error("TTS GPT error:", await res.text());
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.onended = () => setIsSpeaking(false);
      audioRef.current.onpause = () => setIsSpeaking(false);

      setIsSpeaking(true);
      audioRef.current.play().catch((err) => {
        setIsSpeaking(false);
        console.error("Gagal memutar audio:", err);
      });
    } catch (err) {
      setIsSpeaking(false);
      console.error("Gagal memproses TTS GPT:", err);
    }
  };

  // cleanup audio URL
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // ====== Cleanup global ======
  useEffect(() => {
    return () => {
      if (copyToastTimeout.current) clearTimeout(copyToastTimeout.current);
      if (copyToastHideTimeout.current)
        clearTimeout(copyToastHideTimeout.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (deleteModalHideTimeout.current)
        clearTimeout(deleteModalHideTimeout.current);
      if (pendingRequestRef.current) pendingRequestRef.current.abort();
      stopSpeech();
      setIsSpeaking(false);
    };
  }, []);

  useEffect(() => {
    if (deleteModalHideTimeout.current) {
      clearTimeout(deleteModalHideTimeout.current);
    }

    if (isDeleteModalOpen) {
      setRenderDeleteModal(true);
    } else {
      deleteModalHideTimeout.current = setTimeout(() => {
        setRenderDeleteModal(false);
      }, 260);
    }

    return () => {
      if (deleteModalHideTimeout.current)
        clearTimeout(deleteModalHideTimeout.current);
    };
  }, [isDeleteModalOpen]);

  // ====== File handling ======
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAttachFile) return;
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const findLastUserIndex = (list: UiMessage[]) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].sender === "user") return i;
    }
    return -1;
  };

  // ====== AI typing helper ======
  const showAiMessageWithTyping = (
    fullText: string,
    imagePath?: string | null
  ) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const id = (Date.now() + 1).toString();
    setTypingMessageId(id);
    const baseMessage: UiMessage = {
      id,
      text: "",
      sender: "ai",
      timestamp: new Date(),
      imagePath: imagePath || undefined,
    };

    setMessages((prev) => [...prev, baseMessage]);

    const total = fullText.length;
    let index = 0;
    const chunkSize = 8;
    const speed = 5;

    const step = () => {
      index = Math.min(index + chunkSize, total);
      const nextText = fullText.slice(0, index);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                text: nextText,
              }
            : m
        )
      );

      if (index < total) {
        typingTimeoutRef.current = setTimeout(step, speed);
      } else {
        typingTimeoutRef.current = null;
        setTypingMessageId(null);
      }
    };

    step();

    if (sessionId) {
      saveMessage({ sessionId, role: "ai", text: fullText }).catch((error) => {
        console.error("Failed to save AI message:", error);
        setFirebaseError("Gagal menyimpan pesan ke Firebase.");
      });
    }
  };

  // ====== Send message ======
  const sendMessage = async (overrideText?: string) => {
    if (!sessionId) {
      setFirebaseError(
        "Menyiapkan koneksi Firebase. Silakan coba lagi sebentar."
      );
      return;
    }

    const hasFile = canAttachFile && !!selectedFile;
    const rawText = overrideText !== undefined ? overrideText : inputValue;

    if (!rawText.trim() && !hasFile) return;

    let displayText = rawText.trim();
    if (hasFile && selectedFile) {
      const infoLine = `📎 File terlampir: ${selectedFile.name}`;
      displayText = displayText ? `${displayText}\n\n${infoLine}` : infoLine;
    }

    const userMessage: UiMessage = {
      id: Date.now().toString(),
      text: displayText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    saveMessage({ sessionId, role: "user", text: displayText }).catch(
      (error) => {
        console.error("Failed to save user message:", error);
        setFirebaseError("Gagal menyimpan pesan ke Firebase.");
      }
    );

    try {
      const historyPayload = messages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const formData = new FormData();
      formData.append("prompt", displayText);
      formData.append("history", JSON.stringify(historyPayload));

      if (hasFile && selectedFile) {
        formData.append("file", selectedFile);
      }

      const controller = new AbortController();
      pendingRequestRef.current = controller;

      const res = await fetch(apiRoute, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API error: ${res.status} – ${errorText || "Unknown error"}`
        );
      }

      const data = await res.json();

      const fullReply: string =
        data.reply && typeof data.reply === "string"
          ? data.reply
          : "NM Ai tidak memberikan respon.";

      showAiMessageWithTyping(fullReply, data.imagePath);
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        return;
      }
      const errorMessage: UiMessage = {
        id: (Date.now() + 1).toString(),
        text: `Gagal memproses permintaan: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setSelectedFile(null);
      pendingRequestRef.current = null;
    }
  };

  // ====== Regenerate ======
  const regenerateLastAnswer = async () => {
    if (!sessionId) {
      setFirebaseError(
        "Menyiapkan koneksi Firebase. Silakan coba lagi sebentar."
      );
      return;
    }

    const lastUserIndex = findLastUserIndex(messages);
    const lastUserMessage =
      lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
    const hasAiAfterUser =
      lastUserIndex >= 0 &&
      messages.slice(lastUserIndex + 1).some((m) => m.sender === "ai");

    if (!lastUserMessage || !hasAiAfterUser) return;

    setMessages((prev) => {
      const lastUserIdx = findLastUserIndex(prev);
      if (lastUserIdx < 0) return prev;
      return prev.slice(0, lastUserIdx + 1);
    });

    setIsTyping(true);
    setIsRegenerating(true);

    try {
      const historyPayload: Array<{ role: string; content: string }> = [];

      const formData = new FormData();
      formData.append("prompt", lastUserMessage.text);
      formData.append("history", JSON.stringify(historyPayload));

      const controller = new AbortController();
      pendingRequestRef.current = controller;

      const res = await fetch(apiRoute, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API error: ${res.status} ƒ?" ${errorText || "Unknown error"}`
        );
      }

      const data = await res.json();

      const fullReply: string =
        data.reply && typeof data.reply === "string"
          ? data.reply
          : "NM Ai tidak memberikan respon.";

      showAiMessageWithTyping(fullReply, data.imagePath);
    } catch (error) {
      if ((error as any)?.name === "AbortError") {
        return;
      }
      const errorMessage: UiMessage = {
        id: (Date.now() + 1).toString(),
        text: `Gagal memproses permintaan: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setIsRegenerating(false);
      pendingRequestRef.current = null;
    }
  };

  // ====== Delete history ======
  const handleDeleteHistory = () => setIsDeleteModalOpen(true);

  const reinputLastUser = () => {
    const lastUserIndex = findLastUserIndex(messages);
    const lastUserMessage =
      lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;

    if (!lastUserMessage) return;

    setInputValue(lastUserMessage.text);
    setSelectedFile(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      syncTextareaHeight();
    }, 0);
  };

  const confirmDeleteHistory = async () => {
    if (!sessionId) return;

    setIsDeletingHistory(true);
    setIsLoadingHistory(true);
    setFirebaseError(null);

    try {
      await clearSessionMessages(sessionId);
      setMessages([]);
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error("Failed to clear chat history:", error);
      setFirebaseError("Gagal menghapus riwayat chat.");
    } finally {
      setIsDeletingHistory(false);
      setIsLoadingHistory(false);
    }
  };

  // ====== Derived state ======
  const hasFile = canAttachFile && !!selectedFile;
  const isSendDisabled =
    (!inputValue.trim() && !hasFile) ||
    isLoadingHistory ||
    !sessionId ||
    isRegenerating;
  const canDeleteHistory =
    !!sessionId && !isLoadingHistory && messages.length > 0;
  const lastUserIndex = findLastUserIndex(messages);
  const hasAiAfterUser =
    lastUserIndex >= 0 &&
    messages.slice(lastUserIndex + 1).some((m) => m.sender === "ai");
  const canRegenerate =
    !!sessionId && !isLoadingHistory && hasAiAfterUser && !isTyping;
  const canReinput = !!sessionId && !isLoadingHistory && lastUserIndex >= 0;
  const canInterrupt =
    !!typingMessageId ||
    isTyping ||
    isRegenerating ||
    !!pendingRequestRef.current;

  return (
    <>
      {/* 🔵 SPLASH OVERLAY: pakai LoadingSplash + fade out */}
      {showSplash && (
        <div
          className={`
      fixed inset-0 z-50 
      transition-opacity duration-500 
      ${isFadingSplash ? "opacity-0" : ""}
    `}
        >
          <LoadingSplash />
        </div>
      )}

      {/* 🔥 MAIN UI CHAT */}
      <main className="flex h-screen max-h-screen w-full flex-col overflow-hidden bg-gray-100 shadow-2xl">
        <audio ref={audioRef} className="hidden" />

        {firebaseError && (
          <div className="mx-auto w-full max-w-5xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {firebaseError}
          </div>
        )}

        <CopyToast message={copyToast} visible={isCopyToastVisible} />

        <DeleteHistoryModal
          open={isDeleteModalOpen}
          render={renderDeleteModal}
          isDeleting={isDeletingHistory}
          onCancel={() => setIsDeleteModalOpen(false)}
          onConfirm={confirmDeleteHistory}
        />

        <ChatHeader
          apiRoute={apiRoute}
          setApiRoute={(v) => {
            setApiRoute(v);
            if (v === "/api/GwenStacy") setSelectedFile(null);
          }}
          modelOptions={modelOptions}
          isModelOpen={isModelOpen}
          setIsModelOpen={setIsModelOpen}
          modelMenuRef={modelMenuRef}
          onDeleteHistoryClick={handleDeleteHistory}
          canDeleteHistory={canDeleteHistory}
        />

        {/* CHAT AREA */}
        <section className="relative flex-1 overflow-hidden">
          <div
            ref={chatScrollRef}
            className="relative h-full bg-gray-50 nm-scroll overflow-y-auto"
          >
            <div className="mx-auto h-full w-full max-w-5xl px-3 md:px-5">
              <div className="relative z-10 flex min-h-full flex-col px-2 sm:px-4 py-32 md:py-36 space-y-4">
                {messages.length === 0 && (
                  <WelcomeNavigator
                    scrollAreaRef={scrollAreaRef}
                    onExampleClick={(example) => sendMessage(example)}
                  />
                )}

                <ChatMessages
                  messages={messages}
                  isTyping={isTyping}
                  canSpeak={canSpeak}
                  onCopy={handleCopy}
                  onShare={handleShare}
                  onSpeak={speakText}
                  onStop={stopSpeech}
                  isSpeaking={isSpeaking}
                  onReinput={reinputLastUser}
                  canReinput={canReinput}
                  onInterrupt={interruptResponse}
                  canInterrupt={canInterrupt}
                  typingMessageId={typingMessageId}
                  messagesEndRef={messagesEndRef}
                  onRegenerate={regenerateLastAnswer}
                  canRegenerate={canRegenerate}
                  isRegenerating={isRegenerating}
                />
              </div>

              <ScrollToBottomButton
                visible={showScrollDown}
                render={renderScrollDown && messages.length > 0}
                onClick={() =>
                  chatScrollRef.current?.scrollTo({
                    top: chatScrollRef.current.scrollHeight,
                    behavior: "smooth",
                  })
                }
              />
            </div>
          </div>
        </section>

        <ChatInput
          canAttachFile={canAttachFile}
          selectedFile={selectedFile}
          onFileChange={handleFileChange}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSend={() => sendMessage()}
          isSendDisabled={isSendDisabled}
          textareaRef={textareaRef}
          syncTextareaHeight={syncTextareaHeight}
          onInterrupt={interruptResponse}
          canInterrupt={canInterrupt}
        />
      </main>
    </>
  );
}

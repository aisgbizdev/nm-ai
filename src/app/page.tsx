"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faArrowUp,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  imagePath?: string;
}

type ApiRoute = "/api/nm-ai" | "/api/chatgpt";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [apiRoute, setApiRoute] = useState<ApiRoute>("/api/nm-ai");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isGwen = apiRoute === "/api/nm-ai";
  const isStacy = apiRoute === "/api/chatgpt";
  const canAttachFile = isStacy; // Lampiran hanya untuk Stacy

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAttachFile) return; // kalau Gwen, abaikan input file
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleSendMessage = async () => {
    const hasFile = canAttachFile && !!selectedFile;
    if (!inputValue.trim() && !hasFile) return;

    let displayText = inputValue.trim();
    if (hasFile && selectedFile) {
      const infoLine = `📎 File terlampir: ${selectedFile.name}`;
      displayText = displayText ? `${displayText}\n\n${infoLine}` : infoLine;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: displayText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      const formData = new FormData();
      formData.append("prompt", displayText);
      formData.append("history", JSON.stringify(historyPayload));

      // hanya kirim file kalau engine mengizinkan lampiran
      if (hasFile && selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch(apiRoute, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API error: ${res.status} – ${errorText || "Unknown error"}`
        );
      }

      const data = await res.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.reply || "NM Ai tidak memberikan respon.",
        sender: "ai",
        timestamp: new Date(),
        imagePath: data.imagePath,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Gagal memproses permintaan: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        sender: "ai",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }

    setIsTyping(false);
    setSelectedFile(null);
  };

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100">
        <main className="flex h-screen w-full max-w-4xl flex-col bg-white shadow-2xl md:my-8 md:h-[90vh] md:rounded-2xl" />
      </div>
    );
  }

  const hasFile = canAttachFile && !!selectedFile;
  const isSendDisabled = !inputValue.trim() && !hasFile;

  return (
    <>
      {/* --- CUSTOM SCROLLBAR --- */}
      <style jsx global>{`
        .nm-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .nm-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .nm-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #6366f1, #a855f7);
          border-radius: 999px;
        }
        .nm-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #4f46e5, #9333ea);
        }
        .nm-scroll {
          scrollbar-width: thin;
          scrollbar-color: #6366f1 transparent;
        }
      `}</style>

      <main className="flex h-screen w-full flex-col overflow-hidden bg-white shadow-2xl">
        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 select-none md:px-6 md:py-4">
          <div className="flex items-center gap-5">
            <a
              href="https://www.newsmaker.id/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border bg-zinc-200 text-gray-600 transition-all hover:bg-zinc-300 hover:text-gray-800 md:h-10 md:w-10"
            >
              <FontAwesomeIcon icon={faXmark} />
            </a>

            <div className="flex flex-col">
              <h1 className="bg-linear-to-r from-blue-500 via-pink-500 to-purple-500 bg-clip-text text-lg font-semibold text-transparent md:text-xl">
                Newsmaker Artificial Intelligence
              </h1>

              {/* Engine selector */}
              <div className="flex flex-wrap items-center gap-2">
                {/* <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    Engine:
                  </span> */}
                <select
                  value={apiRoute}
                  onChange={(e) => {
                    const value = e.target.value as ApiRoute;
                    setApiRoute(value);
                    // kalau pindah ke Gwen, kosongkan file
                    if (value === "/api/nm-ai") {
                      setSelectedFile(null);
                    }
                  }}
                  className="h-7 min-w-[35%] rounded-lg border border-zinc-200 bg-zinc-50 px-1 text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-blue-500 focus:bg-white"
                >
                  <option value="/api/nm-ai">Gwen (NM Ai)</option>
                  <option value="/api/chatgpt">Stacy (GPT-5 Nano)</option>
                </select>
              </div>
            </div>
          </div>

          <Image
            className="hidden opacity-70 md:block"
            src="/assets/LogoNM23_Ai_22.png"
            alt="Newsmaker logo"
            width={50}
            height={12}
            priority
          />
        </header>

        {/* CHAT AREA */}
        <section className="nm-scroll relative flex-1 overflow-y-auto px-3 py-4 md:px-6">
          <div className="bg-white/50">
            <div className="relative z-10 flex h-full flex-col">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                const isAi = msg.sender === "ai";

                return (
                  <div
                    key={msg.id}
                    className={`flex w-full ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`flex max-w-full flex-col gap-1 md:max-w-[75%] ${
                        isUser ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={[
                          "relative w-full rounded-xl px-4 py-3 text-sm shadow-md md:px-5",
                          isUser
                            ? "bg-gradient-to-r from-blue-500/90 to-blue-600/90 text-white backdrop-blur rounded-br-none"
                            : "bg-white/90 text-zinc-900 backdrop-blur border border-zinc-100 rounded-bl-none",
                        ].join(" ")}
                      >
                        {isAi && (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              backgroundImage:
                                "url('/assets/NewsMaker-23-logo.png')",
                              backgroundSize: "clamp(80px, 50vw, 180px)",
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                              opacity: 0.15,
                            }}
                          />
                        )}

                        {isAi ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }) => (
                                <p
                                  {...props}
                                  className={
                                    "mb-1 leading-relaxed " +
                                    (props.className || "")
                                  }
                                />
                              ),
                              strong: ({ node, ...props }) => (
                                <strong
                                  {...props}
                                  className={
                                    "font-semibold " + (props.className || "")
                                  }
                                />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul
                                  {...props}
                                  className={
                                    "mb-2 ml-4 list-disc space-y-1 " +
                                    (props.className || "")
                                  }
                                />
                              ),
                              li: ({ node, ...props }) => (
                                <li
                                  {...props}
                                  className={
                                    "leading-relaxed " + (props.className || "")
                                  }
                                />
                              ),
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {msg.text}
                          </p>
                        )}

                        {msg.imagePath && isAi && (
                          <div className="mt-3">
                            <Image
                              src={msg.imagePath}
                              alt="Gambar yang dianalisis"
                              width={240}
                              height={160}
                              className="h-auto w-auto max-w-full rounded-lg border border-zinc-200 object-contain"
                            />
                          </div>
                        )}
                      </div>

                      <span className="text-[10px] text-gray-500 opacity-70 select-none">
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[60%] rounded-2xl border border-zinc-100 bg-white/90 px-4 py-3 shadow-md backdrop-blur">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.3s]" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.15s]" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </section>

        {/* INPUT AREA */}
        <footer className="border-t border-zinc-200 bg-white px-3 py-2 md:px-6 md:py-3">
          <div className="w-full md:px-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center justify-center gap-2 p-1"
            >
              {/* Attach Button – hanya tampil kalau boleh lampiran */}
              {canAttachFile && (
                <label className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all hover:bg-zinc-200 md:h-10 md:w-10">
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}

              {/* Textarea */}
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Tulis pertanyaan ke NM Ai..."
                className="max-h-32 flex-1 resize-none py-2 px-6 rounded-full bg-transparent text-base text-gray-900 outline-none border border-gray-300"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={isSendDisabled}
                title={isSendDisabled ? "Message is empty" : ""}
                className="flex h-10 w-10 flex-shrink-0 items-center rounded-full justify-center bg-blue-500 text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-blue-500"
              >
                <FontAwesomeIcon icon={faArrowUp} size="sm" />
              </button>
            </form>

            {/* Selected file hint – hanya kalau Stacy & ada file */}
            {canAttachFile && selectedFile && (
              <p className="mt-1 truncate text-xs text-zinc-500">
                📎 {selectedFile.name}
              </p>
            )}
          </div>
        </footer>
      </main>
    </>
  );
}

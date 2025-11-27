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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedFile) return;

    let displayText = inputValue.trim();
    if (selectedFile) {
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
      if (selectedFile) formData.append("file", selectedFile);

      const res = await fetch("/api/nm-ai", {
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
        <main className="flex h-screen w-full max-w-4xl flex-col bg-white shadow-2xl md:h-[90vh] md:rounded-2xl md:my-8" />
      </div>
    );
  }

  const isSendDisabled = !inputValue.trim() && !selectedFile;

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

      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100">
        <main className="flex h-screen w-full flex-col overflow-hidden bg-white">
          {/* HEADER */}
          <header className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 select-none md:px-6 md:py-4">
            <div className="flex items-center gap-3">
              <a
                href="https://www.newsmaker.id/"
                className="flex h-9 w-9 items-center justify-center rounded-full border bg-zinc-200 text-gray-600 transition-all hover:bg-zinc-300 hover:text-gray-800 md:h-10 md:w-10"
              >
                <FontAwesomeIcon icon={faXmark} />
              </a>

              {/* <select name="" id="">
                <option value="">Gwen</option>
                <option value="">Stacy</option>
              </select> */}

              <div>
                <h1 className="bg-gradient-to-r from-blue-500 via-pink-500 to-purple-500 bg-clip-text text-lg font-semibold text-transparent md:text-xl">
                  Newsmaker Artificial Intelligence
                </h1>
                <p className="text-xs text-zinc-500 md:text-sm">
                  Virtual Assistant
                </p>
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
              <div className="relative z-10 flex h-full max-w-3xl flex-col">
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
                      {/* column: bubble + time */}
                      <div
                        className={`flex max-w-full flex-col gap-1 md:max-w-[75%] ${
                          isUser ? "items-end" : "items-start"
                        }`}
                      >
                        {/* Bubble */}
                        <div
                          className={[
                            "relative w-full rounded-2xl px-4 py-3 text-sm shadow-md md:px-5",
                            isUser
                              ? "bg-gradient-to-r from-blue-500/90 to-blue-600/90 text-white backdrop-blur rounded-br-none"
                              : "bg-white/90 text-zinc-900 backdrop-blur border border-zinc-100 rounded-bl-none",
                          ].join(" ")}
                        >
                          {isAi && (
                            <div
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                backgroundImage:
                                  "url('/assets/NewsMaker-23-logo.png')",
                                backgroundSize: "clamp(80px, 50vw, 180px)",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                                opacity: 0.15, // << watermark lembut
                              }}
                            />
                          )}

                          {msg.sender === "ai" ? (
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
                                      "leading-relaxed " +
                                      (props.className || "")
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

                          {msg.imagePath && msg.sender === "ai" && (
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

                        {/* Timestamp */}
                        <span className="text-[10px] text-gray-500 opacity-70">
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
            <div className="w-full">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-end gap-2 rounded-full border bg-zinc-50 p-1"
              >
                {/* Attach Button */}
                <label className="flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all hover:bg-zinc-200 md:h-10 md:w-10">
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                {/* Textarea */}
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Tulis pertanyaan ke NM Ai..."
                  className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-900 outline-none"
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
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-blue-500 md:h-10 md:w-10"
                >
                  <FontAwesomeIcon icon={faArrowUp} size="sm" />
                </button>
              </form>

              {/* Selected file hint */}
              {selectedFile && (
                <p className="mt-1 truncate text-xs text-zinc-500">
                  📎 {selectedFile.name}
                </p>
              )}
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}

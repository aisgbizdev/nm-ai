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
  }, [messages]);

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
          background: linear-gradient(180deg, #4f46e5, #9333ea);
          border-radius: 999px;
        }
        .nm-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #6366f1, #a855f7);
        }
        .nm-scroll {
          scrollbar-width: thin;
          scrollbar-color: #6366f1 transparent;
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100">
        <main className="flex h-screen w-full max-w-4xl flex-col bg-white shadow-2xl md:h-[95vh] md:rounded-2xl md:my-4 overflow-hidden">
          {/* HEADER */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 md:px-6 md:py-4 select-none">
            <div className="flex items-center gap-3">
              <a
                href="https://www.newsmaker.id/"
                className="border w-9 h-9 md:w-10 md:h-10 bg-zinc-200 hover:bg-zinc-300 flex items-center justify-center text-gray-600 hover:text-gray-800 rounded-full transition-all"
              >
                <FontAwesomeIcon icon={faXmark} />
              </a>

              <div>
                <h1 className="text-sm md:text-lg font-semibold text-zinc-900">
                  Newsmaker Artificial Intelligence
                </h1>
                <p className="text-[11px] md:text-sm text-zinc-500">
                  Virtual Assistant
                </p>
              </div>
            </div>

            <Image
              className="opacity-60 hidden md:block"
              src="/assets/LogoNM23_Ai_22.png"
              alt="Newsmaker logo"
              width={50}
              height={12}
              priority
            />
          </div>

          {/* CHAT MESSAGES */}
          <div
            className="flex-1 overflow-y-auto nm-scroll px-3 md:px-6 py-4 relative"
            style={{
              backgroundImage: "url('/assets/NewsMaker-23-logo.png')",
              backgroundSize: "clamp(80px, 20vw, 180px)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          >
            {/* overlay tipis biar logo tidak terlalu keras */}
            <div className="absolute inset-0 bg-white/80 pointer-events-none" />

            <div className="relative z-10 mx-auto w-full max-w-3xl space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative px-4 py-3 md:px-5 md:py-3 rounded-2xl break-words shadow-md max-w-[80%] md:max-w-[75%] ${
                      msg.sender === "user"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                        : "bg-gray-200/90 backdrop-blur-md text-zinc-900"
                    }`}
                  >
                    {msg.sender === "ai" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => (
                            <p
                              {...props}
                              className={
                                "mb-1 text-sm leading-relaxed " +
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
                                "text-sm leading-relaxed " +
                                (props.className || "")
                              }
                            />
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    )}

                    {msg.imagePath && msg.sender === "ai" && (
                      <div className="mt-3">
                        <Image
                          src={msg.imagePath}
                          alt="Gambar yang dianalisis"
                          width={240}
                          height={160}
                          className="rounded-lg border border-zinc-200 object-contain"
                        />
                      </div>
                    )}

                    <p className="absolute -bottom-4 right-3 text-[10px] opacity-50">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[60%] rounded-2xl bg-white backdrop-blur-md px-4 py-3 shadow-md">
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

          {/* INPUT */}
          <div className="border-t border-zinc-200 px-3 py-2 md:px-6 md:py-3 bg-white">
            <div className="mx-auto w-full">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-end gap-2 border rounded-full overflow-hidden p-1 bg-zinc-50"
              >
                <label className="flex h-9 w-9 md:h-10 md:w-10 rounded-full cursor-pointer items-center justify-center text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-all flex-shrink-0">
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Tulis pertanyaan..."
                  className="flex-1 max-h-32 text-sm outline-none text-gray-900 px-2 py-2 resize-none bg-transparent"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />

                <button
                  type="submit"
                  disabled={isSendDisabled}
                  title={isSendDisabled ? "Massage is empty" : ""}
                  className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-blue-500 hover:bg-blue-700 text-white transition-all cursor-pointer disabled:opacity-50 disabled:hover:bg-blue-500 flex-shrink-0"
                >
                  <FontAwesomeIcon icon={faArrowUp} size="sm" />
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

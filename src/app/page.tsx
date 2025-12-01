"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperclip,
  faArrowUp,
  faXmark,
  faAnglesDown,
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
  const [isReady, setIsReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [apiRoute, setApiRoute] = useState<ApiRoute>("/api/nm-ai");
  const [isModelOpen, setIsModelOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const [showScrollDown, setShowScrollDown] = useState(true);

  const isGwen = apiRoute === "/api/nm-ai";
  const isStacy = apiRoute === "/api/chatgpt";
  const canAttachFile = isStacy; // Lampiran hanya untuk Stacy

  // === NEW: Menu rekomendasi ala NM Ai Market Navigator ===
  const navigatorMenu = [
    {
      id: "1",
      title: "Trader Mode",
      description: "Analisa teknikal, margin, leverage, dan perilaku trader.",
      example: "Hitung margin XAUUSD 1 lot",
      pill: "Teknikal",
    },
    {
      id: "2",
      title: "Investor Path",
      description:
        "Analisa fundamental, risiko portofolio, dan strategi jangka panjang.",
      example: "Bagaimana outlook emas minggu ini?",
      pill: "Fundamental",
    },
    {
      id: "3",
      title: "Marketing Insight",
      description:
        "Edukasi produk, strategi komunikasi, dan transparansi harga.",
      example: "Bagaimana menjelaskan leverage ke nasabah?",
      pill: "Marketing",
    },
    {
      id: "4",
      title: "Broker Access",
      description: "Diskusi regulasi, kepatuhan Bappebti, dan model SPA.",
      example: "Apa syarat margin minimal sistem SPA?",
      pill: "Regulasi",
    },
    {
      id: "5",
      title: "Regulatory View",
      description: "Analisa perilaku pasar & etika perdagangan berjangka.",
      example: "Bagaimana NM Ai membantu deteksi manipulasi pasar?",
      pill: "Etika Pasar",
    },
    {
      id: "6",
      title: "Mentor Lab",
      description: "Simulasi risiko dan pembelajaran psikologi trading.",
      example: "Simulasikan ketahanan dana 1000 USD di XAUUSD.",
      pill: "Psikologi & Risk",
    },
    {
      id: "7",
      title: "Public Learn",
      description: "Literasi dasar trading dan manajemen risiko.",
      example: "Apa bedanya spread dan margin?",
      pill: "Pemula",
    },
    {
      id: "8",
      title: "Open Talk",
      description: "Diskusi santai seputar pasar, tren, atau opini pribadi.",
      example: "Kenapa gold sering volatil pas rilis data CPI?",
      pill: "Ngobrol",
    },
    {
      id: "9",
      title: "AI Sandbox",
      description:
        "Uji kemampuan NM Ai atau logika pasar yang lagi bikin penasaran.",
      example: "Coba jelaskan logika XAUUSD kalau DXY naik.",
      pill: "Eksperimen",
    },
  ];

  // Loader ready
  useEffect(() => {
    setIsMounted(true);
    const timer = setTimeout(() => setIsReady(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isReady) {
      const fadeTimer = setTimeout(() => setShowLoader(false), 500);
      return () => clearTimeout(fadeTimer);
    }
    setShowLoader(true);
  }, [isReady]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Close model dropdown when click outside
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

  // === NEW: Pantau scroll di opening menu buat hide/show tombol Scroll Down
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8; // toleransi dikit
      setShowScrollDown(!isAtBottom);
    };

    // cek posisi awal
    handleScroll();

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [messages.length]); // opening card cuma ada waktu messages.length === 0

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAttachFile) return; // kalau Gwen, abaikan input file
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const modelOptions: {
    value: ApiRoute;
    label: string;
    icon: string;
    description: string;
  }[] = [
    {
      value: "/api/nm-ai",
      label: "Gwen (NM Ai)",
      icon: "",
      description: "Cepat, ringan, tanpa lampiran.",
    },
    {
      value: "/api/chatgpt",
      label: "Stacy (GPT-5 Nano)",
      icon: "",
      description: "Lebih pintar, dukung lampiran.",
    },
  ];

  const handleModelSelect = (value: ApiRoute) => {
    setApiRoute(value);
    if (value === "/api/nm-ai") {
      // begitu pindah ke Gwen, langsung buang file yang sudah dipilih
      setSelectedFile(null);
    }
    setIsModelOpen(false);
  };

  // === fungsi kirim pesan yang bisa dipakai default & recommendation
  const sendMessage = async (overrideText?: string) => {
    const hasFile = canAttachFile && !!selectedFile;

    const rawText = overrideText !== undefined ? overrideText : inputValue;

    if (!rawText.trim() && !hasFile) return;

    let displayText = rawText.trim();
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

  const handleSendMessage = () => sendMessage();

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-600 p-6">
        <img
          src="/assets/Loading_Nm.gif"
          alt="Loading NM"
          className="h-auto w-[40vw] max-w-[150px]"
        />
      </div>
    );
  }

  const hasFile = canAttachFile && !!selectedFile;
  const isSendDisabled = !inputValue.trim() && !hasFile;

  const inputPlaceholder = isGwen
    ? "Tulis pertanyaan ke NM Ai..."
    : "Tulis pertanyaan ke Stacy (GPT-5 Nano)...";

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

      <main className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 shadow-2xl">
        {showLoader && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-blue-600 transition-opacity duration-500 ${
              isReady ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <img
              src="/assets/Loading_Nm.gif"
              alt="Loading NM"
              className="h-auto w-[40vw] max-w-60"
            />
          </div>
        )}

        {/* HEADER */}
        <header className="flex items-center justify-between bg-white border-b border-zinc-200 px-3 py-2 select-none md:px-6 md:py-4 mx-0 lg:mx-64">
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
              <div className="relative mt-1" ref={modelMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsModelOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs md:text-sm text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-white focus:border-blue-500 focus:outline-none"
                >
                  <span>
                    {modelOptions.find((opt) => opt.value === apiRoute)
                      ?.label || "Pilih model"}
                  </span>
                  <span
                    className={`text-xs transition-transform ${
                      isModelOpen ? "rotate-180" : "rotate-0"
                    }`}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>

                {isModelOpen && (
                  <div className="absolute z-20 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
                    {modelOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleModelSelect(opt.value)}
                        className={`block w-full px-4 py-3 text-left transition hover:bg-zinc-50 ${
                          apiRoute === opt.value
                            ? "bg-blue-50 text-blue-700"
                            : "text-zinc-700"
                        }`}
                      >
                        <div className="text-sm md:text-base font-semibold">
                          {opt.label}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {opt.description}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
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
        <section className="relative overflow-hidden flex-1 px-0 lg:px-64">
          <div className="h-full bg-white nm-scroll overflow-y-auto">
            <div className="bg-white">
              <div className="relative z-10 flex h-full flex-col px-4 py-4 space-y-4">
                {/* === Default welcome + recommendation menu saat belum ada chat === */}
                {messages.length === 0 && (
                  <div className="mx-auto flex w-full flex-col gap-4 rounded-2xl border border-zinc-100 bg-linear-to-br from-slate-50 via-white to-blue-50 p-4 md:p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex py-2 px-2 h-fit w-fit items-center justify-center rounded-md bg-blue-500/10">
                        <Image
                          src="/assets/LogoNM23_Ai_22.png"
                          alt="NM Ai"
                          width={40}
                          height={40}
                          className="size-10 object-contain"
                        />
                      </div>
                      <div>
                        <p className="text-sm md:text-base font-semibold uppercase tracking-wide text-blue-500">
                          Selamat Datang di NM Ai
                        </p>
                        <p className="text-xs md:text-sm text-zinc-800">
                          Pilih jalur yang paling cocok, atau langsung tulis
                          pertanyaan di bawah.
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Contoh:{" "}
                      <span className="rounded-full bg-linear-to-r from-sky-100 to-sky-200 px-2 py-0.5">
                        “Hitung margin XAUUSD 1 lot leverage 1:100”
                      </span>{" "}
                      atau{" "}
                      <span className="rounded-full bg-linear-to-r from-sky-100 to-sky-200 px-2 py-0.5">
                        “Berita terbaru soal emas hari ini apa?”
                      </span>
                    </p>

                    <div className="relative">
                      <div
                        ref={scrollAreaRef}
                        className="grid grid-cols-1 xl:grid-cols-2 h-70 xl:h-full gap-3 overflow-y-auto p-2 border rounded-xl"
                      >
                        {navigatorMenu.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => sendMessage(item.example)}
                            className="group flex flex-col items-start gap-1 rounded-lg border border-zinc-100 bg-white/80 px-3 py-3 text-left text-xs md:text-sm shadow-sm transition hover:scale-101 hover:border-blue-200 hover:bg-blue-50/80 hover:shadow-md cursor-pointer"
                          >
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className="text-sm font-semibold uppercase tracking-wide text-blue-500">
                                {item.title}
                              </span>
                              <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] text-zinc-100">
                                {item.pill}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-600">
                              {item.description}
                            </p>
                            <p className="mt-1 text-xs text-blue-600 group-hover:text-blue-700">
                              → {item.example}
                            </p>
                          </button>
                        ))}
                      </div>

                      {/* Button Scroll Down Opening Message */}
                      {/* {showScrollDown && (
                        <button
                          type="button"
                          onClick={() => {
                            const el = scrollAreaRef.current;
                            el?.scrollTo({
                              top: el.scrollHeight,
                              behavior: "smooth",
                            });
                            // scroll event akan update showScrollDown jadi false kalau sudah di bawah
                          }}
                          className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xs bg-white/20 text-white shadow text-xs md:text-sm cursor-pointer select-none hover:bg-white/30 transition xl:hidden"
                        >
                          <div className="text-black flex items-center gap-3">
                            <FontAwesomeIcon
                              icon={faAnglesDown}
                              className="text-[10px]"
                            />
                            <span>Scroll Down</span>
                            <FontAwesomeIcon
                              icon={faAnglesDown}
                              className="text-[10px]"
                            />
                          </div>
                        </button>
                      )} */}
                    </div>
                  </div>
                )}

                {/* Chat messages */}
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
                              ? "bg-linear-to-r from-blue-500/90 to-blue-600/90 text-white backdrop-blur rounded-br-none"
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
          </div>
        </section>

        {/* INPUT AREA */}
        <footer className="border-t border-zinc-200 bg-white py-2 mx-0 lg:mx-64">
          <div className="w-full px-3 md:px-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center justify-center gap-2 p-1"
            >
              {/* Attach Button – hanya tampil kalau boleh lampiran */}
              {canAttachFile && (
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all hover:bg-zinc-200 md:h-10 md:w-10">
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}

              {/* Textarea */}
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder}
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
                className="flex h-10 w-10 shrink-0 items-center rounded-full justify-center bg-blue-500 text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-blue-500"
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

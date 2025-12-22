"use client";

import { FC, RefObject, useEffect, useState } from "react";
import Image from "next/image";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClone,
  faRotateRight,
  faArrowUpFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { byPrefixAndName } from "@/utils/fa";
import { createPortal } from "react-dom";
import { UiMessage } from "./types";

interface ChatMessagesProps {
  messages: UiMessage[];
  isTyping: boolean;
  canSpeak: boolean;
  onCopy: (text: string) => void;
  onShare: (message: UiMessage) => void;
  onSpeak: (text: string) => void;
  onStop: () => void;
  isSpeaking: boolean;
  onReinput: () => void;
  canReinput: boolean;
  onInterrupt: () => void;
  canInterrupt: boolean;
  typingMessageId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onRegenerate: () => void;
  canRegenerate: boolean;
  isRegenerating: boolean;
}

export const ChatMessages: FC<ChatMessagesProps> = ({
  messages,
  isTyping,
  canSpeak,
  onCopy,
  onShare,
  onSpeak,
  onStop,
  isSpeaking,
  onReinput,
  canReinput,
  onInterrupt,
  canInterrupt,
  typingMessageId,
  messagesEndRef,
  onRegenerate,
  canRegenerate,
  isRegenerating,
}) => {
  const lastAiMessageId =
    [...messages].reverse().find((msg) => msg.sender === "ai")?.id || null;
  const lastUserMessageId =
    [...messages].reverse().find((msg) => msg.sender === "user")?.id || null;

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  const closePreview = () => setPreviewSrc(null);

  // Lock scroll saat preview terbuka + ESC untuk close
  useEffect(() => {
    if (!previewSrc) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [previewSrc]);

  // Flag client (Next.js SSR safety)
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <>
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
              className={`flex max-w-full flex-col gap-1 ${
                isUser ? "items-end" : "items-start"
              }`}
            >
              <div
                className={[
                  "relative w-full p-4 text-base rounded-lg shadow-md",
                  isUser
                    ? "bg-linear-to-r from-blue-500/70 to-blue-600/70 text-white backdrop-blur"
                    : "text-zinc-900 bg-white",
                ].join(" ")}
              >
                {isAi ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeRaw]}
                    // ✅ allow data:image/*;base64, tapi tetap aman untuk URL lain
                    urlTransform={(url) => {
                      const u = String(url || "").trim();
                      const isSafeDataImage =
                        /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(
                          u
                        );

                      if (isSafeDataImage) return u;
                      return defaultUrlTransform(u);
                    }}
                    components={{
                      // ✅ Markdown image: ![](data:image/png;base64,....)
                      img: ({ src, alt }: any) => {
                        const s = String(src || "").trim();
                        if (!s) return null;

                        return (
                          <button
                            type="button"
                            className="group relative block cursor-pointer my-2"
                            onClick={() => setPreviewSrc(s)}
                            title="Klik untuk preview"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s}
                              alt={alt || "gambar"}
                              className="max-h-80 w-auto max-w-full rounded-lg border border-zinc-200 object-contain transition hover:scale-[1.015] hover:shadow-lg"
                            />
                            <span className="absolute inset-0 rounded-lg bg-black/10 opacity-0 transition group-hover:opacity-100" />
                          </button>
                        );
                      },

                      blockquote: ({ node, ...props }) => (
                        <blockquote
                          {...props}
                          className={[
                            "border-l-4 border-blue-300 px-3 pe-10 py-2 italic text-[0.95rem] text-zinc-700 mt-3 mb-4 bg-zinc-100 rounded",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),

                      p: ({ node, ...props }) => (
                        <p
                          {...props}
                          className={[
                            "leading-relaxed mb-3 last:mb-0",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),

                      h1: ({ node, ...props }) => (
                        <h1
                          {...props}
                          className={[
                            "mt-4 mb-2 text-2xl font-bold text-zinc-900",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2
                          {...props}
                          className={[
                            "mt-4 mb-2 text-xl font-semibold text-zinc-900",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3
                          {...props}
                          className={[
                            "mt-3 mb-2 text-lg font-semibold text-zinc-900",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),

                      strong: ({ node, ...props }) => (
                        <strong
                          {...props}
                          className={["font-bold", props.className || ""].join(
                            " "
                          )}
                        />
                      ),

                      hr: ({ node, ...props }) => (
                        <hr
                          {...props}
                          className={[
                            "my-5 border-0 h-px bg-gray-300",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),

                      ul: ({ node, ...props }) => (
                        <ul
                          {...props}
                          className={[
                            "mb-3 ml-5 list-disc space-y-1",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol
                          {...props}
                          className={[
                            "mb-3 ml-5 list-decimal space-y-1",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      li: ({ node, ...props }) => (
                        <li
                          {...props}
                          className={[
                            "leading-relaxed",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),

                      code: ({
                        node: _node,
                        inline,
                        className,
                        children,
                        ...props
                      }: {
                        node?: any;
                        inline?: boolean;
                        className?: string;
                        children?: any;
                        [key: string]: any;
                      }) => {
                        const codeText = Array.isArray(children)
                          ? children.join("")
                          : String(children ?? "");

                        const isLanguageBlock =
                          typeof className === "string" &&
                          className.includes("language-");

                        const isInline = inline !== false || !isLanguageBlock;

                        if (isInline) {
                          return (
                            <code
                              {...props}
                              className={[
                                "rounded bg-zinc-100 px-1 py-px text-[0.8rem] font-mono",
                                className || "",
                              ].join(" ")}
                            >
                              {children}
                            </code>
                          );
                        }

                        return (
                          <div className="bg-zinc-800 text-white ml-7 rounded-xl overflow-hidden my-3">
                            <div className="flex text-xs py-1 px-3 items-center justify-between bg-zinc-950 font-mono">
                              <span>Code</span>
                              <button
                                type="button"
                                onClick={() => onCopy(codeText)}
                                className="cursor-pointer hover:text-zinc-300 transition-all flex items-center gap-1"
                                aria-label="Salin Kode"
                                title="Salin Kode"
                              >
                                <FontAwesomeIcon
                                  icon={byPrefixAndName.far["clone"]}
                                />
                                <span>Salin Kode</span>
                              </button>
                            </div>
                            <pre className="max-w-full overflow-x-auto text-[0.8rem] font-mono p-3">
                              <code {...props} className={className || ""}>
                                {children}
                              </code>
                            </pre>
                          </div>
                        );
                      },

                      table: ({ node, ...props }) => (
                        <div className="bg-zinc-50 p-2 rounded w-full overflow-x-auto my-3">
                          <table
                            {...props}
                            className={[
                              "w-full border-collapse",
                              (props as any).className || "",
                            ].join(" ")}
                          />
                        </div>
                      ),
                      thead: ({ node, ...props }) => (
                        <thead
                          {...props}
                          className={[
                            "bg-zinc-100",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      tbody: ({ node, ...props }) => (
                        <tbody {...props} className={props.className || ""} />
                      ),
                      tr: ({ node, ...props }) => (
                        <tr
                          {...props}
                          className={[
                            "border-b border-blue-200 last:border-0",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      th: ({ node, ...props }) => (
                        <th
                          {...props}
                          className={[
                            "border border-blue-200 px-2 py-1 text-left font-semibold text-base bg-blue-100",
                            props.className || "",
                          ].join(" ")}
                        />
                      ),
                      td: ({ node, ...props }) => (
                        <td
                          {...props}
                          className={[
                            "border border-blue-200 px-2 py-1 align-top",
                            props.className || "",
                          ].join(" ")}
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

                {/* imagePath (attachment biasa) */}
                {msg.imagePath && (
                  <div className="mt-3">
                    {isAi ? (
                      <button
                        type="button"
                        className="group relative block cursor-pointer"
                        onClick={() => setPreviewSrc(msg.imagePath!)}
                      >
                        <Image
                          src={msg.imagePath}
                          alt="Gambar yang dianalisis"
                          width={240}
                          height={160}
                          className="h-auto w-auto max-w-full rounded-lg border border-zinc-200 object-contain transition hover:scale-[1.015] hover:shadow-lg"
                        />
                        <span className="absolute inset-0 rounded-lg bg-black/10 opacity-0 transition group-hover:opacity-100" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="group relative block cursor-pointer"
                        onClick={() => setPreviewSrc(msg.imagePath!)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.imagePath}
                          alt="Lampiran pengguna"
                          className="h-auto max-h-64 w-auto max-w-full rounded-lg border border-zinc-200 object-contain transition hover:scale-[1.015] hover:shadow-lg"
                        />
                        <span className="absolute inset-0 rounded-lg bg-black/10 opacity-0 transition group-hover:opacity-100" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div
                className={`flex items-center gap-2 text-[10px] opacity-70 select-none mt-1 ${
                  isAi ? "justify-start ms-2" : "justify-end me-2"
                }`}
              >
                {isUser && msg.id === lastUserMessageId && canReinput && (
                  <button
                    type="button"
                    onClick={onReinput}
                    className="text-xs flex items-center justify-center gap-1 cursor-pointer rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 h-6 px-2 transition-all"
                    aria-label="Re-input"
                    title="Kirim ulang pesan ini"
                  >
                    Re-input
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onCopy(msg.text)}
                  className="text-xs flex items-center justify-center gap-1 cursor-pointer rounded bg-zinc-200 hover:bg-zinc-300 text-gray-700 h-6 w-6 transition-all"
                  aria-label="Salin jawaban"
                  title="Salin Jawaban"
                >
                  <FontAwesomeIcon icon={faClone} />
                </button>

                {isAi && canSpeak && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onShare(msg)}
                      className="text-xs flex items-center justify-center gap-1 cursor-pointer rounded bg-zinc-200 hover:bg-zinc-300 text-gray-700 h-6 w-6 transition-all"
                      aria-label="Bagikan"
                      title="Bagikan"
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} />
                    </button>
                  </div>
                )}

                {isAi && msg.id === lastAiMessageId && canRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="rounded bg-amber-100 h-6 w-6 flex items-center gap-1 justify-center text-amber-700 transition hover:bg-amber-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Regenerate"
                    title="Regenerate jawaban terakhir"
                  >
                    <FontAwesomeIcon icon={faRotateRight} />
                  </button>
                )}
              </div>
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

      {/* 🔍 PREVIEW OVERLAY via PORTAL ke document.body */}
      {isClient &&
        previewSrc &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4"
            onClick={closePreview}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative max-h-[90vh] max-w-[95vw]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Preview lampiran"
                className="max-h-[90vh] max-w-[95vw] rounded-xl shadow-2xl object-contain"
              />
              <button
                type="button"
                className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-white text-zinc-700 shadow-md hover:bg-zinc-100"
                onClick={closePreview}
                aria-label="Tutup preview"
              >
                ×
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

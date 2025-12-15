import {
  FC,
  ChangeEvent,
  KeyboardEvent,
  ClipboardEvent,
  RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faPaperclip,
  faStop,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { byPrefixAndName } from "@/utils/fa";

interface ChatInputProps {
  canAttachFile: boolean;
  selectedFile: File | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearFile?: () => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSend: () => void;
  isSendDisabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  syncTextareaHeight: () => void;
  onInterrupt?: () => void;
  canInterrupt?: boolean;
  onPasteFile?: (file: File) => void;
}

export const ChatInput: FC<ChatInputProps> = ({
  canAttachFile,
  selectedFile,
  onFileChange,
  onClearFile,
  inputValue,
  setInputValue,
  onSend,
  isSendDisabled,
  textareaRef,
  syncTextareaHeight,
  onInterrupt,
  canInterrupt = false,
  onPasteFile,
}) => {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeInTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openInfoModal = () => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current);
    }
    setIsModalVisible(true);
    fadeInTimer.current = setTimeout(() => setShowInfoModal(true), 10);
  };

  const closeInfoModal = () => {
    if (fadeInTimer.current) {
      clearTimeout(fadeInTimer.current);
    }
    setShowInfoModal(false);
    fadeOutTimer.current = setTimeout(() => setIsModalVisible(false), 220);
  };

  // Lock scroll body saat modal terbuka
  useEffect(() => {
    if (!isModalVisible) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isModalVisible]);

  // Tutup modal dengan ESC
  useEffect(() => {
    if (!isModalVisible) return;

    const handleKey = (e: KeyboardEvent | KeyboardEventInit | any) => {
      if (e.key === "Escape") {
        closeInfoModal();
      }
    };

    window.addEventListener("keydown", handleKey as any);
    return () => {
      window.removeEventListener("keydown", handleKey as any);
    };
  }, [isModalVisible]);

  // Bersihkan timer saat unmount
  useEffect(() => {
    return () => {
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current);
      if (fadeInTimer.current) clearTimeout(fadeInTimer.current);
    };
  }, []);

  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [selectedFile]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canInterrupt && onInterrupt) {
        onInterrupt();
      } else {
        onSend();
      }
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteFile) return;
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          onPasteFile(file);
        }
        break;
      }
    }
  };

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 pb-3 z-30">
      <div className="mx-auto w-full max-w-5xl px-3 md:px-6">
        {/* Card input chat */}
        <div
          className={`pointer-events-auto rounded-2xl border border-white/70 bg-white/90 shadow-[0_12px_45px_rgba(15,23,42,0.22)] backdrop-blur-lg transition-all ${
            showInfoModal ? "opacity-40 blur-[1px]" : ""
          }`}
          aria-hidden={showInfoModal}
        >
          <div className="px-3 pt-3 md:px-4 md:pt-4">
            {canAttachFile && selectedFile && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-blue-200/80 bg-blue-50/60 p-2.5">
                {previewUrl ? (
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-blue-100 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-500 shadow-sm">
                    <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-blue-700">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-blue-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    onClearFile?.();
                  }}
                  className="flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-600 shadow-sm transition hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50"
                  aria-label="Batalkan lampiran"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canInterrupt && onInterrupt) {
                  onInterrupt();
                } else {
                  onSend();
                }
              }}
              className="flex items-end gap-2 md:gap-3 pb-3 md:pb-4"
            >
              {canAttachFile && (
                <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600 transition-all hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50 md:h-11 md:w-11 shadow-sm mb-1.5">
                  <FontAwesomeIcon icon={faPaperclip} size="sm" />
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={onFileChange}
                  />
                </label>
              )}

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  syncTextareaHeight();
                }}
                onFocus={syncTextareaHeight}
                placeholder="Tanya apapun..."
                className="min-h-14 max-h-52 flex-1 resize-none rounded-xl border border-zinc-200/80 bg-white/70 px-4 py-3 text-base text-gray-900 shadow-inner outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                rows={1}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
              />

              <button
                type="submit"
                disabled={canInterrupt ? false : isSendDisabled}
                title={
                  canInterrupt
                    ? "Hentikan respons"
                    : isSendDisabled
                    ? "Message is empty"
                    : ""
                }
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-all shadow-lg mb-1.5 shadow-blue-500/25 ${
                  canInterrupt
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                } disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-blue-600`}
              >
                <FontAwesomeIcon
                  icon={canInterrupt ? faStop : faArrowUp}
                  size="sm"
                />
              </button>
            </form>
          </div>
          <p className="pb-3 px-10 text-center text-[9px] md:text-xs font-mono text-zinc-400 select-none">
            <em>Newsmaker Ai</em> dapat membuat kesalahan. Periksa info penting{" "}
            <button
              type="button"
              onClick={openInfoModal}
              className="cursor-pointer text-blue-400 hover:text-blue-500 transition-all"
            >
              di sini
            </button>
            .
          </p>
        </div>
      </div>

      {/* MODAL INFO */}
      {isModalVisible && (
        <div
          className={`pointer-events-auto fixed inset-0 z-50 flex items-center justify-center
    bg-black/40 backdrop-blur-sm px-4 py-6 transition-opacity duration-200 ease-out
    ${showInfoModal ? "opacity-100" : "opacity-0"}
  `}
          role="dialog"
          aria-modal="true"
          aria-label="Pernyataan penting Newsmaker Ai"
          onClick={closeInfoModal}
        >
          <div
            className={`
      relative w-full max-w-3xl max-h-[85vh] rounded-2xl bg-white shadow-2xl ring-1 ring-black/5
      transition-all duration-200 ease-out
      ${
        showInfoModal
          ? "opacity-100 scale-100 translate-y-0"
          : "opacity-0 scale-[0.97] translate-y-2"
      }
    `}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-white/90 backdrop-blur-md rounded-t-2xl">
              <h2 className="text-xl font-semibold text-gray-900">
                <FontAwesomeIcon
                  icon={byPrefixAndName.far["triangle-exclamation"]}
                />{" "}
                Pernyataan Penting
              </h2>

              <button
                type="button"
                onClick={closeInfoModal}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-800 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            {/* Body */}
            <div className="relative px-5 py-4 overflow-y-auto text-sm leading-relaxed text-gray-700 space-y-5 max-h-[65vh] nm-scroll">
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  Konten pada platform Newsmaker.id dan sistem NM Ai (Newsmaker
                  Intelligence) bersifat informatif dan edukatif, tidak
                  dimaksudkan sebagai saran resmi atau panduan pengambilan
                  keputusan finansial, investasi, atau perdagangan.
                </li>
                <li>
                  Semua informasi dan analisa yang disajikan berdasarkan data
                  publik, rilis resmi, dan sumber kredibel. Keputusan investasi
                  sepenuhnya menjadi tanggung jawab pengguna.
                </li>
                <li>
                  Pengunjung disarankan untuk melakukan riset mandiri atau
                  konsultasi dengan ahli keuangan profesional sebelum mengambil
                  keputusan finansial.
                </li>
                <li>
                  Kami bukan broker, pialang, marketing, atau pihak yang
                  melakukan transaksi perdagangan dalam bentuk apa pun.
                </li>
              </ul>

              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm">
                <p className="text-lg font-semibold text-blue-900">
                  Pernyataan Tambahan NM Ai
                </p>
                <p className="mt-2 text-sm text-blue-900">
                  NM Ai (Newsmaker Intelligence) adalah sistem editorial digital
                  milik Newsmaker.id yang dikembangkan untuk memberikan analisa
                  pasar, edukasi finansial, dan wawasan perilaku trader secara
                  netral dan bertanggung jawab.
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-blue-900">
                  <li>Menyajikan informasi cepat, akurat, dan bersahabat.</li>
                  <li>Menjaga integritas dan netralitas redaksi.</li>
                  <li>
                    Tidak memberikan sinyal beli/jual atau rekomendasi
                    transaksi.
                  </li>
                  <li>
                    Seluruh keluaran bersifat edukatif dan mengikuti standar
                    jurnalistik Newsmaker.id.
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 bg-white/80 backdrop-blur-sm rounded-b-2xl">
              <p className="text-center text-base font-semibold text-blue-900">
                🧩 "Edukasi finansial untuk semua. Cepat, akurat, dan
                bersahabat."
              </p>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};

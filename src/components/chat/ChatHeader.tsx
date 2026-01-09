import { FC, RefObject } from "react";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrash,
  faAngleLeft,
  faMoon,
  faSun,
} from "@fortawesome/free-solid-svg-icons";
import { ApiRoute } from "./types";
import { byPrefixAndName } from "@/utils/fa";

interface ModelOption {
  value: ApiRoute;
  label: string;
  icon: string;
  description: string;
}

interface ChatHeaderProps {
  apiRoute: ApiRoute;
  setApiRoute: (v: ApiRoute) => void;
  modelOptions: ModelOption[];
  isModelOpen: boolean;
  setIsModelOpen: (open: boolean) => void;
  modelMenuRef: RefObject<HTMLDivElement | null>;
  onDeleteHistoryClick: () => void;
  canDeleteHistory: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const ChatHeader: FC<ChatHeaderProps> = ({
  apiRoute,
  setApiRoute,
  modelOptions,
  isModelOpen,
  setIsModelOpen,
  modelMenuRef,
  onDeleteHistoryClick,
  canDeleteHistory,
  isDark,
  onToggleTheme,
}) => {
  const handleModelSelect = (value: ApiRoute) => {
    setApiRoute(value);
    setIsModelOpen(false);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <div className="mx-auto flex w-full items-center justify-between px-3 py-2 select-none md:px-6 md:py-4">
        <div className="flex items-center gap-4 sm:gap-5">
          <a
            href="https://www.newsmaker.id/"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200/70 bg-white/70 text-gray-600 shadow-sm transition-all hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50 hover:text-gray-800 md:h-10 md:w-10 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:border-blue-400 dark:hover:bg-blue-950/40 dark:hover:text-white"
          >
            <FontAwesomeIcon icon={faAngleLeft} />
          </a>

          <div className="flex flex-col gap-0.5">
            <h1 className="bg-linear-to-r from-blue-700 via-blue-500 to-blue-900 bg-clip-text text-lg md:text-xl font-semibold text-transparent dark:from-blue-300 dark:via-sky-300 dark:to-blue-500">
              Newsmaker Artificial Intelligence
            </h1>

            {/* Engine selector */}
            <div className="relative" ref={modelMenuRef}>
              <button
                type="button"
                onClick={() => setIsModelOpen(!isModelOpen)}
                className="flex items-center justify-between md:min-w-[200px] gap-2 rounded-lg border border-zinc-200 bg-white/80 px-3 py-1 text-xs md:text-sm text-zinc-700 shadow-sm backdrop-blur-sm transition hover:border-zinc-300 hover:bg-white focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900 dark:focus:border-blue-400"
              >
                <span>
                  {modelOptions.find((opt) => opt.value === apiRoute)?.label ||
                    "Pilih model"}
                </span>
                <span
                  className={`text-xs transition-transform ${
                    isModelOpen ? "rotate-180" : "rotate-0"
                  }`}
                  aria-hidden
                >
                  <FontAwesomeIcon icon={byPrefixAndName.fas["angle-down"]} />
                </span>
              </button>

              {isModelOpen && (
                <div className="absolute z-20 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
                  {modelOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleModelSelect(opt.value)}
                      className={`block w-full px-4 py-3 text-left text-xs md:text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 ${
                        apiRoute === opt.value
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      <div className="text-sm md:text-base font-semibold">
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDeleteHistoryClick}
            disabled={!canDeleteHistory}
            className="inline-flex items-center rounded-full border border-red-200 bg-red-50/90 px-2 md:px-3 py-2 md:py-1 text-xs font-medium text-red-600 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/40"
          >
            <span className="hidden md:block">Hapus Riwayat</span>
            <span className="block md:hidden">
              <FontAwesomeIcon icon={faTrash} />
            </span>
          </button>

          {/* Button Dark Mode */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            className={`inline-flex items-center rounded-full border p-2 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
              isDark
                ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                : "border-zinc-200 bg-zinc-50/90 text-zinc-600 hover:bg-zinc-100"
            }`}
            title={isDark ? "Gunakan light mode" : "Gunakan dark mode"}
          >
            <span>
              <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
            </span>
          </button>

          {/* <Image
            className="hidden opacity-80 md:block"
            src="/assets/LogoNM23_Ai_22.png"
            alt="Newsmaker logo"
            width={50}
            height={12}
            priority
          /> */}
        </div>
      </div>
    </header>
  );
};

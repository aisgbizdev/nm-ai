import { FC, RefObject } from "react";
import Image from "next/image";
import { navigatorMenu } from "./types";

interface WelcomeNavigatorProps {
  scrollAreaRef: RefObject<HTMLDivElement>;
  onExampleClick: (example: string) => void;
}

export const WelcomeNavigator: FC<WelcomeNavigatorProps> = ({
  scrollAreaRef,
  onExampleClick,
}) => {
  return (
    <div className="mx-auto flex w-full flex-col gap-4 rounded-2xl border border-zinc-100 bg-linear-to-br from-slate-50 via-white to-blue-50 p-4 md:p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-950 dark:to-blue-950/40">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex py-2 px-2 h-fit w-fit items-center justify-center rounded-md bg-blue-500/10 dark:bg-blue-900/30">
          <Image
            src="/assets/LogoNM23_Ai_22.png"
            alt="NM Ai"
            width={40}
            height={40}
            className="size-10 object-contain"
          />
        </div>
        <div>
          <p className="text-xs sm:text-sm md:text-base font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-300">
            Selamat Datang di NM Ai
          </p>
          <p className="text-xs md:text-sm text-zinc-800 dark:text-zinc-200">
            Pilih jalur yang paling cocok, atau langsung tulis pertanyaan di
            bawah.
          </p>
        </div>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed dark:text-zinc-300">
        Contoh:{" "}
        <span className="rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-950/60 dark:text-blue-200">
          “Hitung margin XAUUSD 1 lot leverage 1:100”
        </span>{" "}
        atau{" "}
        <span className="rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-950/60 dark:text-blue-200">
          “Berita terbaru soal emas hari ini apa?”
        </span>
      </p>

      <div className="relative">
        <div
          ref={scrollAreaRef}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto p-2 border rounded-xl nm-scroll bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60"
        >
          {navigatorMenu.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onExampleClick(item.example)}
              className="group flex flex-col items-start gap-1 rounded-lg border border-zinc-100 bg-white/80 px-3 py-3 text-left text-xs md:text-sm shadow-sm transition hover:scale-[1.01] hover:border-blue-200 hover:bg-blue-50/80 hover:shadow-md cursor-pointer dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/40"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-300">
                  {item.title}
                </span>
                <span className="rounded-full bg-blue-200/50 border border-blue-500 px-2 py-0.5 text-[11px] text-blue-500 dark:border-blue-400/60 dark:bg-blue-950/60 dark:text-blue-200">
                  {item.pill}
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                {item.description}
              </p>
              <p className="mt-1 text-xs text-blue-600 group-hover:text-blue-700 dark:text-blue-300 dark:group-hover:text-blue-200">
                → {item.example}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

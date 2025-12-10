"use client";

export default function LoadingSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-650 p-6">
      <div className="w-full max-w-sm animate-fadeUp">
        <div className="flex flex-col items-center gap-6 rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-sm overflow-hidden px-8 py-10">
          {/* Logo + Text */}
          <div className="flex flex-col items-center gap-6 animate-fadeIn">
            <img
              src="/assets/LogoNM23_Ai_22-putih.png"
              alt="Loading NM"
              className="h-auto w-[40vw] max-w-[220px]"
            />

            <div className="relative h-2 w-80 overflow-hidden bg-white/10 rounded-full">
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/80 to-transparent animate-shimmer"></div>
            </div>

            {/* Shimmer Loading Bar */}
            <p className="text-sm tracking-wide text-slate-100/80">
              Newsmaker Artificial Intelligence
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { FC } from "react";

interface CopyToastProps {
  message: string | null;
  visible: boolean;
}

export const CopyToast: FC<CopyToastProps> = ({ message, visible }) => {
  if (!message) return null;

  return (
    <div className="fixed top-6 right-4 sm:right-6 z-50 max-w-sm">
      <div
        role="alert"
        className="border-s-4 border-blue-700 bg-blue-500/10 backdrop-blur-sm p-4 rounded-lg shadow-lg"
        style={{
          animation: `${
            visible ? "nm-toast-slide-in" : "nm-toast-slide-out"
          } 0.25s ease forwards`,
        }}
      >
        <div className="flex items-center gap-2 text-blue-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
            />
          </svg>
          <strong className="block leading-tight font-medium text-blue-800">
            Info
          </strong>
        </div>
        <p className="mt-1 text-sm text-blue-700">{message}</p>
      </div>
    </div>
  );
};

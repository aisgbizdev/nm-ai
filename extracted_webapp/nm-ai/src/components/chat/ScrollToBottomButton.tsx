import { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesDown } from "@fortawesome/free-solid-svg-icons";

interface ScrollToBottomButtonProps {
  visible: boolean;
  render: boolean;
  onClick: () => void;
}

export const ScrollToBottomButton: FC<ScrollToBottomButtonProps> = ({
  visible,
  render,
  onClick,
}) => {
  if (!render) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-33 md:bottom-35 left-1/2 md:-translate-x-1/2 z-40 text-xs rounded-full bg-blue-300/50 text-black/50 backdrop-blur-sm p-2 shadow-lg transition hover:bg-blue-400/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 border border-blue-500 cursor-pointer animate-bounce"
      style={{
        animation: `${
          visible
            ? "nm-scroll-btn-in 0.25s ease forwards"
            : "nm-scroll-btn-out 0.25s ease forwards"
        }`,
      }}
    >
      <FontAwesomeIcon icon={faAnglesDown} />
    </button>
  );
};

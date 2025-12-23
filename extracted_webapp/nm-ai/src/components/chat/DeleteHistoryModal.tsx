import { FC } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

interface DeleteHistoryModalProps {
  open: boolean;
  render: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteHistoryModal: FC<DeleteHistoryModalProps> = ({
  open,
  render,
  isDeleting,
  onCancel,
  onConfirm,
}) => {
  if (!render) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 select-none"
      style={{
        animation: `${
          open
            ? "nm-modal-backdrop-in 0.25s ease forwards"
            : "nm-modal-backdrop-out 0.25s ease forwards"
        }`,
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        style={{
          animation: `${
            open
              ? "nm-modal-card-in 0.25s ease forwards"
              : "nm-modal-card-out 0.25s ease forwards"
          }`,
        }}
      >
        <div className="flex items-start justify-between px-5 py-4 border-zinc-100">
          <div className="flex flex-col gap-3 w-full">
            <div className="flex justify-between">
              <div className="flex items-center gap-2 text-red-500">
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className="text-xl"
                />
                <p className="text-base font-semibold">Hapus riwayat chat?</p>
              </div>

              <button
                type="button"
                onClick={onCancel}
                className="text-zinc-500 transition hover:text-zinc-700 px-1 py-0.5 rounded bg-zinc-200 hover:bg-zinc-300 cursor-pointer"
                aria-label="Tutup"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <hr />

            <div className="py-3">
              <p className="text-sm text-zinc-600">
                Tindakan ini akan menghapus semua pesan di sesi ini dan tidak
                bisa dibatalkan.
              </p>
            </div>

            <hr />

            <div className="flex w-full flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isDeleting}
                className="w-full rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isDeleting}
                className="w-full rounded-full border border-red-200 bg-red-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
              >
                {isDeleting ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

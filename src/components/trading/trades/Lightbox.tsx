"use client";

import { Modal } from "@/components/ui/Modal";

/** Viewer full-screen per screenshot. */
export function Lightbox({
  open,
  src,
  onClose,
}: {
  open: boolean;
  src: string | null;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Screenshot" width="max-w-3xl">
      {src && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Screenshot" className="max-h-[70vh] w-auto rounded-lg border border-border-strong" />
        </div>
      )}
    </Modal>
  );
}

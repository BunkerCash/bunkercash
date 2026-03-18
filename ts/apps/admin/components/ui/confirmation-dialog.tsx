"use client";

import React, { useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "info";
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
}: ConfirmationDialogProps) {
  const [confirming, setConfirming] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={confirming ? undefined : onClose}
      />
      
      {/* Dialog Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              variant === "danger" ? "bg-red-500/10 text-red-500" : "bg-[#00FFB2]/10 text-[#00FFB2]"
            )}>
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{description}</p>
            </div>
            <button 
              onClick={onClose}
              disabled={confirming}
              className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-3 border-t border-neutral-800 bg-neutral-900/50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={confirming}
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-400 transition-colors hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            onClick={async () => {
              try {
                setConfirming(true);
                await onConfirm();
                onClose();
              } finally {
                setConfirming(false);
              }
            }}
            disabled={confirming}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-95",
              variant === "danger" 
                ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                : "bg-[#00FFB2] text-black shadow-lg shadow-[#00FFB2]/20"
            )}
          >
            {confirming ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

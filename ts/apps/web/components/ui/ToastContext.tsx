"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { CheckCircle, AlertCircle, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastMessage = useRef<string>("");
  const lastTime = useRef<number>(0);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    // Prevent duplicate toasts within 1s
    const now = Date.now();
    if (message === lastMessage.current && now - lastTime.current < 1000) return;
    lastMessage.current = message;
    lastTime.current = now;

    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-[#00FFB2] flex-shrink-0" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />;
    }
  };

  const borderColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-[#00FFB2]/30";
      case "error":
        return "border-red-500/30";
      case "warning":
        return "border-yellow-500/30";
    }
  };

  const bgColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "bg-[#00FFB2]/10";
      case "error":
        return "bg-red-500/10";
      case "warning":
        return "bg-yellow-500/10";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${borderColor(toast.type)} ${bgColor(toast.type)} backdrop-blur-sm px-4 py-3 shadow-lg animate-in slide-in-from-right-5 fade-in duration-300`}
          >
            {icon(toast.type)}
            <p className="text-sm text-neutral-200 flex-1">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-neutral-500 hover:text-neutral-300 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

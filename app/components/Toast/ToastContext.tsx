import React, { createContext, useContext, useState } from "react";

interface ToastProviderProps {
  children: React.ReactNode;
}

export interface ToastProps {
  heading: string;
  content?: React.ReactNode;
  autoExpire?: boolean;
  expireTimeSeconds?: number;
  variant?: "primary" | "secondary" | "danger";
}

export interface ToastPropsWithId extends ToastProps {
  id: string;
  removeToast: (id: string) => void;
}

interface ToastContextValue {
  toasts: ToastPropsWithId[];
  addToast: (props: ToastProps) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastPropsWithId[]>([]);
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const addToast = (toastProps: ToastProps) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, removeToast, ...toastProps }]);
  };
  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { currentMonth } from '../domain/month';
import type { MonthKey, Transaction } from '../domain/types';

export interface ToastMsg {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface AppState {
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  /** İşlem formunu aç (düzenleme için işlem verilir). */
  openTxForm: (tx?: Transaction) => void;
  closeTxForm: () => void;
  txForm: { open: boolean; editing?: Transaction };
  toasts: ToastMsg[];
  toast: (text: string, tone?: ToastMsg['tone']) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children, initialMonth }: { children: ReactNode; initialMonth?: MonthKey }) {
  const [month, setMonth] = useState<MonthKey>(() => initialMonth ?? currentMonth());
  const [txForm, setTxForm] = useState<{ open: boolean; editing?: Transaction }>({ open: false });
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const seq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (text: string, tone: ToastMsg['tone'] = 'ok') => {
      const id = ++seq.current;
      setToasts((l) => [...l.slice(-2), { id, text, tone }]);
      setTimeout(() => dismissToast(id), 3500);
    },
    [dismissToast],
  );

  const value = useMemo<AppState>(
    () => ({
      month,
      setMonth,
      txForm,
      openTxForm: (tx) => setTxForm({ open: true, editing: tx }),
      closeTxForm: () => setTxForm({ open: false }),
      toasts,
      toast,
      dismissToast,
    }),
    [month, txForm, toasts, toast, dismissToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

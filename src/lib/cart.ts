import { useSyncExternalStore } from "react";

export type CartLine = {
  lineId: string;
  itemId: string;
  qty: number;
  addonIds: string[];
  notes: string;
};

const KEY = "xis-do-sul-cart";

let lines: CartLine[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) lines = JSON.parse(raw) as CartLine[];
  } catch {
    lines = [];
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

const EMPTY: CartLine[] = [];

export function useCart() {
  return useSyncExternalStore(
    subscribe,
    () => lines,
    () => EMPTY,
  );
}

export function getLine(lineId: string) {
  hydrate();
  return lines.find((l) => l.lineId === lineId) ?? null;
}

export const cart = {
  add(line: Omit<CartLine, "lineId">) {
    hydrate();
    lines = [...lines, { ...line, lineId: `${line.itemId}-${Date.now()}` }];
    emit();
  },
  update(lineId: string, patch: Partial<Omit<CartLine, "lineId">>) {
    hydrate();
    lines = lines.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l));
    emit();
  },
  changeQty(lineId: string, delta: number) {
    hydrate();
    lines = lines.flatMap((l) => {
      if (l.lineId !== lineId) return [l];
      const qty = l.qty + delta;
      return qty <= 0 ? [] : [{ ...l, qty }];
    });
    emit();
  },
  remove(lineId: string) {
    hydrate();
    lines = lines.filter((l) => l.lineId !== lineId);
    emit();
  },
};

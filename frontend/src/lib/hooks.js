import { useCallback, useEffect, useRef, useState } from 'react';

export function readStorage(key, fallback) {
  try { const stored = JSON.parse(localStorage.getItem(key)); return stored && typeof stored === 'object' ? { ...fallback, ...stored } : fallback; }
  catch { return fallback; }
}
export function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => readStorage(key, fallback));
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }, [key, value]);
  return [value, setValue];
}
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const dismiss = useCallback(id => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(items => items.filter(item => item.id !== id));
  }, []);
  const notify = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts(items => [...items.slice(-2), { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 4500));
  }, [dismiss]);
  useEffect(() => {
    const activeTimers = timers.current;
    return () => { for (const timer of activeTimers.values()) clearTimeout(timer); };
  }, []);
  return { toasts, notify, dismiss };
}

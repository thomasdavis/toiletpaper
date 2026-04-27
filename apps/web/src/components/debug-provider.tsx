"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface DebugContextValue {
  debug: boolean;
  toggleDebug: () => void;
}

const DebugContext = createContext<DebugContextValue>({
  debug: false,
  toggleDebug: () => {},
});

export function useDebug() {
  return useContext(DebugContext);
}

export function DebugProvider({ children }: { children: ReactNode }) {
  const [debug, setDebug] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("toiletpaper-debug");
    if (stored === "true") setDebug(true);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("toiletpaper-debug", String(debug));
    }
  }, [debug, hydrated]);

  const toggleDebug = () => setDebug((prev) => !prev);

  return (
    <DebugContext.Provider value={{ debug, toggleDebug }}>
      {children}
    </DebugContext.Provider>
  );
}

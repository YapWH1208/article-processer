"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  applyLanguageToDocument,
  getLanguageDictionary,
  getShellCopy,
  normalizeLanguage,
  resolveInitialLanguage,
} from "@/lib/languageState.mjs";

export type AppLanguage = "en" | "zh";
export type NavLabelKey = "home" | "library" | "discover" | "upload" | "chat" | "jobs" | "graph" | "dashboard";
export type ShellCopy = {
  appName: string;
  nav: Record<NavLabelKey, string>;
  settings: string;
  openNavigation: string;
  closeMenu: string;
  lightMode: string;
  darkMode: string;
  processing: string;
  toggleToChinese: string;
  toggleToEnglish: string;
};
type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  copy: ShellCopy;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function htmlLanguage(language: AppLanguage) {
  return getLanguageDictionary(language).htmlLang;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE as AppLanguage);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    const normalized = normalizeLanguage(nextLanguage) as AppLanguage;
    setLanguageState(normalized);
    document.documentElement.lang = htmlLanguage(normalized);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  }, []);

  useEffect(() => {
    const initialLanguage = resolveInitialLanguage({
      storedLanguage: localStorage.getItem(LANGUAGE_STORAGE_KEY),
      browserLanguage: navigator.language,
    }) as AppLanguage;
    setLanguageState(initialLanguage);
    document.documentElement.lang = htmlLanguage(initialLanguage);
  }, []);

  useEffect(() => {
    let scheduled = 0;
    const run = () => {
      scheduled = 0;
      applyLanguageToDocument(language);
    };
    const schedule = () => {
      if (!scheduled) scheduled = window.requestAnimationFrame(run);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "placeholder", "title"],
    });
    return () => {
      if (scheduled) window.cancelAnimationFrame(scheduled);
      observer.disconnect();
    };
  }, [language]);

  const copy = useMemo(() => getShellCopy(language) as ShellCopy, [language]);
  const value = useMemo(() => ({ language, setLanguage, copy }), [copy, language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

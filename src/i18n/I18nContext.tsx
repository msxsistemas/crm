import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Language } from './index';
import { translations } from './index';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'pt',
  setLanguage: () => {},
  t: (key) => key,
});

function getStoredLanguage(): Language {
  const stored = localStorage.getItem('app_language');
  if (stored === 'pt' || stored === 'en' || stored === 'es') return stored;
  return 'pt';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return translations[language]?.[key] ?? translations['pt']?.[key] ?? fallback ?? key;
    },
    [language]
  );

  // Sync with server if user is logged in (best-effort)
  useEffect(() => {
    const stored = localStorage.getItem('app_language');
    if (stored) return; // already set locally
  }, []);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export default I18nContext;

import { useI18n } from './I18nContext';
import type { Language } from './index';
import api from '@/lib/api';

const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'pt', label: 'Português (BR)', flag: '🇧🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

interface LanguageSwitcherProps {
  className?: string;
  compact?: boolean;
}

export function LanguageSwitcher({ className = '', compact = false }: LanguageSwitcherProps) {
  const { language, setLanguage } = useI18n();

  const handleChange = async (lang: Language) => {
    setLanguage(lang);
    // Best-effort: save preference to server
    api.patch('/auth/me', { language_preference: lang }).catch(() => {});
  };

  const current = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0];

  return (
    <div className={`relative group inline-block ${className}`}>
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors"
        title="Idioma / Language"
      >
        <span className="text-base leading-none">{current.flag}</span>
        {!compact && <span className="hidden sm:inline text-xs font-medium">{current.label}</span>}
      </button>

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors ${language === lang.code ? 'font-semibold text-primary' : 'text-foreground'}`}
          >
            <span className="text-base">{lang.flag}</span>
            <span>{lang.label}</span>
            {language === lang.code && <span className="ml-auto text-primary">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default LanguageSwitcher;

import { useI18n } from './I18nContext';

/**
 * Hook that returns the translation function t(key).
 * Usage:
 *   const { t } = useTranslation();
 *   t('btn.save') // => 'Salvar' | 'Save' | 'Guardar'
 */
export function useTranslation() {
  const { language, setLanguage, t } = useI18n();
  return { t, language, setLanguage };
}

export default useTranslation;

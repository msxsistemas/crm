/**
 * Formats a phone string with Brazilian mask: (XX) XXXXX-XXXX
 * Keeps only digits, max 11 characters.
 */
export const formatPhoneBR = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/**
 * Strips mask characters, returning only digits.
 */
export const unformatPhone = (value: string): string => value.replace(/\D/g, "");

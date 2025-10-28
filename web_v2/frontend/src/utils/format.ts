/**
 * Utility functions for safe number formatting
 */

/**
 * Safely format a number with toFixed, handling null/undefined values
 * @param value - The number to format (may be null/undefined)
 * @param decimals - Number of decimal places (default: 2)
 * @param fallback - Fallback value if null/undefined (default: 0)
 * @returns Formatted string
 */
export const safeToFixed = (
  value: number | null | undefined,
  decimals: number = 2,
  fallback: number = 0
): string => {
  const num = value ?? fallback;
  return num.toFixed(decimals);
};

/**
 * Safely get a number value, with fallback
 * @param value - The number value (may be null/undefined)
 * @param fallback - Fallback value (default: 0)
 * @returns The number or fallback
 */
export const safeNumber = (
  value: number | null | undefined,
  fallback: number = 0
): number => {
  return value ?? fallback;
};

/**
 * Format price with 2 decimal places
 */
export const formatPrice = (price: number | null | undefined): string => {
  return safeToFixed(price, 2, 0);
};

/**
 * Format percentage with 2 decimal places and % sign
 */
export const formatPercent = (value: number | null | undefined): string => {
  return `${safeToFixed(value, 2, 0)}%`;
};

/**
 * Format percentage with sign prefix (+ or -)
 */
export const formatPercentWithSign = (value: number | null | undefined): string => {
  const num = safeNumber(value, 0);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

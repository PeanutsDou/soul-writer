export type ThemeMode = 'light' | 'dark';

export interface ColorTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgSurface: string;
  bgHover: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  error: string;
  success: string;
  warning: string;
}

export const LIGHT_TOKENS: ColorTokens = {
  bgPrimary: '#fbfbf9',
  bgSecondary: '#f3f3f3',
  bgSurface: '#ebebeb',
  bgHover: '#e0e0e0',
  border: '#d5d5d5',
  textPrimary: '#1a1a1a',
  textSecondary: '#555555',
  textMuted: '#999999',
  accent: '#444444',
  accentDim: '#777777',
  error: '#d9534f',
  success: '#5cb85c',
  warning: '#f0ad4e',
};

export const DARK_TOKENS: ColorTokens = {
  bgPrimary: '#121212',
  bgSecondary: '#1e1e1e',
  bgSurface: '#2a2a2a',
  bgHover: '#363636',
  border: '#3a3a3a',
  textPrimary: '#e8e8e8',
  textSecondary: '#b0b0b0',
  textMuted: '#6a6a6a',
  accent: '#a0a0a0',
  accentDim: '#707070',
  error: '#d88a8a',
  success: '#8ec4aa',
  warning: '#d1b978',
};

export function getTokens(mode: ThemeMode): ColorTokens {
  return mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

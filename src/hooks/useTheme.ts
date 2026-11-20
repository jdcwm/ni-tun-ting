import { useApp } from '../context/AppContext';
import { ThemeConfig } from '../types';

export const useTheme = (): ThemeConfig => {
  const { settings } = useApp();
  return settings.theme;
};

export const useThemedStyles = <T extends Record<string, unknown>>(
  createStyles: (theme: ThemeConfig) => T
): T => {
  const theme = useTheme();
  return createStyles(theme);
};

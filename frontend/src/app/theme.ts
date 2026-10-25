import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

// Значения и роли цветов описаны в DESIGN.md. Шкалы посчитаны из OKLCH, здесь hex для Mantine.

// Акцент: петроль, oklch(0.48 0.095 200) на шаге 7
const petrol: MantineColorsTuple = [
  '#e6fafa',
  '#caf1f2',
  '#a1e2e5',
  '#74cbd0',
  '#44b4ba',
  '#009da3',
  '#00838a',
  '#006d73',
  '#00575c',
  '#004246',
];

// Нейтральные светлой темы, холодный оттенок 255
const gray: MantineColorsTuple = [
  '#f9fafb',
  '#f2f3f5',
  '#e6e8ea',
  '#d8dbde',
  '#c1c4c8',
  '#9ea2a6',
  '#6e7277',
  '#51565c',
  '#363b41',
  '#1e2227',
];

// Поверхности тёмной темы: не чистый чёрный, тот же оттенок 255
const dark: MantineColorsTuple = [
  '#e5e8ec',
  '#babec3',
  '#94999e',
  '#6d7279',
  '#43484e',
  '#2c3136',
  '#1f2329',
  '#161a1f',
  '#101317',
  '#0a0e12',
];

export const theme = createTheme({
  colors: { petrol, gray, dark },
  primaryColor: 'petrol',
  // Шаг 7: белый текст на кнопке 6.1:1, ссылки на белом 6.1:1
  primaryShade: { light: 7, dark: 7 },
  white: '#fdfdfe',
  black: '#1e2227',
  fontFamily:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, monospace',
  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.2' },
      h2: { fontSize: '1.5rem', lineHeight: '1.25' },
      h3: { fontSize: '1.25rem', lineHeight: '1.3' },
      h4: { fontSize: '1rem', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  cursorType: 'pointer',
  components: {
    Card: { defaultProps: { radius: 'lg', withBorder: true, padding: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    // 16px в полях ввода: при меньшем шрифте iOS Safari приближает страницу при фокусе
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    Button: { defaultProps: { size: 'md' } },
  },
});

// Плейсхолдеры и dimmed по умолчанию в Mantine не дотягивают до 4.5:1, поднимаем на шаг
export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-placeholder': t.colors.gray[6],
    '--mantine-color-dimmed': t.colors.gray[6],
    // red.8 даёт 4.5:1 впритык, мелкий текст ошибки берём на шаг темнее: 5.5:1
    '--mantine-color-error': t.colors.red[9],
  },
  dark: {
    '--mantine-color-placeholder': t.colors.dark[2],
    '--mantine-color-dimmed': t.colors.dark[2],
    '--mantine-color-anchor': t.colors.petrol[3],
  },
});

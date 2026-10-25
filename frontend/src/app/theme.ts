import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

// Значения и роли цветов описаны в DESIGN.md. Шкалы посчитаны в OKLCH, здесь hex для Mantine.
// Семантические токены приложения (--app-*) лежат в shared/ui/global.css

// Акцент: лайм. Шаг 4 — заливка кнопок и активных элементов, текст на нём тёмный (11.4:1)
const lime: MantineColorsTuple = [
  '#eff9e4',
  '#ddf5c4',
  '#c4ee99',
  '#ace671',
  '#ace35a',
  '#8bce46',
  '#6aae31',
  '#4d8a1f',
  '#356a11',
  '#234b0d',
];

// Нейтральные светлой темы с лёгким зелёным оттенком
const gray: MantineColorsTuple = [
  '#f7fbf8',
  '#f0f5f1',
  '#e6ebe7',
  '#d7dcd8',
  '#b9c0ba',
  '#949a95',
  '#59605a',
  '#3e443f',
  '#29302a',
  '#161d17',
];

// Тёмная тема: графит, почти нейтральный, с едва заметной зеленцой под лайм.
// Шаг 8 — фон, 7 — карточки, 6 — плитки, 5 — рамки
const dark: MantineColorsTuple = [
  '#eceeed',
  '#c8cbc9',
  '#a5aaa7',
  '#7d827f',
  '#4d5250',
  '#3a3e3c',
  '#303332',
  '#252827',
  '#1b1d1c',
  '#131514',
];

export const theme = createTheme({
  colors: { lime, gray, dark },
  primaryColor: 'lime',
  primaryShade: { light: 4, dark: 4 },
  // Текст на лаймовой кнопке тёмный, на тёмной кнопке светлый: Mantine подбирает сам
  autoContrast: true,
  luminanceThreshold: 0.45,
  white: '#fdfefc',
  black: '#161c18',
  fontFamily:
    '"Manrope Variable", Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, monospace',
  headings: {
    fontFamily: '"Manrope Variable", Manrope, system-ui, sans-serif',
    fontWeight: '750',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.15' },
      h2: { fontSize: '1.375rem', lineHeight: '1.25' },
      h3: { fontSize: '1.125rem', lineHeight: '1.3' },
      h4: { fontSize: '1rem', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  radius: { xs: '6px', sm: '10px', md: '12px', lg: '16px', xl: '999px' },
  cursorType: 'pointer',
  components: {
    // Карточки без рамки: глубину даёт разница между фоном страницы и поверхностью
    Card: { defaultProps: { radius: 'lg', padding: 'lg', withBorder: false } },
    Paper: { defaultProps: { radius: 'lg' } },
    // Кнопки-таблетки, как в референсах
    Button: { defaultProps: { size: 'md', radius: 'xl' } },
    ActionIcon: { defaultProps: { radius: 'xl' } },
    // 16px в полях ввода: при меньшем шрифте iOS Safari приближает страницу при фокусе
    TextInput: { defaultProps: { size: 'md', radius: 'md' } },
    PasswordInput: { defaultProps: { size: 'md', radius: 'md' } },
    NumberInput: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    MultiSelect: { defaultProps: { radius: 'md' } },
    SegmentedControl: { defaultProps: { radius: 'xl' } },
    Modal: { defaultProps: { radius: 'lg' } },
    Menu: { defaultProps: { radius: 'md' } },
  },
});

export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-body': '#eef1ef',
    '--mantine-color-text': t.colors.gray[9],
    '--mantine-color-dimmed': '#58605a',
    '--mantine-color-placeholder': '#58605a',
    '--mantine-color-default-border': '#d8dcd9',
    '--mantine-color-anchor': '#30752a',
    '--mantine-color-error': '#b02a2d',
  },
  dark: {
    '--mantine-color-body': t.colors.dark[8],
    '--mantine-color-text': t.colors.dark[0],
    '--mantine-color-dimmed': t.colors.dark[2],
    '--mantine-color-placeholder': t.colors.dark[2],
    '--mantine-color-default': t.colors.dark[7],
    '--mantine-color-default-hover': t.colors.dark[6],
    '--mantine-color-default-border': t.colors.dark[5],
    '--mantine-color-anchor': t.colors.lime[4],
    '--mantine-color-error': '#f7857d',
  },
});

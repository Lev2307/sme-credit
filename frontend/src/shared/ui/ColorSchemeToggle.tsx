import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

export function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: false });
  const isDark = computed === 'dark';
  const label = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';

  return (
    <ActionIcon
      variant="default"
      size="lg"
      onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
    >
      {isDark ? <IconSun size={20} aria-hidden /> : <IconMoon size={20} aria-hidden />}
    </ActionIcon>
  );
}

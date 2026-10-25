import { Center, Loader } from '@mantine/core';
import classes from './BootScreen.module.css';

// Пока проверяем сессию. Обычно это доли секунды, поэтому индикатор появляется с задержкой
export function BootScreen() {
  return (
    <Center mih="100dvh" aria-busy="true">
      <Loader className={classes.delayed} type="dots" aria-label="Загрузка" />
    </Center>
  );
}

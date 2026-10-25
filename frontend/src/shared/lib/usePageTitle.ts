import { useEffect } from 'react';

const APP_NAME = 'Кредитный кабинет';

// Заголовок вкладки: после перехода в SPA это единственный сигнал, что страница сменилась
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`;
  }, [title]);
}

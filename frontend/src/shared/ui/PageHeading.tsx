import { Title, type TitleProps } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { useNavigationType } from 'react-router';

// Заголовок h1 страницы. После перехода внутри SPA получает фокус, чтобы скринридер
// объявил новую страницу. При первой загрузке и по кнопке «назад» фокус не трогаем
export function PageHeading(props: Omit<TitleProps, 'order'>) {
  const ref = useRef<HTMLHeadingElement>(null);
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== 'POP') ref.current?.focus();
  }, [navigationType]);

  return <Title order={1} ref={ref} tabIndex={-1} {...props} />;
}

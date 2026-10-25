import { Text } from '@mantine/core';
import { Link } from 'react-router';
import classes from './Wordmark.module.css';

type Props = {
  to?: string;
  // На тёмной плашке навигации знак светлый
  inverted?: boolean;
};

export function Wordmark({ to = '/', inverted = false }: Props) {
  return (
    <Text
      component={Link}
      to={to}
      fw={800}
      size="md"
      td="none"
      className={classes.mark}
      data-inverted={inverted || undefined}
    >
      <span className={classes.dot} aria-hidden />
      Кредитный кабинет
    </Text>
  );
}

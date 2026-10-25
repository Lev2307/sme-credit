import { Text } from '@mantine/core';
import { Link } from 'react-router';

type Props = { to?: string };

export function Wordmark({ to = '/' }: Props) {
  return (
    <Text component={Link} to={to} fw={700} size="lg" td="none" c="inherit">
      Кредитный кабинет
    </Text>
  );
}

import { Anchor, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { DEMO_CLIENTS, DEMO_PASSWORD, DEMO_UNDERWRITER, type DemoAccount } from './demoCredentials';
import classes from './DemoAccounts.module.css';

type Props = {
  onPick: (username: string) => void;
  disabled: boolean;
};

function AccountButton({ account, onPick, disabled }: Props & { account: DemoAccount }) {
  return (
    <UnstyledButton
      className={classes.account}
      onClick={() => onPick(account.username)}
      disabled={disabled}
    >
      <span className={classes.accountText}>
        <Text component="span" fw={600} size="sm" display="block">
          {account.username}
        </Text>
        <Text component="span" size="sm" c="dimmed" display="block">
          {account.title}
        </Text>
      </span>
      <Text component="span" size="sm" className={classes.outcome}>
        {account.outcome}
      </Text>
      <IconChevronRight size={16} aria-hidden className={classes.chevron} />
    </UnstyledButton>
  );
}

// Подсказка для проверки: учётки из сида, у каждой свой исход заявки
export function DemoAccounts({ onPick, disabled }: Props) {
  return (
    <Paper component="aside" className={classes.panel} aria-labelledby="demo-title">
      <Stack gap={4} mb="md">
        <Title order={2} size="h4" id="demo-title">
          Тестовые учётки
        </Title>
        <Text size="sm" c="dimmed">
          Нажмите на учётку, чтобы войти. Пароль у всех <code>{DEMO_PASSWORD}</code>
        </Text>
      </Stack>

      <Text size="xs" fw={600} c="dimmed" mb={4} id="demo-clients">
        Клиенты и ожидаемый исход заявки
      </Text>
      <ul className={classes.list} aria-labelledby="demo-clients">
        {DEMO_CLIENTS.map((account) => (
          <li key={account.username}>
            <AccountButton account={account} onPick={onPick} disabled={disabled} />
          </li>
        ))}
      </ul>

      <Text size="xs" fw={600} c="dimmed" mt="md" mb={4} id="demo-bank">
        Банк
      </Text>
      <ul className={classes.list} aria-labelledby="demo-bank">
        <li>
          <AccountButton account={DEMO_UNDERWRITER} onPick={onPick} disabled={disabled} />
        </li>
      </ul>

      <Text size="sm" c="dimmed" mt="md">
        Справочники и параметры модели в{' '}
        <Anchor href="/admin/" target="_blank" rel="noopener">
          админке
        </Anchor>
        , логин admin
      </Text>
    </Paper>
  );
}

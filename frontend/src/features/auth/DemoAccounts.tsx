import { Text, Title, UnstyledButton } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { UserAvatar } from '@/shared/ui/UserAvatar';
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
      <UserAvatar name={account.title} size={40} className={classes.avatar} />
      <span className={classes.accountText}>
        <span className={classes.username}>{account.username}</span>
        <span className={classes.title}>{account.title}</span>
      </span>
      <span className={classes.outcome}>{account.outcome}</span>
      <IconArrowUpRight size={18} aria-hidden className={classes.arrow} />
    </UnstyledButton>
  );
}

// Подсказка для проверки: учётки из сида, у каждой свой исход заявки. Тёмная плашка,
// как контрастный блок в референсе
export function DemoAccounts({ onPick, disabled }: Props) {
  return (
    <aside className={classes.panel} aria-labelledby="demo-title">
      <div className={classes.head}>
        <Title order={2} size="h3" id="demo-title" className={classes.heading}>
          Тестовые учётки
        </Title>
        <Text size="sm" className={classes.note}>
          Нажмите на любую, и мы сразу войдём. Пароль у всех{' '}
          <code className={classes.code}>{DEMO_PASSWORD}</code>
        </Text>
      </div>

      <Text size="xs" fw={700} className={classes.group} id="demo-clients">
        Клиенты и чем закончится их заявка
      </Text>
      <ul className={classes.list} aria-labelledby="demo-clients">
        {DEMO_CLIENTS.map((account) => (
          <li key={account.username}>
            <AccountButton account={account} onPick={onPick} disabled={disabled} />
          </li>
        ))}
      </ul>

      <Text size="xs" fw={700} className={classes.group} id="demo-bank">
        Банк
      </Text>
      <ul className={classes.list} aria-labelledby="demo-bank">
        <li>
          <AccountButton account={DEMO_UNDERWRITER} onPick={onPick} disabled={disabled} />
        </li>
      </ul>

      <Text size="sm" className={classes.note}>
        Справочники и параметры модели в{' '}
        <a href="/admin/" target="_blank" rel="noopener" className={classes.link}>
          админке
        </a>
        , логин admin
      </Text>
    </aside>
  );
}

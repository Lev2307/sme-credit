import { ActionIcon, Text } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import classes from './PageHeader.module.css';
import { PageHeading } from './PageHeading';
import round from './RoundButton.module.css';

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  // Куда ведёт круглая кнопка «назад» слева от заголовка
  back?: { to: string; label: string };
  // Кнопки справа: на телефоне они уходят под заголовок
  actions?: ReactNode;
  // Мелкая строка над заголовком, например приветствие
  eyebrow?: ReactNode;
};

// Шапка страницы: «назад», заголовок h1 с подписью и действия. Одна на все экраны
export function PageHeader({ title, subtitle, back, actions, eyebrow }: Props) {
  return (
    <div className={classes.header}>
      <div className={classes.titleRow}>
        {back && (
          <ActionIcon
            component={Link}
            to={back.to}
            size={44}
            className={round.round}
            aria-label={back.label}
            title={back.label}
          >
            <IconChevronLeft size={22} aria-hidden />
          </ActionIcon>
        )}
        <div className={classes.text}>
          {eyebrow && (
            <Text size="sm" c="dimmed" fw={600} mb={2}>
              {eyebrow}
            </Text>
          )}
          <PageHeading className={classes.title}>{title}</PageHeading>
          {subtitle && (
            <Text c="dimmed" mt={4} className={classes.subtitle}>
              {subtitle}
            </Text>
          )}
        </div>
      </div>
      {actions && <div className={classes.actions}>{actions}</div>}
    </div>
  );
}

import { Text } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './FactList.module.css';

export type Fact = { label: string; value: ReactNode; hint?: ReactNode };

type Props = {
  facts: Fact[];
  // Ширина колонки подписей на планшете и шире
  labelWidth?: 'sm' | 'md';
};

// Список «подпись: значение» на <dl>. На телефоне подпись над значением, шире — слева
export function FactList({ facts, labelWidth = 'md' }: Props) {
  return (
    <dl className={classes.list} data-label={labelWidth}>
      {facts.map((fact) => (
        <div key={fact.label} className={classes.row}>
          <dt>
            <Text size="sm" c="dimmed">
              {fact.label}
            </Text>
          </dt>
          <dd>
            <Text component="div" fw={600}>
              {fact.value}
            </Text>
            {fact.hint && (
              <Text component="div" size="sm" c="dimmed">
                {fact.hint}
              </Text>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

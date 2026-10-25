import { Card, Stack, Table, Text, Title, VisuallyHidden } from '@mantine/core';
import type { Decision } from '@/api/model';
import { formatDateTime, formatMoney } from '@/shared/lib/format';
import { FACTOR_LABEL, HISTORY_VALUE, OUTCOME_LABEL, reasonLabel } from '../copy';
import { factorsOf, limitsOf, reasonsOf } from '../sources';
import classes from './ScoringSection.module.css';

type Props = { decisions: readonly Decision[] };

// Раскладка баллов системного решения: за что сколько, какой класс и что ограничило сумму
export function ScoringSection({ decisions }: Props) {
  const system = decisions.filter((d) => d.decided_by === 'SYSTEM').at(-1);
  const manual = decisions.filter((d) => d.decided_by === 'UNDERWRITER');

  return (
    <Card component="section" aria-labelledby="scoring-title">
      <Title order={2} size="h4" id="scoring-title" mb="md">
        Скоринг и решения
      </Title>

      {!system && <Text c="dimmed">Система ещё не считала эту заявку.</Text>}

      {system && (
        <Stack gap="lg">
          <div className={classes.summary}>
            <div>
              <Text size="sm" c="dimmed">
                Балл
              </Text>
              <Text fw={700} fz="h2">
                {system.score ?? 'нет'}
                <Text span size="sm" c="dimmed" fw={400}>
                  {' '}
                  из 100
                </Text>
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Класс риска
              </Text>
              <Text fw={700} fz="h2">
                {system.risk_class || 'нет'}
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Решение системы
              </Text>
              <Text fw={600}>{OUTCOME_LABEL[system.outcome]}</Text>
              <Text size="xs" c="dimmed">
                {formatDateTime(system.created_at)}
              </Text>
            </div>
          </div>

          {reasonsOf(system).length > 0 && (
            <div>
              <Text size="sm" c="dimmed" mb={4}>
                Причины
              </Text>
              <ul className={classes.reasons}>
                {reasonsOf(system).map((code) => (
                  <li key={code}>
                    <Text size="sm">{reasonLabel(code)}</Text>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {factorsOf(system).length > 0 && (
            <Table verticalSpacing="xs" className={classes.table}>
              <VisuallyHidden component="caption">Баллы по факторам</VisuallyHidden>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">Фактор</Table.Th>
                  <Table.Th scope="col">Значение</Table.Th>
                  <Table.Th scope="col" ta="end">
                    Баллы
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {factorsOf(system).map((factor) => (
                  <Table.Tr key={factor.code}>
                    <Table.Th scope="row" fw={400}>
                      {FACTOR_LABEL[factor.code] ?? factor.code}
                    </Table.Th>
                    <Table.Td>{HISTORY_VALUE[factor.value] ?? factor.value}</Table.Td>
                    <Table.Td ta="end" fw={600} className={classes.points}>
                      {factor.points} из {factor.max_points}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {limitsOf(system).length > 0 && <LimitsList limits={limitsOf(system)} />}
        </Stack>
      )}

      {manual.length > 0 && (
        <Stack gap="sm" mt="lg">
          <Text fw={600}>Решения андеррайтера</Text>
          {manual.map((d) => (
            <div key={d.id} className={classes.manual}>
              <Text size="sm" fw={600}>
                {OUTCOME_LABEL[d.outcome]}
                {d.offer_amount ? `: ${formatMoney(d.offer_amount)}` : ''}
              </Text>
              {d.comment && <Text size="sm">{d.comment}</Text>}
              <Text size="xs" c="dimmed">
                {d.underwriter ?? 'андеррайтер'} · {formatDateTime(d.created_at)}
              </Text>
            </div>
          ))}
        </Stack>
      )}
    </Card>
  );
}

function LimitsList({ limits }: { limits: { code: string; amount: number }[] }) {
  const binding = Math.min(...limits.map((l) => l.amount));
  return (
    <div>
      <Text size="sm" c="dimmed" mb={4}>
        Ограничения суммы. Допустимая сумма: наименьшая из них
      </Text>
      <ul className={classes.limits}>
        {limits.map((limit) => (
          <li key={limit.code}>
            <Text size="sm">{reasonLabel(limit.code)}</Text>
            <Text size="sm" fw={limit.amount === binding ? 700 : 400}>
              {formatMoney(limit.amount)}
              {limit.amount === binding && (
                <Text span size="sm" c="dimmed" fw={400}>
                  {' '}
                  (ограничивает)
                </Text>
              )}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

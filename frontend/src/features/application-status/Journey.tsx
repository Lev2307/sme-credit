import { Stepper } from '@mantine/core';
import type { ApplicationStatusEnum } from '@/api/model';
import { JOURNEY, journeyStep } from './copy';
import classes from './Journey.module.css';

type Props = { status: ApplicationStatusEnum };

// Где заявка на пути от подачи до выдачи. Только показывает, кликать нечего
export function Journey({ status }: Props) {
  const stopped = status === 'REJECTED' || status === 'CANCELLED';
  return (
    <Stepper
      active={journeyStep(status)}
      size="xs"
      color={stopped ? 'gray' : undefined}
      allowNextStepsSelect={false}
      classNames={{ stepBody: classes.stepBody, steps: classes.steps }}
      aria-label="Этапы заявки"
    >
      {JOURNEY.map((label) => (
        <Stepper.Step key={label} label={label} allowStepSelect={false} />
      ))}
    </Stepper>
  );
}

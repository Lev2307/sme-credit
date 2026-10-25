import type { ApplicationStatusEnum } from '@/api/model';
import { JOURNEY, journeyStep } from './copy';
import classes from './JourneyBar.module.css';

type Props = {
  status: ApplicationStatusEnum;
  // На лаймовой карточке-герое полоска белая, на обычной карточке на подложке
  onAccent?: boolean;
};

// Где заявка на пути «подача → выдача»: полоска как прогресс накоплений в референсе.
// Заполнение анимируется через transform, при reduced motion сразу встаёт на место
export function JourneyBar({ status, onAccent = false }: Props) {
  const stopped = status === 'REJECTED' || status === 'CANCELLED';
  const done = Math.min(journeyStep(status), JOURNEY.length);
  const current = JOURNEY[Math.min(done, JOURNEY.length - 1)];
  const label = stopped
    ? 'Заявка закрыта'
    : done >= JOURNEY.length
      ? 'Все этапы пройдены'
      : `Шаг ${done + 1} из ${JOURNEY.length}: ${current.toLowerCase()}`;

  return (
    <div className={classes.box} data-on-accent={onAccent || undefined}>
      <div className={classes.row}>
        <span className={classes.label}>{label}</span>
        <span className={classes.steps} aria-hidden>
          {JOURNEY.join(' · ')}
        </span>
      </div>
      <div
        className={classes.track}
        role="progressbar"
        aria-label="Этапы заявки"
        aria-valuemin={0}
        aria-valuemax={JOURNEY.length}
        aria-valuenow={stopped ? 0 : done}
        aria-valuetext={label}
      >
        <div
          className={classes.fill}
          data-stopped={stopped || undefined}
          style={{ transform: `scaleX(${stopped ? 1 : Math.max(done, 0.35) / JOURNEY.length})` }}
        />
      </div>
    </div>
  );
}

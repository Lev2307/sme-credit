import {
  IconInbox,
  IconLayoutGrid,
  IconPlus,
  IconUserCircle,
  type Icon,
} from '@tabler/icons-react';
import { NavLink } from 'react-router';
import type { RoleEnum } from '@/api/model';
import classes from './AppNav.module.css';
import { Wordmark } from './Wordmark';

type Item = { to: string; label: string; icon: Icon; end?: boolean };

const ITEMS: Record<RoleEnum, Item[]> = {
  CLIENT: [
    { to: '/cabinet', label: 'Заявки', icon: IconLayoutGrid, end: true },
    { to: '/cabinet/products', label: 'Новая', icon: IconPlus },
    { to: '/cabinet/profile', label: 'Профиль', icon: IconUserCircle },
  ],
  UNDERWRITER: [
    { to: '/underwriting', label: 'Очередь', icon: IconInbox, end: true },
    { to: '/underwriting/profile', label: 'Профиль', icon: IconUserCircle },
  ],
};

type Props = { role: RoleEnum; home: string };

// Тёмная «таблетка» навигации. Одна разметка: на телефоне она висит внизу экрана,
// на десктопе стоит слева колонкой. Активный пункт подсвечен лаймом, как в референсе
export function AppNav({ role, home }: Props) {
  return (
    <nav className={classes.nav} aria-label="Основная навигация">
      <div className={classes.brand}>
        <Wordmark to={home} inverted />
      </div>
      <ul className={classes.list}>
        {ITEMS[role].map(({ to, label, icon: ItemIcon, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} className={classes.link}>
              <ItemIcon size={22} stroke={1.8} aria-hidden className={classes.icon} />
              <span className={classes.label}>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

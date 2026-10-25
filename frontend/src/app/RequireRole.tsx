import { Navigate, Outlet, useLocation } from 'react-router';
import type { RoleEnum } from '@/api/model';
import { homePathFor, useSession } from '@/features/auth/session';
import { BootScreen } from '@/shared/ui/BootScreen';
import { SessionErrorScreen } from '@/shared/ui/SessionErrorScreen';

type Props = { allow: RoleEnum };

// Пускает только вошедшего пользователя с нужной ролью. Права всё равно проверяет бэкенд,
// здесь только маршрутизация
export function RequireRole({ allow }: Props) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <BootScreen />;
  if (session.isError) return <SessionErrorScreen onRetry={() => session.refetch()} />;

  const me = session.data;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.role !== allow) return <Navigate to={homePathFor(me)} replace />;

  return <Outlet />;
}

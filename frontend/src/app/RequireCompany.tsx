import { Navigate, Outlet } from 'react-router';
import { useSession } from '@/features/auth/session';

// Без компании заявку не подать: клиента без неё сначала ведём на привязку по ИНН.
// Стоит под RequireRole, поэтому сессия уже загружена
export function RequireCompany() {
  const { data: me } = useSession();
  if (!me?.company) return <Navigate to="/cabinet/company" replace />;
  return <Outlet />;
}

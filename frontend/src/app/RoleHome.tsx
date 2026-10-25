import { Navigate } from 'react-router';
import { homePathFor, useSession } from '@/features/auth/session';
import { BootScreen } from '@/shared/ui/BootScreen';
import { SessionErrorScreen } from '@/shared/ui/SessionErrorScreen';

// Корень сайта: клиента в кабинет, андеррайтера в очередь, остальных на вход
export function RoleHome() {
  const session = useSession();

  if (session.isPending) return <BootScreen />;
  if (session.isError) return <SessionErrorScreen onRetry={() => session.refetch()} />;
  if (!session.data) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(session.data)} replace />;
}

import type { RouteObject } from 'react-router';
import { LoginPage } from '@/features/auth/LoginPage';
import { ClientHomePage } from '@/pages/ClientHomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UnderwritingQueuePage } from '@/pages/UnderwritingQueuePage';
import { AppLayout } from '@/shared/ui/AppLayout';
import { RequireRole } from './RequireRole';
import { RoleHome } from './RoleHome';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RoleHome /> },
  {
    path: '/cabinet',
    element: <RequireRole allow="CLIENT" />,
    children: [
      { element: <AppLayout />, children: [{ index: true, element: <ClientHomePage /> }] },
    ],
  },
  {
    path: '/underwriting',
    element: <RequireRole allow="UNDERWRITER" />,
    children: [
      { element: <AppLayout />, children: [{ index: true, element: <UnderwritingQueuePage /> }] },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

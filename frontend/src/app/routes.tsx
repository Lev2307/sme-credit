import type { RouteObject } from 'react-router';
import { ApplicationsPage } from '@/features/applications/ApplicationsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { CompanyOnboardingPage } from '@/features/company/CompanyOnboardingPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { UnderwritingQueuePage } from '@/pages/UnderwritingQueuePage';
import { AppLayout } from '@/shared/ui/AppLayout';
import { RequireCompany } from './RequireCompany';
import { RequireRole } from './RequireRole';
import { RoleHome } from './RoleHome';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RoleHome /> },
  {
    path: '/cabinet',
    element: <RequireRole allow="CLIENT" />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: 'company', element: <CompanyOnboardingPage /> },
          {
            element: <RequireCompany />,
            children: [
              { index: true, element: <ApplicationsPage /> },
              {
                path: 'products',
                element: (
                  <ComingSoonPage
                    title="Выбор кредита"
                    text="Каталог продуктов появится в следующей части."
                  />
                ),
              },
              {
                path: 'applications/:id',
                element: (
                  <ComingSoonPage
                    title="Заявка"
                    text="Страница заявки со статусом и таймлайном появится в одной из следующих частей."
                  />
                ),
              },
            ],
          },
        ],
      },
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

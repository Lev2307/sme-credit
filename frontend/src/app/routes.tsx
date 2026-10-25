import type { RouteObject } from 'react-router';
import { ApplicationPage } from '@/features/application-form/ApplicationPage';
import { ApplicationsPage } from '@/features/applications/ApplicationsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { CompanyOnboardingPage } from '@/features/company/CompanyOnboardingPage';
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
              { path: 'products', element: <CatalogPage /> },
              { path: 'applications/:id', element: <ApplicationPage /> },
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

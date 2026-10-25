import type { RouteObject } from 'react-router';
import { ApplicationPage } from '@/features/application-form/ApplicationPage';
import { ApplicationsPage } from '@/features/applications/ApplicationsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { CatalogPage } from '@/features/catalog/CatalogPage';
import { CompanyOnboardingPage } from '@/features/company/CompanyOnboardingPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { CardPage } from '@/features/underwriter/CardPage';
import { QueuePage } from '@/features/underwriter/QueuePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
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
          { path: 'profile', element: <ProfilePage /> },
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
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <QueuePage /> },
          { path: 'applications/:id', element: <CardPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

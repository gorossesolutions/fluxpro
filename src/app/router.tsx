import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RequireAuth } from './RequireAuth'
import { MorePage } from './MorePage'
import { ComingSoonPage } from './ComingSoonPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

export const router = createBrowserRouter([
  { path: '/connexion', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'clients', element: <ComingSoonPage title="Clients" /> },
      { path: 'factures', element: <ComingSoonPage title="Factures" /> },
      { path: 'devis', element: <ComingSoonPage title="Devis" /> },
      { path: 'depenses', element: <ComingSoonPage title="Dépenses" /> },
      { path: 'documents', element: <ComingSoonPage title="Documents" /> },
      { path: 'rappels', element: <ComingSoonPage title="Rappels" /> },
      { path: 'fiscalite', element: <ComingSoonPage title="Fiscalité" /> },
      { path: 'parametres', element: <ComingSoonPage title="Paramètres" /> },
      { path: 'plus', element: <MorePage /> },
    ],
  },
])

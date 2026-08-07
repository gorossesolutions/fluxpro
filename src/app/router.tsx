import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RequireAuth } from './RequireAuth'
import { MorePage } from './MorePage'
import { ComingSoonPage } from './ComingSoonPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ClientsListPage } from '@/features/clients/ClientsListPage'
import { ClientDetailPage } from '@/features/clients/ClientDetailPage'
import { InvoicesListPage } from '@/features/invoices/InvoicesListPage'
import { InvoiceEditorPage } from '@/features/invoices/InvoiceEditorPage'
import { InvoiceDetailPage } from '@/features/invoices/InvoiceDetailPage'
import { QuotesListPage } from '@/features/quotes/QuotesListPage'
import { QuoteEditorPage } from '@/features/quotes/QuoteEditorPage'
import { QuoteDetailPage } from '@/features/quotes/QuoteDetailPage'
import { ExpensesListPage } from '@/features/expenses/ExpensesListPage'
import { DocumentsInboxPage } from '@/features/inbox/DocumentsInboxPage'

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
      { path: 'clients', element: <ClientsListPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'factures', element: <InvoicesListPage /> },
      { path: 'factures/nouvelle', element: <InvoiceEditorPage /> },
      { path: 'factures/:id', element: <InvoiceDetailPage /> },
      { path: 'devis', element: <QuotesListPage /> },
      { path: 'devis/nouveau', element: <QuoteEditorPage /> },
      { path: 'devis/:id', element: <QuoteDetailPage /> },
      { path: 'depenses', element: <ExpensesListPage /> },
      { path: 'documents', element: <DocumentsInboxPage /> },
      { path: 'rappels', element: <ComingSoonPage title="Rappels" /> },
      { path: 'fiscalite', element: <ComingSoonPage title="Fiscalité" /> },
      { path: 'parametres', element: <ComingSoonPage title="Paramètres" /> },
      { path: 'plus', element: <MorePage /> },
    ],
  },
])

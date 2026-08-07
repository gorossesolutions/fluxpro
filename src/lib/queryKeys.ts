/** Central query key factory — avoids ad-hoc key arrays drifting apart across features. */
export const queryKeys = {
  clients: {
    all: ['clients'] as const,
    list: (filters?: unknown) => ['clients', 'list', filters ?? {}] as const,
    detail: (id: string) => ['clients', 'detail', id] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filters?: unknown) => ['invoices', 'list', filters ?? {}] as const,
    detail: (id: string) => ['invoices', 'detail', id] as const,
    gaps: () => ['invoices', 'gaps'] as const,
  },
  quotes: {
    all: ['quotes'] as const,
    list: (filters?: unknown) => ['quotes', 'list', filters ?? {}] as const,
    detail: (id: string) => ['quotes', 'detail', id] as const,
  },
  bankAccounts: {
    all: ['bank-accounts'] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    list: (filters?: unknown) => ['expenses', 'list', filters ?? {}] as const,
    detail: (id: string) => ['expenses', 'detail', id] as const,
    occurrences: (id: string) => ['expenses', 'occurrences', id] as const,
  },
  expenseCategories: {
    all: ['expense-categories'] as const,
  },
  documents: {
    all: ['documents'] as const,
    list: (filters?: unknown) => ['documents', 'list', filters ?? {}] as const,
  },
  countryRules: {
    all: ['country-rules'] as const,
  },
  businessIdentity: {
    all: ['business-identity'] as const,
  },
}

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSignature,
  Receipt,
  FolderOpen,
  BellRing,
  Landmark,
  Settings,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in both the bottom tab bar (mobile) and the primary rail/sidebar. */
  primary: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, primary: true },
  { to: '/factures', label: 'Factures', icon: FileText, primary: true },
  { to: '/depenses', label: 'Dépenses', icon: Receipt, primary: true },
  { to: '/documents', label: 'Documents', icon: FolderOpen, primary: true },
  { to: '/clients', label: 'Clients', icon: Users, primary: false },
  { to: '/devis', label: 'Devis', icon: FileSignature, primary: false },
  { to: '/rappels', label: 'Rappels', icon: BellRing, primary: false },
  { to: '/fiscalite', label: 'Fiscalité', icon: Landmark, primary: false },
  { to: '/parametres', label: 'Paramètres', icon: Settings, primary: false },
]

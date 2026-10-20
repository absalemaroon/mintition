import type { LucideIcon } from "lucide-react"
import { LayoutDashboard, WalletCards, Fuel, Sparkles, Receipt, Layers3 } from "lucide-react"

export type ViewId = "dashboard" | "wallets" | "funding" | "mint" | "transactions" | "batches"

export interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  title: string
  subtitle: string
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    title: "Welcome back",
    subtitle: "Manage wallet operations and credential mints from one place.",
  },
  {
    id: "wallets",
    label: "Wallets",
    icon: WalletCards,
    title: "Wallets",
    subtitle: "Generate, monitor and export your minting wallets.",
  },
  {
    id: "funding",
    label: "Auto-Funding",
    icon: Fuel,
    title: "Auto-Funding",
    subtitle: "Fund every wallet in one run with your own private key.",
  },
  {
    id: "mint",
    label: "Minting",
    icon: Sparkles,
    title: "Minting",
    subtitle: "Point at a contract and mint a credential from every wallet.",
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: Receipt,
    title: "Transactions",
    subtitle: "Every mint from this session, with its status.",
  },
  {
    id: "batches",
    label: "Batches",
    icon: Layers3,
    title: "Batches",
    subtitle: "Save generated wallet groups and load them again later.",
  },
]

/** Items shown in the phone bottom bar. The rest stay in the drawer. */
export const BOTTOM_TAB_IDS: ViewId[] = ["wallets", "funding", "mint", "batches"]

export function getNavItem(id: ViewId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}

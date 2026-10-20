"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { BOTTOM_TAB_IDS, NAV_ITEMS, getNavItem, type ViewId } from "@/components/app/nav"
import { ThemeToggle } from "@/components/app/theme-toggle"

export interface ShellBrand {
  name: string
  logoUrl: string | null
}

interface AppShellProps {
  brand: ShellBrand
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  userEmail: string
  onLogout: () => void
  chainSelector: ReactNode
  walletButton: ReactNode
  children: ReactNode
}

function LogoMark({ brand, className }: { brand: ShellBrand; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        brand.name.slice(0, 1).toUpperCase() || "M"
      )}
    </span>
  )
}

interface SidebarBodyProps {
  brand: ShellBrand
  activeView: ViewId
  onNavigate: (view: ViewId) => void
  userEmail: string
  onLogout: () => void
  collapsed?: boolean
  onExpand?: () => void
  /** Shown in the drawer on phones, where the top bar has no room for it. */
  showThemeToggle?: boolean
}

function SidebarBody({ brand, activeView, onNavigate, userEmail, onLogout, collapsed = false, onExpand, showThemeToggle }: SidebarBodyProps) {
  const [query, setQuery] = useState("")
  const items = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))
  const displayName = userEmail ? userEmail.split("@")[0] : "Workspace member"

  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className={cn("flex items-center gap-2.5 px-1.5 pt-1", collapsed && "justify-center px-0")}>
        <LogoMark brand={brand} />
        {!collapsed && <span className="truncate text-base font-semibold tracking-tight">{brand.name}</span>}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Search anything"
          className="mx-auto flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <Search className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/15">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything"
            aria-label="Search anything"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        {!collapsed && <p className="px-2.5 pb-2 text-xs text-muted-foreground">Menu</p>}
        <ul className="space-y-0.5">
          {items.map(({ id, label, icon: Icon }) => {
            const active = id === activeView
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onNavigate(id)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
                    collapsed && "justify-center px-0",
                    active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
                </button>
              </li>
            )
          })}
          {items.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">No matching pages</li>}
        </ul>
      </nav>

      <div className="space-y-2">
        {showThemeToggle && (
          <div className="flex items-center justify-between px-1.5 text-sm text-muted-foreground">
            <span>Theme</span>
            <ThemeToggle />
          </div>
        )}
        <div className={cn("flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5", collapsed && "flex-col p-2")}>
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
            aria-hidden="true"
          >
            {(displayName || "M").slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{userEmail || "Not signed in"}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ brand, activeView, onNavigate, userEmail, onLogout, chainSelector, walletButton, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const current = getNavItem(activeView)

  // New page, back to the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeView])

  // If the window grows past the phone layout while the drawer is open, close it.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setDrawerOpen(false)
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const navigate = (view: ViewId) => {
    onNavigate(view)
    setDrawerOpen(false)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <SidebarBody
          brand={brand}
          activeView={activeView}
          onNavigate={navigate}
          userEmail={userEmail}
          onLogout={onLogout}
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
        />
      </aside>

      {/* Phone drawer */}
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">Move between the pages of your workspace.</Dialog.Description>
            <SidebarBody brand={brand} activeView={activeView} onNavigate={navigate} userEmail={userEmail} onLogout={onLogout} showThemeToggle />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)] sm:px-6 lg:h-16">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none lg:hidden"
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5 text-sm">
              <li className="hidden text-muted-foreground sm:block">Workspace</li>
              <li className="hidden text-muted-foreground sm:block" aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li className="truncate font-medium" aria-current="page">
                {current.label}
              </li>
            </ol>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {chainSelector}
            <ThemeToggle className="hidden sm:inline-flex" />
            {walletButton}
          </div>
        </header>

        {/* Page */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10">{children}</main>
        </div>

        {/* Phone bottom tabs */}
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="grid grid-cols-4">
            {BOTTOM_TAB_IDS.map((id) => {
              const item = getNavItem(id)
              const active = id === activeView
              const Icon = item.icon
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => navigate(id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 py-2.5 text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:ring-inset",
                      active ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {id === "funding" ? "Funding" : item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}

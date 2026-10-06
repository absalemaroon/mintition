"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Menu, X, Wallet, Zap, Coins, Layers, LogOut } from "lucide-react"

export type NavSection = "wallets" | "funding" | "mint" | "batches"

interface PaperNavProps {
  activeSection: NavSection
  onSectionChange: (section: NavSection) => void
  connectedAddress: string
  onConnectWallet: () => void
  onLogout: () => void
  userEmail: string
}

const navItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
  { id: "wallets", label: "Wallets", icon: <Wallet className="w-4 h-4" /> },
  { id: "funding", label: "Auto-Funding", icon: <Zap className="w-4 h-4" /> },
  { id: "mint", label: "Minting", icon: <Coins className="w-4 h-4" /> },
  { id: "batches", label: "Batches", icon: <Layers className="w-4 h-4" /> },
]

export function PaperNav({
  activeSection,
  onSectionChange,
  connectedAddress,
  onConnectWallet,
  onLogout,
  userEmail,
}: PaperNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on section change
  useEffect(() => {
    setMobileOpen(false)
  }, [activeSection])

  const handleNavClick = (section: NavSection) => {
    onSectionChange(section)
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-sm">
              <span className="text-primary-foreground font-bold text-sm">M</span>
            </div>
            <span className="ink-heading text-lg">Mintition</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 hover:bg-secondary rounded-md transition"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-foreground/20 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar navigation — persistent on desktop, slide-in on mobile */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 lg:z-auto",
          "w-64 h-screen bg-sidebar border-r border-sidebar-border",
          "flex flex-col transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo / brand */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <div className="w-9 h-9 bg-primary flex items-center justify-center rounded-sm shrink-0">
            <span className="text-primary-foreground font-bold text-base">M</span>
          </div>
          <div className="min-w-0">
            <h1 className="ink-heading text-lg leading-tight truncate">Mintition</h1>
            <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Celo NFT Minting</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
                activeSection === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-secondary hover:text-foreground",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Wallet status & actions */}
        <div className="p-3 border-t border-sidebar-border space-y-3">
          {/* User email */}
          {userEmail && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
              {userEmail}
            </div>
          )}

          {/* Connected address */}
          {connectedAddress ? (
            <div className="px-3 py-2 bg-secondary/50 rounded-md border border-border/50">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Connected</p>
              <p className="text-xs font-mono truncate">
                {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
              </p>
            </div>
          ) : (
            <Button
              onClick={onConnectWallet}
              className="w-full ink-btn-terracotta"
              size="sm"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </Button>
          )}

          {/* Logout */}
          <Button
            onClick={onLogout}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>
    </>
  )
}

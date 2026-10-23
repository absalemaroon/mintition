"use client"

import { useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { Check, ChevronDown, Search, X } from "lucide-react"
import type { ChainConfig } from "@/lib/chains"
import { ChainLogo } from "@/components/app/chain-logo"
import { cn } from "@/lib/utils"

interface ChainPickerProps {
  chains: ChainConfig[]
  value: string
  onChange: (chainId: string) => void
}

/** Network picker: shows the active chain's logo, opens a searchable list of every chain. */
export function ChainPicker({ chains, value, onChange }: ChainPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const active = chains.find((chain) => chain.id === value) ?? chains[0]

  const { live, soon } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = chains.filter(
      (chain) =>
        !q ||
        chain.name.toLowerCase().includes(q) ||
        chain.nativeSymbol.toLowerCase().includes(q) ||
        chain.id.includes(q),
    )
    return {
      live: matches.filter((chain) => chain.status === "live"),
      soon: matches.filter((chain) => chain.status === "soon"),
    }
  }, [chains, query])

  const select = (chain: ChainConfig) => {
    if (chain.status !== "live") return
    onChange(chain.id)
    setOpen(false)
  }

  const row = (chain: ChainConfig) => {
    const disabled = chain.status !== "live"
    return (
      <li key={chain.id}>
        <button
          type="button"
          onClick={() => select(chain)}
          disabled={disabled}
          aria-current={chain.id === value ? "true" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
            disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted",
          )}
        >
          <ChainLogo chain={chain} size={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{chain.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {chain.nativeSymbol} · chain {chain.chainId}
            </span>
          </span>
          {disabled ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Soon</span>
          ) : (
            chain.id === value && <Check className="size-4" aria-hidden="true" />
          )}
        </button>
      </li>
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`Network: ${active.name}. Change network`}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"
        >
          <ChainLogo chain={active} size={20} />
          <span className="max-w-[72px] truncate sm:max-w-none">{active.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <Dialog.Title className="text-base font-semibold tracking-tight">Select network</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Choose the network to use. Networks marked Soon are not available yet.</Dialog.Description>

          <label className="mx-2 mb-2 flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-muted-foreground focus-within:bg-card focus-within:ring-[3px] focus-within:ring-ring/15">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, symbol or chain id"
              aria-label="Search networks"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            {live.length > 0 && (
              <section aria-label="Available networks">
                <p className="px-2.5 pt-1 pb-1 text-xs text-muted-foreground">Available</p>
                <ul>{live.map(row)}</ul>
              </section>
            )}
            {soon.length > 0 && (
              <section aria-label="Coming soon">
                <p className="px-2.5 pt-3 pb-1 text-xs text-muted-foreground">Coming soon ({soon.length})</p>
                <ul>{soon.map(row)}</ul>
              </section>
            )}
            {live.length === 0 && soon.length === 0 && (
              <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">No network matches "{query}"</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown } from "lucide-react"
import type { ChainConfig } from "@/lib/chains"
import { cn } from "@/lib/utils"

interface ChainSelectorProps {
  chains: ChainConfig[]
  value: string
  onChange: (chainId: string) => void
}

/** Network picker for the top bar. Chains marked "soon" are listed but cannot be chosen yet. */
export function ChainSelector({ chains, value, onChange }: ChainSelectorProps) {
  const active = chains.find((chain) => chain.id === value) ?? chains[0]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Network: ${active.name}`}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none data-[state=open]:bg-muted"
        >
          <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: active.color }} aria-hidden="true" />
          <span className="max-w-[72px] truncate sm:max-w-none">{active.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-60 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs text-muted-foreground">Network</DropdownMenu.Label>
          {chains.map((chain) => {
            const soon = chain.status === "soon"
            return (
              <DropdownMenu.Item
                key={chain.id}
                disabled={soon}
                onSelect={() => onChange(chain.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
                  "data-[highlighted]:bg-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: chain.color }} aria-hidden="true" />
                <span className="flex-1 truncate">{chain.name}</span>
                {soon ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Soon</span>
                ) : (
                  chain.id === value && <Check className="size-4" aria-hidden="true" />
                )}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

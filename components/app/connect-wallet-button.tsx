import { Button } from "@/components/ui/button"
import { shortAddress } from "@/lib/chains"

interface ConnectWalletButtonProps {
  connectedAddress: string
  onConnect: () => void
}

export function ConnectWalletButton({ connectedAddress, onConnect }: ConnectWalletButtonProps) {
  if (connectedAddress) {
    return (
      <span
        role="status"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 font-mono text-xs"
        title={connectedAddress}
      >
        <span className="size-2 rounded-full bg-success" aria-hidden="true" />
        <span className="sr-only">Wallet connected: </span>
        {shortAddress(connectedAddress)}
      </span>
    )
  }

  return (
    <Button size="sm" onClick={onConnect} aria-label="Connect Wallet">
      <span className="sm:hidden">Connect</span>
      <span className="hidden sm:inline">Connect Wallet</span>
    </Button>
  )
}

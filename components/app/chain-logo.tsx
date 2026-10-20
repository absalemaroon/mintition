"use client"

import { useState } from "react"
import type { ChainConfig } from "@/lib/chains"
import { cn } from "@/lib/utils"

interface ChainLogoProps {
  chain: ChainConfig
  /** Pixel size of the circle. */
  size?: number
  className?: string
}

/**
 * The chain's logo (from /public/chains, see scripts/fetch-chain-logos.mjs).
 * If the file is missing or fails to load, a monogram in the chain colour is shown instead.
 */
export function ChainLogo({ chain, size = 20, className }: ChainLogoProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(chain.logo) && !failed
  const initials = chain.name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10", className)}
      style={{ width: size, height: size, backgroundColor: showImage ? "transparent" : chain.color }}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chain.logo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span className="font-semibold text-white mix-blend-normal" style={{ fontSize: Math.max(8, Math.round(size * 0.42)), textShadow: "0 0 2px rgba(0,0,0,0.45)" }}>
          {initials}
        </span>
      )}
    </span>
  )
}

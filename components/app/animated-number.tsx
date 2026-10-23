"use client"

import { useEffect, useRef, useState } from "react"

interface AnimatedNumberProps {
  value: number
  /** Digits after the decimal point. */
  decimals?: number
  prefix?: string
  suffix?: string
  durationMs?: number
  className?: string
}

/** Counts smoothly from the previous value to the new one. Respects reduced-motion. */
export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", durationMs = 700, className }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || begin === value) {
      setShown(value)
      from.current = value
      return
    }
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = begin + (value - begin) * eased
      setShown(current)
      from.current = current
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return (
    <span className={className}>
      {prefix}
      {shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}

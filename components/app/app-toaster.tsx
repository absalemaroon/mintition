"use client"

import { Toaster } from "sonner"
import { useTheme } from "next-themes"

/** Sonner toaster that follows the app theme (light / dark). */
export function AppToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="top-right"
      richColors
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  )
}

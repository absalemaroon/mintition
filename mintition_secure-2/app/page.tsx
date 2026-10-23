import { redirect } from "next/navigation"

export default function Home() {
  // Redirect to dashboard - middleware will catch unauthenticated users
  redirect("/dashboard")
}

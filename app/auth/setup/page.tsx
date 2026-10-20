import { notFound } from "next/navigation"
import { needsSetup } from "@/lib/server/owner"
import { SetupForm } from "./setup-form"

export const dynamic = "force-dynamic"
export const metadata = { robots: { index: false, follow: false } }

export default async function SetupPage() {
  // Only exists on a brand-new project. Once the owner exists this is a plain 404.
  if (!(await needsSetup())) notFound()
  return <SetupForm />
}

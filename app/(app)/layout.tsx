import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { createCookieClient } from "@/lib/supabase/server";

// Every page in this group requires a signed-in user (proxy.ts redirects too;
// this is the authoritative check).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createCookieClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return <AppShell email={data.user.email ?? ""}>{children}</AppShell>;
}

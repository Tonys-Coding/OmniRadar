import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { SIDEBAR_COOKIE } from "@/components/shell/nav";
import { profileOf } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { createCookieClient } from "@/lib/supabase/server";

// Every page in this group requires a signed-in user (proxy.ts redirects too;
// this is the authoritative check). Settings and the sidebar state are read
// here so the first paint already reflects them.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createCookieClient();
  const { data } = await supabase.auth.getUser();
  // Stale or revoked session: clear cookies first so proxy.ts agrees (no redirect loop).
  if (!data.user) redirect("/api/auth/expired");

  const cookieStore = await cookies();
  const initial = { profile: profileOf(data.user), settings: parseSettings(data.user.user_metadata?.settings) };
  return (
    <AppShell initial={initial} sidebarExpanded={cookieStore.get(SIDEBAR_COOKIE)?.value === "expanded"}>
      {children}
    </AppShell>
  );
}

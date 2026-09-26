"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LinkLauncher, loadPending } from "@/components/PlaidConnect";
import { Spinner } from "@/components/ui";

/**
 * Landing page for banks that log you in on their own site (OAuth).
 * Only used when PLAID_REDIRECT_URI points here; resumes Plaid Link.
 */
export default function OAuthReturnPage() {
  const router = useRouter();
  const [resume, setResume] = useState<{ token: string; itemId?: string; uri: string } | null>(null);
  const [status, setStatus] = useState("Finishing up with your bank…");

  // Browser-only state (sessionStorage, current URL), so read it after mount.
  useEffect(() => {
    const pending = loadPending();
    if (!pending) router.replace("/accounts");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only state
    else setResume({ ...pending, uri: window.location.href });
  }, [router]);

  return (
    <div className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-7" />
        <p role="status" className="text-muted">
          {status}
        </p>
      </div>
      {resume ? (
        <LinkLauncher
          token={resume.token}
          itemId={resume.itemId}
          receivedRedirectUri={resume.uri}
          onStatus={setStatus}
          onDone={() => router.replace("/accounts")}
        />
      ) : null}
    </div>
  );
}

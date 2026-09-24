import "server-only";
import type { User } from "@supabase/supabase-js";
import { errorResponse, HttpError } from "@/lib/http";
import { parseSettings, type Profile, type Settings } from "@/lib/settings";
import { createCookieClient, createTokenClient, type UserClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  email: string | undefined;
  /** Acts as the user; row level security applies. */
  supabase: UserClient;
  user: User;
  /** Preferences from user metadata, with defaults filled in. */
  settings: Settings;
};

export function profileOf(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as { display_name?: unknown };
  return {
    id: user.id,
    email: user.email ?? "",
    display_name: typeof meta.display_name === "string" ? meta.display_name : "",
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
  };
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

/**
 * Resolve the signed-in user from either an `Authorization: Bearer <token>`
 * header or the Supabase session cookies. The token is verified with
 * Supabase Auth (getUser), never just decoded.
 */
export async function getAuth(request: Request): Promise<AuthContext | null> {
  const token = bearerToken(request);
  const supabase = token ? createTokenClient(token) : await createCookieClient();
  const { data, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    email: data.user.email,
    supabase,
    user: data.user,
    settings: parseSettings(data.user.user_metadata?.settings),
  };
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wrap a route handler so it requires a signed-in user and returns JSON errors.
 *
 *   export const GET = withAuth(async (request, auth) => json(...));
 */
export function withAuth<P = Record<string, never>>(
  handler: (request: Request, auth: AuthContext, context: RouteContext<P>) => Promise<Response>,
) {
  return async (request: Request, context: RouteContext<P>) => {
    try {
      const auth = await getAuth(request);
      if (!auth) throw new HttpError(401, "Not signed in");
      return await handler(request, auth, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { EnvError } from "@/lib/env";
import { plaidError } from "@/lib/plaid";

/** An error whose message is safe to show the caller. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

/** Convert any thrown error into a JSON response without leaking internals. */
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return json({ error: "Invalid request", details: z.flattenError(error) }, { status: 400 });
  }
  const plaid = plaidError(error);
  if (plaid) {
    console.error("[api] plaid error:", plaid);
    return json(
      { error: plaid.display_message ?? plaid.error_message ?? "Bank data provider error", plaid_error_code: plaid.error_code },
      { status: 502 },
    );
  }
  if (error instanceof EnvError) {
    console.error(error.message);
    return json(
      { error: "Server is not configured. Run `npm run verify` for details." },
      { status: 500 },
    );
  }
  console.error("[api] unhandled error:", error);
  return json({ error: "Internal server error" }, { status: 500 });
}

/** Parse a JSON body against a schema (empty body is treated as {}). */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await request.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Body must be valid JSON");
    }
  }
  return schema.parse(body);
}

/** Parse URL search params against a schema. */
export function readQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params);
}

import { getUsession } from "./auth";

export type SdGraphQlResponse<T = unknown> = {
  data?: T;
  errors?: Array<{ message: string; path?: (string | number)[]; extensions?: Record<string, unknown> }>;
};

export class SocialdataApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "SocialdataApiError";
  }
}

export async function sdQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  opts?: { usession?: string },
): Promise<SdGraphQlResponse<T>> {
  const base = (process.env.SOCIALDATA_BASE_URL || "https://socialdata.garena.vn").replace(/\/$/, "");
  const usession = opts?.usession ?? (await getUsession());

  const res = await fetch(`${base}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `usession=${usession}`,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  const text = await res.text();
  let body: SdGraphQlResponse<T>;
  try {
    body = JSON.parse(text) as SdGraphQlResponse<T>;
  } catch {
    throw new SocialdataApiError(`Non-JSON response (HTTP ${res.status})`, res.status, text.slice(0, 500));
  }

  if (!res.ok) {
    throw new SocialdataApiError(`GraphQL HTTP ${res.status}`, res.status, body);
  }

  if (body.errors?.length) {
    const msg = body.errors.map((e) => e.message).join("; ");
    throw new SocialdataApiError(msg, res.status, body);
  }

  return body;
}

/** Run a query without throwing on GraphQL field errors (for probing). */
export async function sdQueryProbe<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<SdGraphQlResponse<T>> {
  const base = (process.env.SOCIALDATA_BASE_URL || "https://socialdata.garena.vn").replace(/\/$/, "");
  const usession = await getUsession();
  const res = await fetch(`${base}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `usession=${usession}`,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as SdGraphQlResponse<T>;
  } catch {
    return { errors: [{ message: `HTTP ${res.status}: ${text.slice(0, 300)}` }] };
  }
}

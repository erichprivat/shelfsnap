export type Sleep = (ms: number) => Promise<void>;

export const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type JsonClientOptions = {
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Wait before each retry; its length is the number of retries. */
  backoffMs?: number[];
  sleep?: Sleep;
};

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const retryable = (status: number) => status === 429 || status >= 500;

/**
 * GETs JSON, retrying network errors, timeouts, 429 and 5xx with backoff.
 * A 404 is an answer (null), not a failure; other 4xx responses throw at once.
 */
export function jsonClient(label: string, opts: JsonClientOptions = {}) {
  const { fetchImpl = fetch, headers = {}, timeoutMs = 8000, backoffMs = [500, 1500], sleep: wait = sleep } = opts;
  return async function getJson<T>(url: string): Promise<T | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(`${label} responded ${res.status}`, res.status);
        return (await res.json()) as T;
      } catch (e) {
        const again = !(e instanceof HttpError) || retryable(e.status);
        if (!again || attempt >= backoffMs.length) throw e;
        await wait(backoffMs[attempt]!);
      }
    }
  };
}

import { Base44PlatformError } from "./errors.js";
import type { RequestOptions } from "./types.js";
import { positive } from "./validation.js";

export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new Base44PlatformError("aborted", "The request was cancelled.");
}
export async function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal);
  if (!signal) return promise;
  let abort: () => void = () => {};
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      abort = () => reject(new Base44PlatformError("aborted", "The request was cancelled."));
      signal.addEventListener("abort", abort, { once: true });
    })]);
  } finally { signal.removeEventListener("abort", abort); }
}

export class Transport {
  constructor(private url: string, private fetcher: typeof fetch, private timeoutMs: number) {}

  async request(path: string, method: string, headers: Record<string, string>, body?: unknown, options: RequestOptions = {}): Promise<unknown> {
    checkAbort(options.signal);
    const timeoutMs = positive(options.timeoutMs ?? this.timeoutMs);
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await this.fetcher(`${this.url}${path}`, {
        method, headers, signal: controller.signal, redirect: "error", cache: "no-store",
        body: body === undefined ? undefined : body instanceof URLSearchParams ? body : JSON.stringify(body),
      });
      if (!response.ok) throw new Base44PlatformError("http_error", `Platform request failed (HTTP ${response.status}).`, response.status);
      const text = await response.text();
      if (!text.trim()) return undefined;
      try { return JSON.parse(text); }
      catch { throw new Base44PlatformError("invalid_response", "The platform returned invalid JSON."); }
    } catch (error) {
      if (error instanceof Base44PlatformError) throw error;
      if (options.signal?.aborted) throw new Base44PlatformError("aborted", "The request was cancelled.");
      if (controller.signal.aborted) throw new Base44PlatformError("timeout", "The request timed out; the server operation may still have completed.");
      throw new Base44PlatformError("network_error", "The platform request could not be completed.");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

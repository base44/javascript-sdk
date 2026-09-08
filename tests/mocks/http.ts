import { expect } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "./server";

type HeaderExpectation =
  string | RegExp | ((value: string | undefined) => boolean);
interface HttpExpectation {
  method: "get" | "post" | "put" | "patch" | "delete";
  url: string;
  body?: any;
  inspect?: (request: Request) => void | Promise<void>;
  query?:
    | true
    | Record<string, unknown>
    | ((query: Record<string, string>) => boolean);
  headers?: [string, HeaderExpectation][];
  reqheaders?: Record<string, HeaderExpectation>;
  badheaders?: string[];
  times?: number;
  delayMs?: number;
  networkError?: boolean;
  status?: number;
  response?: any;
  responseHeaders?: Record<string, string>;
  respond?: (request: Request) => [number, any];
}
interface Capture {
  request: Request;
  body: unknown;
}
const expectations: {
  expected: HttpExpectation;
  requests: Capture[];
  failures: unknown[];
}[] = [];

/** A native MSW handler with after-test request contract verification.
 * Resolver assertions cannot fail a test reliably: MSW translates exceptions
 * into HTTP 500 responses. Capturing them separately also covers error paths.
 * Repeated registrations for one route form a response sequence, in order.
 */
export function mockHttp(expected: HttpExpectation) {
  expectations.push({ expected, requests: [], failures: [] });
  // Use an exact regex: operation IDs may contain MSW path-pattern metacharacters.
  const url = new RegExp(
    "^" + expected.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\?.*)?$",
  );
  server.use(
    http[expected.method](url, async ({ request }) => {
      const sameRoute = expectations.filter(
        (item) =>
          item.expected.method === expected.method &&
          item.expected.url === expected.url,
      );
      const item =
        sameRoute.find(
          (item) => item.requests.length < (item.expected.times ?? 1),
        ) ?? sameRoute.at(-1)!;
      const rule = item.expected;
      const text = request.body ? await request.clone().text() : "";
      let body: unknown = text;
      if (
        text &&
        request.headers.get("content-type")?.includes("application/json")
      )
        body = JSON.parse(text);
      item.requests.push({ request, body });
      if (typeof rule.body === "function") {
        try {
          expect(rule.body(body)).toBe(true);
        } catch (error) {
          item.failures.push(error);
        }
      }
      if (rule.inspect) {
        try {
          await rule.inspect(request.clone());
        } catch (error) {
          item.failures.push(error);
        }
      }
      if (rule.delayMs) await delay(rule.delayMs);
      if (rule.networkError) return HttpResponse.error();
      const [status, response] = rule.respond?.(request) ?? [
        rule.status ?? 200,
        rule.response,
      ];
      const init = { status, headers: rule.responseHeaders };
      return typeof response === "string"
        ? new HttpResponse(response, init)
        : HttpResponse.json(response, init);
    }),
  );
}

export function verifyHttpExpectations() {
  const pending = expectations.splice(0);
  for (const { expected, requests, failures } of pending) {
    if (failures.length) throw failures[0];
    expect(
      requests,
      `${expected.method.toUpperCase()} ${expected.url} request count`,
    ).toHaveLength(expected.times ?? 1);
    for (const { request, body } of requests) {
      if ("body" in expected && typeof expected.body !== "function")
        expect(body).toEqual(expected.body);
      if (expected.query && expected.query !== true) {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        if (typeof expected.query === "function")
          expect(expected.query(query)).toBe(true);
        else expect(query).toEqual(expected.query);
      }
      for (const [name, value] of [
        ...Object.entries(expected.reqheaders ?? {}),
        ...(expected.headers ?? []),
      ]) {
        const actual = request.headers.get(name) ?? undefined;
        if (typeof value === "function") expect(value(actual)).toBe(true);
        else if (value instanceof RegExp) expect(actual).toMatch(value);
        else expect(actual, `header ${name}`).toBe(value);
      }
      for (const name of expected.badheaders ?? [])
        expect(request.headers.has(name), `absent header ${name}`).toBe(false);
    }
  }
}

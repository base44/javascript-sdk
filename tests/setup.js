import { beforeAll, beforeEach, afterAll, afterEach, expect } from "vitest";
import { server } from "./mocks/server.ts";
import { platform } from "./mocks/platform/index.ts";

const unexpected = [];
beforeAll(() => {
  server.listen({
    onUnhandledRequest(request, print) {
      unexpected.push(`${request.method} ${request.url}`);
      print.error();
      // A custom callback otherwise defaults to passthrough after printing.
      // Throwing makes MSW synthesize an intercepted 500 instead of touching
      // the network; teardown still fails even when the SDK swallows it.
      throw new Error(`Unhandled HTTP request: ${request.method} ${request.url}`);
    },
  });
});
beforeEach(() => platform.reset());
afterEach(() => {
  const failures = [];
  try {
    // A method swallowing network errors must still fail on unexpected traffic.
    try {
      expect(unexpected.splice(0), "Unhandled HTTP requests").toEqual([]);
      expect(
        platform.requests.all("platform.unconfigured"),
        "Requests not modeled by the mock platform",
      ).toEqual([]);
    } catch (error) {
      failures.push(error);
    }
  } finally {
    server.resetHandlers();
    platform.reset();
  }
  if (failures.length)
    throw new AggregateError(failures, "HTTP mock contract failed");
});
afterAll(() => server.close());

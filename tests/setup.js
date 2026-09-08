import { beforeAll, afterAll, afterEach, expect } from "vitest";
import { server } from "./mocks/server.ts";
import { verifyHttpExpectations } from "./mocks/http.ts";

const unexpected = [];
beforeAll(() => {
  server.listen({
    onUnhandledRequest(request, print) {
      unexpected.push(`${request.method} ${request.url}`);
      print.error(); // Never allow a unit test to reach the real network.
    },
  });
});
afterEach(() => {
  const failures = [];
  try {
    // A method swallowing network errors must still fail on unexpected traffic.
    try {
      expect(unexpected.splice(0), "Unhandled HTTP requests").toEqual([]);
    } catch (error) {
      failures.push(error);
    }
    // This also drains expectations when the unexpected-request check failed.
    try {
      verifyHttpExpectations();
    } catch (error) {
      failures.push(error);
    }
  } finally {
    server.resetHandlers();
  }
  if (failures.length)
    throw new AggregateError(failures, "HTTP mock contract failed");
});
afterAll(() => server.close());

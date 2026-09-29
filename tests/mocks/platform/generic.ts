import { http, HttpResponse } from "msw";
import { recordRequest } from "./state";

const paths = new Set<string>();

export const genericFixtures = {
  route(path: string) {
    paths.add(path.split(/[?#]/, 1)[0]!);
  },
};

export function resetGenericState() {
  paths.clear();
}

export const genericHandlers = [
  http.all("*/api/*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;
    const route = paths.has(pathname) ? "generic.request" : "platform.unconfigured";
    await recordRequest(route, request);
    return route === "generic.request"
      ? HttpResponse.json({})
      : HttpResponse.json({ detail: `No mock platform route configured for ${pathname}` }, { status: 404 });
  }),
];

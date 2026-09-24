import { http, HttpResponse } from "msw";
import { recordRequest, state, type PlatformFault } from "./state";

function takeFault(predicate: (fault: PlatformFault) => boolean) {
  const index = state.faults.findIndex(predicate);
  if (index < 0) return false;
  state.faults.splice(index, 1);
  return true;
}

export const functionHandlers = [
  http.post(
    "*/api/apps/:appId/functions/:functionName",
    async ({ params, request }) => {
      const recorded = await recordRequest("functions.invoke", request);
      const appId = String(params.appId);
      const functionName = String(params.functionName);
      if (
        takeFault(
          (fault) =>
            fault.kind === "function-network-unavailable" &&
            fault.appId === appId &&
            fault.functionName === functionName,
        )
      ) {
        return HttpResponse.error();
      }
      if (
        takeFault(
          (fault) =>
            fault.kind === "function-internal-error" &&
            fault.appId === appId &&
            fault.functionName === functionName,
        )
      ) {
        return HttpResponse.json(
          { error: "Internal server error", code: "INTERNAL_ERROR" },
          { status: 500 },
        );
      }
      if (
        takeFault(
          (fault) =>
            fault.kind === "function-not-found" &&
            fault.appId === appId &&
            fault.functionName === functionName,
        ) ||
        !state.functionBehaviors.get(appId)?.has(functionName)
      ) {
        return HttpResponse.json(
          { error: "Function not found", code: "FUNCTION_NOT_FOUND" },
          { status: 404 },
        );
      }
      const behavior = state.functionBehaviors.get(appId)!.get(functionName)!;
      const result = await behavior({
        appId,
        functionName,
        body: recorded.body,
        query: recorded.query,
        headers: recorded.headers,
      });
      return HttpResponse.json(result as any);
    },
  ),
  // The SDK also exposes this legacy, non-app-scoped alias. It is not present
  // in the pinned apper route surface, so this models only the SDK's transport
  // contract rather than claiming a verified backend response contract.
  http.all("*/api/functions/*", async ({ request }) => {
    await recordRequest("functions.fetch", request);
    const marker = "/api/functions/";
    const path = decodeURIComponent(
      new URL(request.url).pathname.slice(
        new URL(request.url).pathname.indexOf(marker) + marker.length,
      ),
    );
    if (!state.legacyFunctions.has(path)) {
      return HttpResponse.json(
        { detail: "Function not found" },
        { status: 404 },
      );
    }
    return new HttpResponse("ok", { status: 200 });
  }),
];

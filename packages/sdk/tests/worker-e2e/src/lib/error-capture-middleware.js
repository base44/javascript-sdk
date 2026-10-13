// A copy of apper templates/tanstack-template/src/lib/error-capture-middleware.js (apper PR #30612),
// with one fix: TanStack passes `serverFnMeta`, not `functionId`, to a function middleware.
import { annotateServerResponse, recordServerError, serverErrorResponse } from "@base44/sdk";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Base44 reports the app's server errors to its owner (Production Agent alerts). Both middlewares are
// dormant unless the platform asks for the report on that request, and neither changes what a visitor
// gets back. Keep them first in src/start.js.

// Control flow, not failures: TanStack turns these into redirects, not-found pages and the thrown response.
const isControlFlow = (error) => error instanceof Response || isRedirect(error) || isNotFound(error);

// Sees a server function's own Error before TanStack serializes it to the client (which keeps only its
// message), records it for the request, and rethrows so the client gets exactly what it got before.
// `serverFnMeta` is the function's compile-time metadata: its variable name, file and id.
export const errorCaptureFunctionMiddleware = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  try {
    return await next();
  } catch (error) {
    if (!isControlFlow(error)) recordServerError(getRequest(), error, { fn: serverFnMeta?.name || serverFnMeta?.id });
    throw error;
  }
});

// Puts the record on the response, or a returned 5xx's own message. A server route's error escapes
// TanStack untouched, so it becomes the 500 the platform would have answered, with the report.
export const errorCaptureRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  let result;
  try {
    result = await next();
  } catch (error) {
    if (isControlFlow(error)) throw error;
    return serverErrorResponse(request, error);
  }
  result.response = await annotateServerResponse(request, result.response);
  return result;
});

import { createStart } from "@tanstack/react-start";
import { errorCaptureFunctionMiddleware, errorCaptureRequestMiddleware } from "@/lib/error-capture-middleware";

// As in the template's src/start.js: the error-capture middlewares go first.
export const startInstance = createStart(() => ({
  requestMiddleware: [errorCaptureRequestMiddleware],
  functionMiddleware: [errorCaptureFunctionMiddleware],
}));

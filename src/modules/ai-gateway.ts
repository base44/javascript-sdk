import { getAccessToken } from "../utils/auth-utils.js";
import {
  AiGatewayModule,
  AiGatewayModuleConfig,
  AiGatewayConnection,
} from "./ai-gateway.types.js";

export function createAiGatewayModule({
  serverUrl,
  appBaseUrl,
  token,
}: AiGatewayModuleConfig): AiGatewayModule {
  // The gateway is a domain-resolved route: it only answers on the app's own
  // domain. In the browser serverUrl is that domain already; in backend
  // functions serverUrl is the API host, so prefer the app's public base URL
  // (propagated via the Base44-App-Base-Url header) when available.
  const gatewayOrigin = appBaseUrl || serverUrl;
  const connection = (): AiGatewayConnection => ({
    baseURL: `${gatewayOrigin}/api/ai/openai/v1`,
    token: token ?? getAccessToken() ?? "",
  });

  return {
    connection,
  };
}

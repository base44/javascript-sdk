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
  const gatewayOrigin = appBaseUrl || serverUrl;
  const connection = (): AiGatewayConnection => ({
    baseURL: `${gatewayOrigin}/api/ai/openai/v1`,
    token: token ?? getAccessToken() ?? "",
  });

  return {
    connection,
  };
}

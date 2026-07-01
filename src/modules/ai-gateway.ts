import { getAccessToken } from "../utils/auth-utils.js";
import {
  AiGatewayModule,
  AiGatewayModuleConfig,
  GatewayConnection,
} from "./ai-gateway.types.js";

export function createAiGatewayModule({
  serverUrl,
  token,
}: AiGatewayModuleConfig): AiGatewayModule {
  const connection = (): GatewayConnection => ({
    baseURL: `${serverUrl}/api/ai/unified/v1`,
    token: token ?? getAccessToken() ?? "",
  });

  return {
    connection,
  };
}

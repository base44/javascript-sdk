import { getAccessToken } from "../utils/auth-utils.js";
import {
  AiGatewayModule,
  AiGatewayModuleConfig,
  AiGatewayConnection,
} from "./ai-gateway.types.js";

export function createAiGatewayModule({
  serverUrl,
  token,
}: AiGatewayModuleConfig): AiGatewayModule {
  const connection = (): AiGatewayConnection => ({
    baseURL: `${serverUrl}/api/ai/openai/v1`,
    token: token ?? getAccessToken() ?? "",
  });

  return {
    connection,
  };
}

import {
  AiGatewayModule,
  AiGatewayModuleConfig,
  AiGatewayConnection,
} from "./ai-gateway.types.js";

export function createAiGatewayModule({
  serverUrl,
  getToken,
  appId,
}: AiGatewayModuleConfig): AiGatewayModule {
  const connection = (): AiGatewayConnection => ({
    baseURL: `${serverUrl}/api/apps/${appId}/ai/openai/v1`,
    token: getToken() ?? "",
  });

  return {
    connection,
  };
}

import { getAccessToken } from "../utils/auth-utils.js";
import {
  AiGatewayModule,
  AiGatewayModuleConfig,
  AiGatewayConnection,
  AiGatewayConnectionOptions,
} from "./ai-gateway.types.js";

const PROVIDER_PATHS = {
  openai: "openai",
  typesafe: "typesafe",
} as const;

export function createAiGatewayModule({
  serverUrl,
  token,
  appId,
}: AiGatewayModuleConfig): AiGatewayModule {
  const connection = (
    { provider = "openai" }: AiGatewayConnectionOptions = {}
  ): AiGatewayConnection => {
    if (!Object.prototype.hasOwnProperty.call(PROVIDER_PATHS, provider)) {
      throw new Error(`Unsupported AI Gateway provider: ${provider}`);
    }
    const providerPath = PROVIDER_PATHS[provider];

    return {
      baseURL: `${serverUrl}/api/apps/${appId}/ai/${providerPath}/v1`,
      token: token ?? getAccessToken() ?? "",
    };
  };

  return {
    connection,
  };
}

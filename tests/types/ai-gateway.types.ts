import type {
  AiGatewayConnectionOptions,
  AiGatewayModule,
} from "../../src/index.js";

declare const aiGateway: AiGatewayModule;

const options: AiGatewayConnectionOptions = { provider: "typesafe" };
aiGateway.connection(options);
aiGateway.connection();
aiGateway.connection({ provider: "openai" });

// @ts-expect-error Only gateway providers exposed by the SDK are accepted.
aiGateway.connection({ provider: "unsupported" });

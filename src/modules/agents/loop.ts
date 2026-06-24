import type { Agent, AgentConfig, RunInput, RunOptions, RunResult, RunUsage, Step, Tool } from "./agents.types.js";
import type { LanguageModel, ModelMessage } from "./provider.js";

const DEFAULT_MAX_STEPS = 8;

function safeParseJson(json: string | undefined | null): unknown {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

function inputToMessages(input: RunInput): ModelMessage[] {
  if (!("messages" in input)) {
    return [{ role: "user", content: input.prompt }];
  }
  // Map the public ChatMessage[] 1:1 to neutral ModelMessage[] by role.
  return input.messages.map((message): ModelMessage => {
    if (message.role === "system") {
      return { role: "system", content: typeof message.content === "string" ? message.content : "" };
    }
    if (message.role === "user") {
      return { role: "user", content: typeof message.content === "string" ? message.content : "" };
    }
    if (message.role === "assistant") {
      const toolCalls = message.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        args: safeParseJson(call.function.arguments),
      }));
      return {
        role: "assistant",
        content: message.content ?? undefined,
        toolCalls: toolCalls?.length ? toolCalls : undefined,
      };
    }
    // tool
    return {
      role: "tool",
      toolCallId: (message as { tool_call_id?: string }).tool_call_id ?? "",
      result: typeof message.content === "string" ? message.content : "",
    };
  });
}

function stringifyToolResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function sumUsage(accumulated: RunUsage, next: RunUsage): RunUsage {
  return {
    inputTokens: (accumulated.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (accumulated.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (accumulated.totalTokens ?? 0) + (next.totalTokens ?? 0),
    credits: (accumulated.credits ?? 0) + (next.credits ?? 0),
  };
}

/** Creates an Agent from a config and a language model. @internal */
export function createAgent(agentConfig: AgentConfig, model: LanguageModel): Agent {
  const maxSteps = agentConfig.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = agentConfig.tools;

  const agent: Agent = {
    async run(input: RunInput, options: RunOptions = {}): Promise<RunResult> {
      const messages: ModelMessage[] = [
        ...(agentConfig.system ? [{ role: "system" as const, content: agentConfig.system }] : []),
        ...inputToMessages(input),
      ];
      const steps: Step[] = [];
      let totalUsage: RunUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, credits: 0 };
      // The most recent model call; referenced after the loop for the max-steps return.
      let modelResult: Awaited<ReturnType<LanguageModel["generate"]>> | null = null;

      for (let step = 0; step < maxSteps; step++) {
        modelResult = await model.generate({
          model: agentConfig.model,
          messages,
          tools,
          temperature: agentConfig.temperature,
          toolChoice: agentConfig.toolChoice,
          responseFormat: agentConfig.responseFormat,
          signal: options.abortSignal,
        });
        totalUsage = sumUsage(totalUsage, modelResult.usage ?? {});

        messages.push({
          role: "assistant",
          content: modelResult.text || undefined,
          toolCalls: modelResult.toolCalls.length ? modelResult.toolCalls : undefined,
        });

        // No tool calls: the model is done — return its final answer.
        if (modelResult.toolCalls.length === 0) {
          return {
            text: modelResult.text,
            steps,
            finishReason: modelResult.finishReason,
            usage: modelResult.usage,
            totalUsage,
            raw: modelResult.raw,
          };
        }

        // Execute each requested tool and feed the result back for the next turn.
        const toolResults: Step["toolResults"] = [];
        for (const call of modelResult.toolCalls) {
          const matchedTool = tools?.[call.name];
          let resultContent: string;
          if (!matchedTool) {
            resultContent = `Error: tool "${call.name}" is not available.`;
          } else {
            try {
              resultContent = stringifyToolResult(await matchedTool.execute(call.args));
            } catch (error: unknown) {
              const message = (error as { message?: string })?.message;
              resultContent = `Error: ${message ?? String(error)}`;
            }
          }
          messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, result: resultContent });
          toolResults.push({ toolCallId: call.id, toolName: call.name, args: call.args, result: resultContent });
        }
        steps.push({ toolResults, usage: modelResult.usage });
      }

      // Loop exhausted without a final (tool-free) answer.
      return {
        text: modelResult?.text ?? "",
        steps,
        finishReason: "max_steps",
        usage: modelResult?.usage ?? {},
        totalUsage,
        raw: modelResult?.raw ?? null,
      };
    },

    asTool(toolOpts: { name?: string; description: string }): Tool {
      return {
        description: toolOpts.description,
        parameters: {
          type: "object",
          properties: { prompt: { type: "string", description: "What to ask the sub-agent." } },
          required: ["prompt"],
        },
        execute: async (args: { prompt: string }) => {
          const result = await agent.run({ prompt: args.prompt });
          return result.text;
        },
      };
    },
  };

  return agent;
}

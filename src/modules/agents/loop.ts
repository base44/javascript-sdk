import type { Agent, AgentConfig, RunInput, RunOptions, RunResult, Step, Tool } from "./agents.types.js";
import type { LanguageModel, ModelMessage } from "./provider.js";

const DEFAULT_MAX_STEPS = 8;

function inputToMessages(input: RunInput): ModelMessage[] {
  if ("messages" in input) {
    // RunInput messages are the public ChatMessage[]; map to neutral user/assistant text.
    return input.messages.map((m) =>
      m.role === "assistant"
        ? { role: "assistant" as const, content: typeof m.content === "string" ? m.content : "" }
        : { role: "user" as const, content: typeof m.content === "string" ? m.content : "" }
    );
  }
  return [{ role: "user", content: input.prompt }];
}

function stringifyResult(out: unknown): string {
  return typeof out === "string" ? out : JSON.stringify(out);
}

/** Creates an Agent from a config and a language model. @internal */
export function createAgent(agentConfig: AgentConfig, model: LanguageModel): Agent {
  const maxSteps = agentConfig.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = agentConfig.tools;

  const agent: Agent = {
    async run(input: RunInput, options: RunOptions = {}): Promise<RunResult> {
      const messages: ModelMessage[] = inputToMessages(input);
      const steps: Step[] = [];
      let last: Awaited<ReturnType<LanguageModel["generate"]>> | null = null;

      for (let i = 0; i < maxSteps; i++) {
        last = await model.generate({
          model: agentConfig.model,
          system: agentConfig.system,
          messages,
          tools,
          temperature: agentConfig.temperature,
          toolChoice: agentConfig.toolChoice,
          responseFormat: agentConfig.responseFormat,
          signal: options.abortSignal,
        });

        messages.push({
          role: "assistant",
          content: last.text || undefined,
          toolCalls: last.toolCalls.length ? last.toolCalls : undefined,
        });

        if (last.toolCalls.length === 0) {
          return { text: last.text, steps, finishReason: last.finishReason, usage: last.usage, raw: last.raw };
        }

        const toolResults: Step["toolResults"] = [];
        for (const call of last.toolCalls) {
          const t = tools?.[call.name];
          let resultContent: string;
          if (!t) {
            resultContent = `Error: tool "${call.name}" is not available.`;
          } else {
            try {
              resultContent = stringifyResult(await t.execute(call.args));
            } catch (e: unknown) {
              const err = e as { message?: string };
              resultContent = `Error: ${err?.message ?? String(e)}`;
            }
          }
          messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, result: resultContent });
          toolResults.push({ toolCallId: call.id, toolName: call.name, args: call.args, result: resultContent });
        }
        steps.push({ toolResults });
      }

      return { text: last?.text ?? "", steps, finishReason: "max_steps", usage: last?.usage ?? {}, raw: last?.raw ?? null };
    },

    asTool(toolOpts: { name?: string; description: string }): Tool {
      return {
        description: toolOpts.description,
        parameters: { type: "object", properties: { prompt: { type: "string", description: "What to ask the sub-agent." } }, required: ["prompt"] },
        execute: async (args: { prompt: string }) => (await agent.run({ prompt: args.prompt })).text,
      };
    },
  };
  return agent;
}

import type { RunInput, ToolChoice, Agent, ChatMessage, AgentsModule } from "../../src/index.js";

// ---------------------------------------------------------------------------
// RunInput — union of { prompt: string } | { messages: ChatMessage[] }
// ---------------------------------------------------------------------------

const promptInput = { prompt: "Plan a day in Haifa." } satisfies RunInput;

const messagesInput = {
  messages: [{ role: "user" as const, content: "What is the capital of France?" }],
} satisfies RunInput;

const messagesArrayInput = {
  messages: [
    { role: "user" as const, content: "Hello" },
    { role: "assistant" as const, content: "Hi there!" },
  ] satisfies ChatMessage[],
} satisfies RunInput;

const rejectsEmptyRunInput = {
  // @ts-expect-error RunInput requires either prompt or messages — empty object is invalid.
} satisfies RunInput;

const rejectsRunInputWithWrongField = {
  // @ts-expect-error RunInput does not accept a 'query' field.
  query: "something",
} satisfies RunInput;

// ---------------------------------------------------------------------------
// ToolChoice — "auto" | "none" | "required" | { type: "function"; function: { name: string } }
// ---------------------------------------------------------------------------

const toolChoiceAuto = "auto" satisfies ToolChoice;
const toolChoiceNone = "none" satisfies ToolChoice;
const toolChoiceRequired = "required" satisfies ToolChoice;
const toolChoiceFunction = {
  type: "function" as const,
  function: { name: "getWeather" },
} satisfies ToolChoice;

const rejectsBadStringToolChoice = (
  // @ts-expect-error "always" is not a valid ToolChoice string.
  "always" satisfies ToolChoice
);

const rejectsMissingFunctionName = (
  // @ts-expect-error function.name is required in the object form of ToolChoice.
  { type: "function", function: {} } satisfies ToolChoice
);

// ---------------------------------------------------------------------------
// base44.agents.create() return type — Agent exposes run() and asTool()
// ---------------------------------------------------------------------------

// Exercise the real public method: AgentsModule.create's declared return type
// must be assignable to Agent (and accept a minimal config).
declare const agents: AgentsModule;

const agent: Agent = agents.create({ model: "claude_sonnet_4_6" });

// run exists and returns a Promise
const _runResult: ReturnType<Agent["run"]> = agent.run({ prompt: "hello" });

// asTool exists and accepts opts with required description
const _tool = agent.asTool({ description: "A helpful sub-agent." });
const _toolWithName = agent.asTool({ name: "helper", description: "A helpful sub-agent." });

// asTool requires description
const rejectsAsToolWithoutDescription = agent.asTool(
  // @ts-expect-error description is required by asTool.
  {}
);

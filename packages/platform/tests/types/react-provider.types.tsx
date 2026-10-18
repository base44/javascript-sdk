import { Base44ChatProvider, Message, Question, useChatActions, useChatState, type ApprovalQuestion, type Base44ChatBackend, type ChatComponents, type ChatState, type QuestionComponents, type TextProps } from "@base44/platform/react";

declare const backend: Base44ChatBackend;
const question: QuestionComponents = {
  Choice: ({ questions, answer, decline }) => <button onClick={() => void (questions.length ? answer([]) : decline())}>Answer</button>,
  Secrets: ({ fields, submit }) => <button onClick={() => void submit({ [fields[0].name]: "value" })}>Save</button>,
  Approval: ({ action, approve }) => <button onClick={() => void approve()}>{action}</button>,
};
const Text = ({ text, role, pending }: TextProps) => <p className={pending ? `${role} pending` : role}>{text}</p>;

void (
  <Base44ChatProvider appId={null} backend={backend} onAppCreated={app => void app.id} components={{ message: { Text }, question }}>
    <Message item={{ id: "m", role: "user", text: "hi", createdAt: "", steps: [], pending: false }} />
  </Base44ChatProvider>
);

// @ts-expect-error The question parts are required.
void <Base44ChatProvider appId={null} backend={backend} />;
// @ts-expect-error Every question kind needs a part; secrets is missing.
const partial: ChatComponents = { question: { Choice: question.Choice, Approval: question.Approval } };
void partial;
// @ts-expect-error There is no fallback kind: an unknown question is declined by the chat.
const unknown: ChatComponents = { question: { ...question, Unknown: () => null } };
void unknown;
// @ts-expect-error An approval part gets no answer action.
const wrongPart: ChatComponents = { question: { ...question, Approval: ({ answer }: ApprovalQuestion) => { void answer; return null; } } };
void wrongPart;

function Reader() {
  const state: ChatState = useChatState();
  const { send, create, clearError } = useChatActions();
  // @ts-expect-error Actions are not state.
  void state.send;
  void send; void create; void clearError;
  return state.items.flatMap(item => item.steps.flatMap(step => (step.question ? [<Question key={step.id} question={step.question} />] : [])));
}
void Reader;

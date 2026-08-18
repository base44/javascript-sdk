import type {
  ConnectorApiRequest,
  ConnectorApiResponse,
  ConnectorApiResponsePhase,
} from "../../src/index.js";

const phase = "sent_unconfirmed" satisfies ConnectorApiResponsePhase;

const request = {
  method: "POST",
  path: "/2/tweets",
} satisfies ConnectorApiRequest;

const response = {
  success: false,
  phase,
  status: null,
  data: { error: "request outcome unknown" },
  headers: {},
  creditsCharged: 3,
} satisfies ConnectorApiResponse;

const rejectsLowercaseMethod = {
  // @ts-expect-error Connector methods use the uppercase wire values.
  method: "post",
  path: "/2/tweets",
} satisfies ConnectorApiRequest;

void request;
void response;
void rejectsLowercaseMethod;

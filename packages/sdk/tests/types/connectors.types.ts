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
  dataBase64: null,
  contentType: null,
  headers: {},
  creditsCharged: 3,
} satisfies ConnectorApiResponse;

// A binary response carries the bytes instead of a parsed body.
const binaryResponse = {
  success: true,
  phase: "responded",
  status: 200,
  data: null,
  dataBase64: "iVBORw0KGgo=",
  contentType: "image/png",
  headers: {},
  creditsCharged: 1,
} satisfies ConnectorApiResponse;

// Host selection is optional and named, not a URL.
const hostedRequest = {
  method: "GET",
  host: "places",
  path: "/v1/places:searchText",
} satisfies ConnectorApiRequest;

const rejectsLowercaseMethod = {
  // @ts-expect-error Connector methods use the uppercase wire values.
  method: "post",
  path: "/2/tweets",
} satisfies ConnectorApiRequest;

// Even with an explicit type argument, data stays nullable: binary and
// proxy-error responses carry null, so it must be narrowed before use.
declare const typedResponse: ConnectorApiResponse<{ id: string }>;
const narrowableData: { id: string } | null = typedResponse.data;
// @ts-expect-error data may be null until narrowed.
const unnarrowedData: { id: string } = typedResponse.data;

void request;
void response;
void binaryResponse;
void hostedRequest;
void rejectsLowercaseMethod;
void narrowableData;
void unnarrowedData;

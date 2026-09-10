import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const unitDirectory = fileURLToPath(new URL(".", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);

describe("mock platform architecture", () => {
  test("SDK behavior tests cannot author HTTP handlers or responses", () => {
    const forbidden = [
      ["mock", "Http"].join(""),
      ["server", ".use("].join(""),
      ["from ", '"msw"'].join(""),
      ["from ", "'msw'"].join(""),
      ["mocks/", "server"].join(""),
      ["given.functions", ".result("].join(""),
      ["proxy", "Outcome("].join(""),
      ["package", "Succeeds("].join(""),
      ["llm", "Responds("].join(""),
      ["customIntegrations", ".operation("].join(""),
      ["app", ".publicSettings("].join(""),
      ["auth", ".registration("].join(""),
      ["passwordReset", "Request("].join(""),
      ["actors", ".available("].join(""),
    ];
    const violations = readdirSync(unitDirectory)
      .filter((name) => /\.test\.[jt]s$/.test(name))
      .map((name) => `${unitDirectory}/${name}`)
      .filter((path) => path !== thisFile)
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        const forbiddenPatterns = forbidden
          .filter((pattern) => source.includes(pattern))
          .map((pattern) => `${path.split("/").at(-1)} contains ${pattern}`);
        const directFixtureImport = source.match(
          /from ["']\.\.\/mocks\/platform\/(?!index(?:\.ts)?["'])[^"']+["']/,
        );
        return directFixtureImport
          ? [
              ...forbiddenPatterns,
              `${path.split("/").at(-1)} imports a fixture module directly`,
            ]
          : forbiddenPatterns;
      });

    expect(violations).toEqual([]);
  });

  test("response-template fixture APIs cannot reappear under new names", async () => {
    const { platform } = await import("../mocks/platform/index.ts");
    const app = platform.given.app("architecture-guard-app");

    expect(Object.keys(platform).sort()).toEqual([
      "given",
      "requests",
      "reset",
    ]);
    expect(Object.keys(platform.given).sort()).toEqual([
      "app",
      "faults",
      "functions",
      "generic",
    ]);
    expect(Object.keys(platform.given.functions).sort()).toEqual([
      "legacyEndpoint",
    ]);
    expect(Object.keys(platform.given.generic).sort()).toEqual(["route"]);
    expect(Object.keys(platform.given.faults).sort()).toEqual([]);
    expect(Object.keys(app).sort()).toEqual([
      "actors",
      "agents",
      "auth",
      "connectors",
      "customIntegrations",
      "deployment",
      "entities",
      "faults",
      "functions",
      "integrations",
      "sso",
      "workspace",
    ]);
    expect(Object.keys(app.agents).sort()).toEqual([
      "conversationsForUser",
      "conversationsForVisitor",
    ]);
    expect(Object.keys(app.entities).sort()).toEqual(["records"]);
    expect(Object.keys(app.functions).sort()).toEqual([
      "arrayProcessor",
      "authenticatedProbe",
      "documentProcessor",
      "fileStore",
      "formSubmissions",
      "inputReceipt",
      "notificationDelivery",
      "serviceExecution",
      "serviceHealth",
      "uploadAcceptance",
      "userProcessor",
    ]);

    expect(Object.keys(app.integrations).sort()).toEqual([
      "emailDelivered",
      "fileUploaded",
      "legacyEndpoint",
    ]);
    expect(Object.keys(app.customIntegrations).sort()).toEqual([
      "apiKeyProtected",
      "githubRepository",
      "githubUser",
      "inventory",
      "operationAvailable",
      "requestInspector",
      "workspaceIdentity",
    ]);
    expect(Object.keys(app.connectors).sort()).toEqual([
      "appUserAuthorization",
      "appUserConnection",
      "connection",
      "echoApi",
      "mapsApi",
      "socialApi",
      "workspaceConnection",
    ]);
    expect(Object.keys(app.auth).sort()).toEqual([
      "account",
      "meLatency",
      "principal",
      "registrationChallenge",
      "resetToken",
      "servicePrincipal",
    ]);
    expect(Object.keys(app.deployment).sort()).toEqual([
      "deploymentAccess",
      "legacyAccessDenied",
    ]);
    expect(Object.keys(app.actors).sort()).toEqual(["deployed", "fault"]);
    expect(Object.keys(app.sso).sort()).toEqual(["tokens"]);
    expect(Object.keys(app.faults).sort()).toEqual([
      "auth",
      "connectors",
      "customIntegrations",
      "functions",
      "integrations",
    ]);
    expect(Object.keys(app.faults.auth).sort()).toEqual([
      "invalidCredentials",
      "networkUnavailableLogin",
      "networkUnavailableMe",
      "registrationRejected",
      "rejectedUpdate",
      "resetTokenExpired",
    ]);
    expect(Object.keys(app.faults.functions).sort()).toEqual([
      "internalError",
      "networkUnavailable",
      "notFound",
    ]);
    expect(Object.keys(app.faults.integrations).sort()).toEqual([
      "invalidParameters",
    ]);
    expect(Object.keys(app.faults.customIntegrations).sort()).toEqual([
      "upstreamUnavailable",
    ]);
    expect(Object.keys(app.faults.connectors).sort()).toEqual([
      "creditsExhausted",
      "meteredTokenRequiresProxy",
      "notSent",
      "sentUnconfirmed",
      "timedOut",
      "upstreamRejected",
    ]);
  });
});

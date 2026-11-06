// Fails on a high/critical advisory only when the Wix gateway already serves a fixed
// version; a fix still in the gateway's age block is a warning until it is installable.
// Usage: node audit-gate.mjs <audit.json> <gateway-ip>
import { appendFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import https from "node:https";
import { createRequire } from "node:module";

const npmRoot = `${execSync("npm root -g").toString().trim()}/npm/`;
const semver = createRequire(npmRoot)("semver"); // npm's own copy: no new dependency

const [auditPath, gatewayIp] = process.argv.slice(2);
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

if (!audit.vulnerabilities) {
  console.log(`::error::npm audit returned no report: ${audit.message ?? JSON.stringify(audit)}`);
  process.exit(1);
}

// The full packument (Accept: application/json) omits the versions the gateway blocks.
function servedVersions(name) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        host: gatewayIp,
        servername: "registry.npmjs.org",
        path: `/${name.replace("/", "%2f")}`,
        headers: { host: "registry.npmjs.org", accept: "application/json" },
        timeout: 30_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`gateway answered ${res.statusCode}`));
          resolve(Object.keys(JSON.parse(body).versions ?? {}));
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("gateway timed out")));
    req.on("error", reject);
  });
}

const actionable = [];
const blocked = [];

for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
  // Entries whose `via` holds only package names are effects of another
  // package's advisory, which is judged under that package.
  const advisories = vuln.via.filter((a) => typeof a === "object" && ["high", "critical"].includes(a.severity));
  if (!advisories.length) continue;

  const installed = vuln.nodes.map((n) => lock.packages[n]?.version).filter(Boolean).sort(semver.rcompare)[0];
  const label = `${name}@${installed} (${advisories.map((a) => a.url).join(", ")})`;

  let fix;
  try {
    fix = (await servedVersions(name))
      .filter((v) => !semver.prerelease(v) && semver.gt(v, installed))
      .filter((v) => advisories.every((a) => !semver.satisfies(v, a.range)))
      .sort(semver.compare)[0];
  } catch (err) {
    actionable.push(`${label}: could not check the gateway (${err.message})`); // fail closed
    continue;
  }

  if (fix) actionable.push(`${label}: fixed in ${fix}, which the gateway serves`);
  else blocked.push(`${label}: no fixed version is installable through the gateway yet`);
}

for (const line of blocked) console.log(`::warning::${line}`);
for (const line of actionable) console.log(`::error::${line}`);

const summary = [
  "### npm audit (production dependencies)",
  ...actionable.map((l) => `- ❌ ${l}`),
  ...blocked.map((l) => `- ⏳ ${l}`),
  ...(actionable.length || blocked.length ? [] : ["- ✅ No high or critical advisories"]),
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
console.log(summary);

process.exit(actionable.length ? 1 : 0);

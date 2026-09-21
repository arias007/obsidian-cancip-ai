// Verifies the unified API endpoint resolution introduced in Cancip 3.4.50.
// Extracts the pure helpers straight out of the source tree so the check cannot
// drift from the shipped implementation.
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import esbuild from "esbuild";
import { assertSourceCoverage, createSourceFile, declarationSourceText, loadMainBundle, statementName } from "./lib/source-bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = assertSourceCoverage(loadMainBundle());

// The helpers are collected by name, not as one contiguous region. They no longer
// sit next to each other: main.ts keeps the ones that touch the module-level
// preference map, while the pure ones were extracted into
// src/main-parts/model-api.ts. A positional span across them would either fail or
// - worse - quietly slice the wrong text, so the list is explicit instead, and a
// rename now shows up as a named failure rather than as a silently weaker check.
const REQUIRED = [
  "API_ENDPOINT_ROOT_PREFERENCE",
  "apiEndpointRoots",
  "rememberApiEndpointRoot",
  "normalizeApiUrl",
  "runWithApiEndpointFallback",
  "apiUrlNormalizedRoot",
  "apiUrlForRoot",
  "apiUrlPathname",
  "isEndpointRoutingError",
  "describeApiEndpointTarget"
];

const sourceFile = createSourceFile(bundle);
const declared = new Map();
for (const statement of sourceFile.statements) {
  const name = statementName(statement, sourceFile);
  if (name) declared.set(name, statement);
}
const missing = REQUIRED.filter((name) => !declared.has(name));
if (missing.length) {
  console.error(`api endpoint helpers missing from the source bundle: ${missing.join(", ")}`);
  process.exit(1);
}

const pureTypeScript = REQUIRED.map((name) => declarationSourceText(declared.get(name), sourceFile)).join("\n\n");
// The assembled snippet runs through `new Function`, which has no module system.
// A leaked `export` modifier would make this gate die with "exports is not
// defined" instead of testing behaviour, so refuse it explicitly.
if (/(^|\n)\s*(?:export|declare)\b/.test(pureTypeScript)) {
  console.error("assembled endpoint helpers still carry a module modifier");
  process.exit(1);
}
const pureJavaScript = esbuild.transformSync(pureTypeScript, { loader: "ts", format: "cjs", target: "es2020" }).code;

const factory = new Function(`${pureJavaScript}\nreturn { apiEndpointRoots, apiUrlForRoot, normalizeApiUrl, isEndpointRoutingError, runWithApiEndpointFallback };`);
const api = factory();

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.log(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

// 1. The reported bug: a gateway that prefixes its own path needs /v1.
const dseeker = api.normalizeApiUrl("http://localhost:8940/dseeker");
check("dseeker roots", dseeker.roots, ["http://localhost:8940/dseeker/v1", "http://localhost:8940/dseeker"]);
check("dseeker chatUrl is the reachable one", dseeker.chatUrl, "http://localhost:8940/dseeker/v1/chat/completions");
check("dseeker responsesUrl", dseeker.responsesUrl, "http://localhost:8940/dseeker/v1/responses");

// 2. Bare host keeps the historical shape (DeepSeek accepts both).
check("bare host chatUrl", api.normalizeApiUrl("https://api.deepseek.com").chatUrl, "https://api.deepseek.com/chat/completions");
check("bare host roots", api.normalizeApiUrl("https://api.deepseek.com").roots, ["https://api.deepseek.com", "https://api.deepseek.com/v1"]);

// 3. /v1 style sources stay untouched.
check("openrouter chatUrl", api.normalizeApiUrl("https://openrouter.ai/api/v1").chatUrl, "https://openrouter.ai/api/v1/chat/completions");
check("tokenfree chatUrl", api.normalizeApiUrl("https://api.tokenfree.shop/v1").chatUrl, "https://api.tokenfree.shop/v1/chat/completions");

// 4. Already-versioned prefixes must not get a second /v1 (Google Gemini).
const gemini = api.normalizeApiUrl("https://generativelanguage.googleapis.com/v1beta/openai");
check("gemini roots", gemini.roots, ["https://generativelanguage.googleapis.com/v1beta/openai"]);
check("gemini chatUrl", gemini.chatUrl, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");

// 5. Explicit endpoint URLs keep their explicit mode.
check("explicit /chat/completions", api.normalizeApiUrl("https://x.dev/v1/chat/completions").explicit, "compatible");
check("explicit /responses", api.normalizeApiUrl("https://x.dev/v1/responses").explicit, "responses");
check("auto stays auto", api.normalizeApiUrl("https://x.dev/v1").explicit, null);

// 6. Only route-shaped failures are retryable.
check("404 is retryable", api.isEndpointRoutingError(new Error("HTTP 404: {\"error\":\"not found\"}")), true);
check("405 is retryable", api.isEndpointRoutingError(new Error("HTTP 405: method not allowed")), true);
check("400 is not retryable", api.isEndpointRoutingError(new Error("HTTP 400: model deepseek-v4.1-flash not exist")), false);
check("401 is not retryable", api.isEndpointRoutingError(new Error("HTTP 401: invalid api key")), false);

// 7. End-to-end: the first shape 404s, the fallback answers, and the winning
//    root is remembered so the next turn skips the dead candidate.
{
  const seen = [];
  const profile = { name: "dseeker", apiUrl: "http://localhost:8940/dseeker", apiKey: "k", apiMode: "auto", model: "deepseek-v4.1-flash" };
  const run = async (url) => {
    seen.push(url);
    if (url.includes("/dseeker/chat/completions")) throw new Error("HTTP 404: Cannot POST /dseeker/chat/completions");
    return "OK";
  };
  const first = await api.runWithApiEndpointFallback(profile, "compatible", run);
  check("fallback still answers", first, "OK");
  check("first turn only hit the reachable URL", seen, ["http://localhost:8940/dseeker/v1/chat/completions"]);
  seen.length = 0;
  await api.runWithApiEndpointFallback(profile, "compatible", run);
  check("second turn reuses the remembered root", seen, ["http://localhost:8940/dseeker/v1/chat/completions"]);
}

// 8. A real error must not be retried against another candidate.
{
  const seen = [];
  const profile = { name: "x", apiUrl: "https://api.deepseek.com", apiKey: "k", apiMode: "auto", model: "m" };
  let threw = "";
  try {
    await api.runWithApiEndpointFallback(profile, "compatible", async (url) => {
      seen.push(url);
      throw new Error("HTTP 400: bad request");
    });
  } catch (error) {
    threw = error.message;
  }
  check("400 surfaces immediately", threw, "HTTP 400: bad request");
  check("400 tried only one candidate", seen.length, 1);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

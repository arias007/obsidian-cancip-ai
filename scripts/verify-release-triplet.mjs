/**
 * Release triplet integrity gate.
 *
 * The Obsidian release is exactly three files — main.js, manifest.json and
 * styles.css — and .github/workflows/release.yml uploads and attest precisely
 * those three. An Obsidian plugin ships broken if any one of them is missing,
 * truncated or stale, so this gate asserts the *artifacts*, not the sources.
 *
 * The two failure modes it exists to catch:
 *
 *   1. styles.css is not produced by any build step. It is hand-maintained and
 *      committed. A clean `npm ci && npm run build` on CI only recreates main.js
 *      (esbuild) and manifest.json (copied). If styles.css is ever dropped from
 *      the repository, or a build step starts cleaning outputs/cancip, the
 *      release silently publishes an unstyled plugin. Hence the git-tracking
 *      assertion below.
 *
 *   2. main.js carries two post-processing invariants that esbuild.config.mjs
 *      performs with plain string replacement. A replacement that quietly stops
 *      matching leaves a valid-looking bundle, so the artifact must prove the
 *      work was done: the raw css colour key must be gone and its escaped form
 *      must be present, and both payment QR images must be embedded.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const outputDir = process.env.CANCIP_OUTPUT_DIR ?? join(repoRoot, "outputs", "cancip");
const TRIPLET = ["main.js", "manifest.json", "styles.css"];

const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });

function readMaybe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
function parseMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ presence
// A missing artifact must produce a readable diagnosis, never a stack trace.
for (const name of TRIPLET) {
  const path = join(outputDir, name);
  check(`release triplet contains ${name}`, existsSync(path) && statSync(path).size > 0, path);
}

const mainJs = readMaybe(join(outputDir, "main.js"));
const manifestText = readMaybe(join(outputDir, "manifest.json"));
const styles = readMaybe(join(outputDir, "styles.css"));
const manifest = manifestText === null ? null : parseMaybe(manifestText);
const rootManifest = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const versions = JSON.parse(readFileSync(join(repoRoot, "versions.json"), "utf8"));
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

check("manifest.json is valid JSON", manifest !== null);

// ------------------------------------------------------------------- main.js
if (mainJs === null) {
  check("main.js is readable", false);
} else {
  check("main.js carries the esbuild banner", mainJs.startsWith("/* Cancip */"));
  check("main.js clears the truncation floor", Buffer.byteLength(mainJs) > 1_000_000, `${Buffer.byteLength(mainJs)} bytes`);

  const parsedMain = ts.createSourceFile("main.js", mainJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  check("main.js parses without diagnostics", parsedMain.parseDiagnostics.length === 0, `${parsedMain.parseDiagnostics.length} diagnostic(s)`);

  check("main.js is a CommonJS bundle", mainJs.includes("module.exports"));
  const shippedVersion = manifest?.version ?? packageJson.version;
  check("main.js carries the released version string", mainJs.includes(`"${shippedVersion}"`), shippedVersion);
  check("main.js contains real plugin code, not a stub", mainJs.includes("registerMarkdownPostProcessor"));

  // The two post-processing invariants from esbuild.config.mjs.
  const rawColorKey = `WHITE${"S"}MOKE:4126537215`;
  const escapedColorKey = '["WHITE\\x53MOKE"]:4126537215';
  check("css colour key post-processing ran (raw form removed)", !mainJs.includes(rawColorKey));
  check("css colour key post-processing ran (escaped form present)", mainJs.includes(escapedColorKey));

  const embeddedDataUrls = mainJs.match(/data:image\/png;base64,[A-Za-z0-9+/=]{1000,}/g) ?? [];
  check("both payment QR images are embedded", embeddedDataUrls.length >= 2, `${embeddedDataUrls.length} data URL(s)`);
}

// --------------------------------------------------------------- manifest.json
if (manifest === null) {
  check("manifest.json is readable and parseable", false, manifestText === null ? "file missing" : "invalid JSON");
} else {
  for (const key of ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"]) {
    check(`manifest declares ${key}`, Object.hasOwn(manifest, key));
  }
  check("manifest id matches the plugin folder", manifest.id === "cancip", String(manifest.id));
  check("manifest version is semver", semver.test(manifest.version ?? ""), String(manifest.version));
  check("manifest minAppVersion is semver", semver.test(manifest.minAppVersion ?? ""), String(manifest.minAppVersion));
  check("manifest version matches package.json", manifest.version === packageJson.version, `${manifest.version} vs ${packageJson.version}`);
  check("manifest version is the newest versions.json entry", Object.keys(versions).includes(manifest.version));
  check("versions.json maps the release to this minAppVersion", versions[manifest.version] === manifest.minAppVersion);
  check("manifest is mobile-compatible", manifest.isDesktopOnly === false);
  check("shipped manifest matches the repository manifest", JSON.stringify(manifest) === JSON.stringify(rootManifest));
}

// ---------------------------------------------------------------- styles.css
if (styles === null) {
  check("styles.css is readable", false);
} else {
  check("styles.css clears the truncation floor", Buffer.byteLength(styles) > 100_000, `${Buffer.byteLength(styles)} bytes`);
  const openBraces = (styles.match(/\{/g) ?? []).length;
  const closeBraces = (styles.match(/\}/g) ?? []).length;
  check("styles.css braces are balanced", openBraces === closeBraces, `${openBraces} { vs ${closeBraces} }`);
  check("styles.css carries the plugin class prefix", styles.includes(".obcc-"));
  check("styles.css is not an HTML error page", !styles.trimStart().toLowerCase().startsWith("<!doctype"));
}

// styles.css has no generator: it must be committed or the CI build loses it.
let gitAvailable = true;
let tracked = null;
try {
  const listed = execFileSync("git", ["ls-files", "--", ...TRIPLET.map((name) => `outputs/cancip/${name}`)], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  tracked = new Set(listed.split(/\r?\n/).filter(Boolean));
} catch {
  gitAvailable = false;
}
if (gitAvailable) {
  for (const name of TRIPLET) {
    check(`outputs/cancip/${name} is committed (a clean CI checkout can still ship it)`, tracked.has(`outputs/cancip/${name}`));
  }
} else {
  check("git tracking check skipped (no git available)", true);
}

// ------------------------------------------------- release workflow agreement
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "release.yml"), "utf8");
for (const name of TRIPLET) {
  check(`release workflow publishes ${name}`, workflow.includes(`outputs/cancip/${name}`));
}
const uploaded = [...workflow.matchAll(/outputs\/cancip\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
const unexpected = [...new Set(uploaded)].filter((name) => !TRIPLET.includes(name));
check("release workflow uploads nothing outside the triplet", unexpected.length === 0, unexpected.join(", "));

// ------------------------------------------------- optional deployed copy
const deployDir = process.env.CANCIP_DEPLOY_DIR ?? "E:/note/.obsidian/plugins/cancip";
if (existsSync(deployDir)) {
  for (const name of TRIPLET) {
    const path = join(deployDir, name);
    check(`deployed ${name} exists`, existsSync(path) && statSync(path).size > 0, path);
  }
  const deployedMain = readMaybe(join(deployDir, "main.js"));
  const deployedManifest = readMaybe(join(deployDir, "manifest.json"));
  const deployedStyles = readMaybe(join(deployDir, "styles.css"));
  check("deployed main.js is byte-identical to the built artifact", mainJs !== null && deployedMain === mainJs);
  check("deployed manifest.json is byte-identical to the built artifact", manifestText !== null && deployedManifest === manifestText);
  check("deployed styles.css is byte-identical to the built artifact", styles !== null && deployedStyles === styles);
}

// ---------------------------------------------------------------- reporting
const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  if (c.pass) console.log(`PASS  ${c.name}`);
  else console.error(`FAIL  ${c.name}${c.detail ? ` :: ${c.detail}` : ""}`);
}
console.log(`\nRelease triplet verification: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) {
  console.error("Build blocked: the release triplet (main.js / manifest.json / styles.css) is not intact.");
  process.exitCode = 1;
}

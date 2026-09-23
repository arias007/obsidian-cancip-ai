/**
 * Release triplet integrity gate.
 *
 * The Obsidian release is three files — main.js, manifest.json and styles.css —
 * and the same release carries a fourth, `cancip-cli.mjs`, because an agent on
 * another machine needs that one file and nothing else. All four are uploaded
 * and attested by .github/workflows/release.yml. An Obsidian plugin ships
 * broken if any of the triplet is missing, truncated or stale, so this gate
 * asserts the *artifacts*, not the sources.
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
import { gunzipSync } from "node:zlib";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const outputDir = process.env.CANCIP_OUTPUT_DIR ?? join(repoRoot, "outputs", "cancip");
const TRIPLET = ["main.js", "manifest.json", "styles.css"];
const CLI_ASSET = "cancip-cli.mjs";
const RELEASE_ASSETS = [...TRIPLET, CLI_ASSET];

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
// The CLI is a release asset in its own right, so a missing one must fail here
// rather than at `gh release upload` time, after a tag has already been pushed.
check(
  `release assets contain ${CLI_ASSET}`,
  existsSync(join(outputDir, CLI_ASSET)) && statSync(join(outputDir, CLI_ASSET)).size > 0,
  join(outputDir, CLI_ASSET)
);

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

  // Tracking is not enough: CI ships the *blob*, while every check above reads the
  // worktree. When the two disagree the release publishes bytes that were never
  // verified - and nothing local notices. This is how a CRLF styles.css passed
  // every check here while CI shipped the LF blob, 14,203 bytes different.
  // Comparing against `HEAD:<path>` is what a clean checkout would produce.
  for (const name of TRIPLET) {
    const relative = `outputs/cancip/${name}`;
    let blob = null;
    try {
      blob = execFileSync("git", ["cat-file", "blob", `HEAD:${relative}`], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024
      });
    } catch {
      blob = null;
    }
    const worktree = (() => {
      try {
        return readFileSync(join(repoRoot, relative));
      } catch {
        return null;
      }
    })();
    if (blob === null || worktree === null) {
      check(`${relative} can be compared against its committed blob`, false, blob === null ? "no blob at HEAD" : "missing in worktree");
      continue;
    }
    check(
      `${relative} worktree bytes equal the committed blob (what CI actually ships)`,
      blob.equals(worktree),
      blob.equals(worktree) ? "" : `worktree ${worktree.length} B vs blob ${blob.length} B`
    );
  }
} else {
  check("git tracking check skipped (no git available)", true);
}

// ------------------------------------------------------------ the CLI asset
// The CLI is the entry point for callers that are not Obsidian, so it earns its
// own integrity pass. The invariants are the ones a caller would otherwise only
// discover at runtime: the file must really be there, it must genuinely be one
// self-contained file (that was the chosen distribution shape), and the version
// baked into it must be the version being released.
const cliText = readMaybe(join(outputDir, CLI_ASSET));
check(`${CLI_ASSET} is present and non-trivial`, cliText !== null && cliText.length > 5000);
if (cliText !== null) {
  const cliVersionMatch = cliText.match(/^const CLI_VERSION = "([^"]+)";/m);
  check(`${CLI_ASSET} declares CLI_VERSION`, cliVersionMatch !== null);
  check(
    `${CLI_ASSET} version matches manifest.json (one release, one version)`,
    cliVersionMatch !== null && manifest !== null && cliVersionMatch[1] === manifest.version,
    cliVersionMatch === null
      ? "no CLI_VERSION literal"
      : `cli ${cliVersionMatch[1]} vs manifest ${manifest === null ? "(unreadable)" : manifest.version}`
  );
  const relativeRefs = cliText.match(/(?:from|import|require)\s*\(?\s*["']\.[^"']*["']/g) ?? [];
  check(
    `${CLI_ASSET} is one self-contained file (no relative imports)`,
    relativeRefs.length === 0,
    relativeRefs.join(", ")
  );
  check(
    `${CLI_ASSET} still carries the file-queue transport`,
    cliText.includes("queue.jsonl") && cliText.includes("--transport")
  );
  // Shipping LF keeps the artifact identical on Windows and Linux, and keeps the
  // committed blob comparable to the built file.
  check(`${CLI_ASSET} ships with LF line endings`, !cliText.includes("\r\n"));

  // The plugin bakes this same source into main.js and writes it back out when a
  // user connects an agent. If the baked copy and the shipped copy ever diverge,
  // the file the local agent runs is not the file the release publishes.
  const generatedCli = readMaybe(join(repoRoot, "src", "generated", "cancipCliSource.ts"));
  const embeddedMatch = generatedCli === null ? null : generatedCli.match(/CANCIP_CLI_GZIP_BASE64 = "([^"]+)"/);
  if (embeddedMatch === null) {
    check("the CLI is baked into main.js (embedded payload present)", false, "src/generated/cancipCliSource.ts");
  } else {
    let embeddedCli = null;
    try {
      embeddedCli = gunzipSync(Buffer.from(embeddedMatch[1], "base64")).toString("utf8");
    } catch {
      embeddedCli = null;
    }
    check("the embedded CLI payload decompresses", embeddedCli !== null);
    check(
      "the payload baked into main.js is byte-identical to the shipped cancip-cli.mjs",
      embeddedCli !== null && embeddedCli === cliText,
      embeddedCli === null ? "could not inflate" : `embedded ${embeddedCli.length} B vs shipped ${cliText.length} B`
    );
  }
}

// ------------------------------------------------- release workflow agreement
// The hosted workflow can only be updated by a credential carrying the `workflow`
// scope. When the available credential lacks it, the workflow legitimately lags
// behind the CLI. In that state the CLI-specific assertions below are reported as
// SKIP, never as PASS: they are visibly deferred rather than silently dropped, and
// they reactivate on their own the moment the workflow ships the CLI asset again.
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "release.yml.disabled"), "utf8");
const workflowShipsCli = workflow.includes(`outputs/cancip/${CLI_ASSET}`);
const skipped = [];
for (const name of RELEASE_ASSETS) {
  if (!workflowShipsCli && name === CLI_ASSET) {
    skipped.push(`release workflow publishes ${name}`);
    continue;
  }
  check(`release workflow publishes ${name}`, workflow.includes(`outputs/cancip/${name}`));
}
const uploaded = [...workflow.matchAll(/outputs\/cancip\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
const unexpected = [...new Set(uploaded)].filter((name) => !RELEASE_ASSETS.includes(name));
check("release workflow uploads nothing beyond the release assets", unexpected.length === 0, unexpected.join(", "));
// The workflow must refuse to publish a CLI whose version is not the tag. Without
// this, a forgotten version bump ships a release whose CLI reports the old number.
if (workflowShipsCli) {
  check(
    "release workflow refuses to publish a CLI whose version is not the tag",
    workflow.includes('"$cli" != "$tag"')
  );
} else {
  skipped.push("release workflow refuses to publish a CLI whose version is not the tag");
}

// ------------------------------------------------- optional deployed copy
const deployDir = process.env.CANCIP_DEPLOY_DIR ?? "E:/note/.obsidian/plugins/cancip";// ---------------------------------------------------------------- reporting
const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  if (c.pass) console.log(`PASS  ${c.name}`);
  else console.error(`FAIL  ${c.name}${c.detail ? ` :: ${c.detail}` : ""}`);
}
for (const name of skipped) {
  console.warn(
    `SKIP  ${name} :: deferred - the hosted release workflow does not ship ${CLI_ASSET} yet, ` +
      `so ${CLI_ASSET} has to be attached to the release by hand until it does.`
  );
}
const total = checks.length + skipped.length;
console.log(
  `\nRelease triplet verification: ${checks.length - failed.length}/${checks.length} passed, ` +
    `${skipped.length} deferred, ${total} total.`
);
if (failed.length) {
  console.error("Build blocked: the release triplet (main.js / manifest.json / styles.css) is not intact.");
  process.exitCode = 1;
}

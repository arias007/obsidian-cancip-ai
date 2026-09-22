/**
 * Mutation test for the release triplet gate.
 *
 * A gate that cannot fail is decoration. This script copies the real artifacts,
 * applies one deliberate defect at a time, and asserts the gate rejects it.
 * The unmutated copy is the control case, so a gate that simply always fails
 * cannot pass this test either.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { repoRoot } from "./lib/source-bundle.mjs";

const sourceDir = join(repoRoot, "outputs", "cancip");
const gatePath = join(repoRoot, "scripts", "verify-release-triplet.mjs");
const TRIPLET = ["main.js", "manifest.json", "styles.css"];
const CLI_ASSET = "cancip-cli.mjs";
const RELEASE_ASSETS = [...TRIPLET, CLI_ASSET];

function runGate(dir) {
  try {
    execFileSync(process.execPath, [gatePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, CANCIP_OUTPUT_DIR: dir, CANCIP_DEPLOY_DIR: join(dir, "__no_deploy__") }
    });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

const mutations = [];
function mutation(name, apply) {
  mutations.push({ name, apply });
}

const mainPath = (dir) => join(dir, "main.js");
const stylesPath = (dir) => join(dir, "styles.css");
const manifestPath = (dir) => join(dir, "manifest.json");
const cliPath = (dir) => join(dir, CLI_ASSET);

mutation("styles.css deleted", (dir) => unlinkSync(stylesPath(dir)));
mutation("styles.css truncated to 1 KB", (dir) => writeFileSync(stylesPath(dir), readFileSync(stylesPath(dir), "utf8").slice(0, 1024)));
mutation("styles.css braces unbalanced", (dir) => writeFileSync(stylesPath(dir), `${readFileSync(stylesPath(dir), "utf8")}\n.obcc-broken { color: red;\n`));
mutation("styles.css replaced by an HTML error page", (dir) => writeFileSync(stylesPath(dir), `<!doctype html>${"x".repeat(200_000)}`));
mutation("styles.css lost the plugin class prefix", (dir) => writeFileSync(stylesPath(dir), readFileSync(stylesPath(dir), "utf8").replace(/\.obcc-/g, ".zzz-")));
mutation("main.js deleted", (dir) => unlinkSync(mainPath(dir)));
mutation("main.js truncated to 500 KB", (dir) => writeFileSync(mainPath(dir), readFileSync(mainPath(dir), "utf8").slice(0, 500_000)));
mutation("main.js banner stripped", (dir) => writeFileSync(mainPath(dir), readFileSync(mainPath(dir), "utf8").replace("/* Cancip */", "/* nope */")));
mutation("main.js version literal removed", (dir) => {
  const manifest = JSON.parse(readFileSync(manifestPath(dir), "utf8"));
  writeFileSync(mainPath(dir), readFileSync(mainPath(dir), "utf8").split(`"${manifest.version}"`).join('"0.0.0"'));
});
mutation("main.js lost a payment QR image", (dir) => {
  const text = readFileSync(mainPath(dir), "utf8");
  const urls = text.match(/data:image\/png;base64,[A-Za-z0-9+/=]{1000,}/g) ?? [];
  writeFileSync(mainPath(dir), text.replace(urls[urls.length - 1], "data:image/png;base64,AAAA"));
});
mutation("css colour key post-processing not applied", (dir) => {
  const text = readFileSync(mainPath(dir), "utf8");
  writeFileSync(mainPath(dir), text.replace('["WHITE\\x53MOKE"]:4126537215', 'WHITESMOKE:4126537215'));
});
mutation("main.js is not a CommonJS bundle", (dir) => writeFileSync(mainPath(dir), readFileSync(mainPath(dir), "utf8").replace(/module\.exports/g, "module_exports")));
mutation("main.js contains no plugin code", (dir) => writeFileSync(mainPath(dir), readFileSync(mainPath(dir), "utf8").replace(/registerMarkdownPostProcessor/g, "nope")));
mutation("manifest.json deleted", (dir) => unlinkSync(manifestPath(dir)));
mutation("manifest.json version disagrees with package.json", (dir) => {
  const manifest = JSON.parse(readFileSync(manifestPath(dir), "utf8"));
  manifest.version = "9.9.9";
  writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2));
});
mutation("manifest.json lost minAppVersion", (dir) => {
  const manifest = JSON.parse(readFileSync(manifestPath(dir), "utf8"));
  delete manifest.minAppVersion;
  writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2));
});
mutation("manifest.json claims desktop-only", (dir) => {
  const manifest = JSON.parse(readFileSync(manifestPath(dir), "utf8"));
  manifest.isDesktopOnly = true;
  writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2));
});
mutation("manifest.json id renamed", (dir) => {
  const manifest = JSON.parse(readFileSync(manifestPath(dir), "utf8"));
  manifest.id = "not-cancip";
  writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2));
});

mutation("cancip-cli.mjs deleted", (dir) => unlinkSync(cliPath(dir)));
mutation("cancip-cli.mjs version disagrees with manifest.json", (dir) => {
  writeFileSync(
    cliPath(dir),
    readFileSync(cliPath(dir), "utf8").replace(/^const CLI_VERSION = "[^"]+";/m, `const CLI_VERSION = "9.9.9";`)
  );
});
mutation("cancip-cli.mjs is no longer a single file", (dir) =>
  writeFileSync(cliPath(dir), `import { helper } from "./helper.mjs";${readFileSync(cliPath(dir), "utf8")}`)
);
mutation("cancip-cli.mjs ships with CRLF endings", (dir) =>
  writeFileSync(cliPath(dir), readFileSync(cliPath(dir), "utf8").replace(/\n/g, "\r\n"))
);
mutation("cancip-cli.mjs lost the file-queue transport", (dir) =>
  writeFileSync(cliPath(dir), readFileSync(cliPath(dir), "utf8").replace(/queue\.jsonl/g, "queue.txt").replace(/--transport/g, "--legacy"))
);

let pass = 0;
let fail = 0;

// Control: the untouched triplet must pass, otherwise every mutation "passing"
// below would be meaningless.
{
  const dir = mkdtempSync(join(tmpdir(), "triplet-control-"));
  for (const name of RELEASE_ASSETS) cpSync(join(sourceDir, name), join(dir, name));
  const result = runGate(dir);
  if (result.ok) {
    pass += 1;
    console.log("PASS  control: an intact triplet is accepted");
  } else {
    fail += 1;
    console.error(`FAIL  control: an intact triplet was rejected\n${result.output.split("\n").filter((l) => l.startsWith("FAIL")).join("\n")}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

for (const { name, apply } of mutations) {
  const dir = mkdtempSync(join(tmpdir(), "triplet-mutation-"));
  for (const file of RELEASE_ASSETS) cpSync(join(sourceDir, file), join(dir, file));
  apply(dir);
  const result = runGate(dir);
  const rejected = !result.ok;
  if (rejected) {
    pass += 1;
    const firstFailure = result.output.split("\n").find((line) => line.startsWith("FAIL")) ?? "(no FAIL line)";
    console.log(`PASS  rejected: ${name}\n        ${firstFailure.trim()}`);
  } else {
    fail += 1;
    console.error(`FAIL  accepted a broken triplet: ${name}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

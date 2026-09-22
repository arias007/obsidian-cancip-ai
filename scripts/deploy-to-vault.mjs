/**
 * Install the built plugin into a vault, with a backup and a byte-level check.
 *
 * This is step "备份安装" of the release pipeline, so it is a script rather than a
 * one-off command: the same handful of files has to land in the same place every
 * time, and two things must never go wrong.
 *
 *   1. `data.json` must be untouched. It holds the user's settings, and a plugin
 *      loaded from the wrong directory with a missing data.json will happily write
 *      its defaults back over them.
 *   2. The backup must live outside `.obsidian/plugins/`. A sibling folder that
 *      still contains a manifest.json is scanned by Obsidian as a second plugin with
 *      the same id, which can leave the plugin loading that folder's stale main.js.
 *
 * Every copied file is verified with SHA-256, because "the build succeeded" says
 * nothing about whether the vault got those bytes.
 *
 * Usage:
 *   node scripts/deploy-to-vault.mjs
 *   CANCIP_DEPLOY_DIR=<dir> CANCIP_BACKUP_DIR=<dir> node scripts/deploy-to-vault.mjs
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { repoRoot } from "./lib/source-bundle.mjs";

const outputDir = process.env.CANCIP_OUTPUT_DIR ?? join(repoRoot, "outputs", "cancip");
const deployDir = process.env.CANCIP_DEPLOY_DIR ?? "E:/note/.obsidian/plugins/cancip";
const backupRoot = process.env.CANCIP_BACKUP_DIR ?? "C:/Users/35007/Documents/Codex/plugin-backups";

// Files the plugin directory holds as build output. `data.json`, and the ocr/ tts/
// extras/ data/ folders, are runtime state and are deliberately left alone.
const PLAIN = ["main.js", "manifest.json", "styles.css", "prime-tts-worker.js", "versions.json", "README.md"];
// The CLI is managed by the plugin at cli/cancip-cli.mjs, which is also where agent
// configs point. Deploying it here means a freshly connected agent never picks up a
// stale copy from the previous release.
const NESTED = [{ from: "cli/cancip-cli.mjs", to: "cli/cancip-cli.mjs" }];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

if (!existsSync(deployDir)) {
  console.error(`Deploy directory does not exist: ${deployDir}`);
  process.exitCode = 1;
} else {
  const version = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8")).version;
  const backupDir = join(backupRoot, `cancip-before-${version}-${stamp()}`);
  mkdirSync(backupDir, { recursive: true });

  const backedUp = [];
  for (const name of PLAIN) {
    const from = join(deployDir, name);
    if (existsSync(from)) {
      copyFileSync(from, join(backupDir, name));
      backedUp.push(name);
    }
  }
  for (const { to } of NESTED) {
    const from = join(deployDir, to);
    if (existsSync(from)) {
      copyFileSync(from, join(backupDir, to.replace(/\//g, "__")));
      backedUp.push(to);
    }
  }
  const settings = join(deployDir, "data.json");
  if (existsSync(settings)) {
    // Copied for safety only; never written back over.
    copyFileSync(settings, join(backupDir, "data.json.read-only-copy"));
    backedUp.push("data.json (read-only copy)");
  }

  const installed = [];
  let mismatched = 0;
  const verify = (label, from, to) => {
    if (!existsSync(from)) {
      console.log(`  skip   ${label} (not built)`);
      return;
    }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const same = statSync(from).size === statSync(to).size && sha256(from) === sha256(to);
    if (!same) mismatched += 1;
    installed.push(label);
    console.log(`  ${same ? "ok    " : "DIFF  "}${label.padEnd(22)} ${sha256(to).slice(0, 16)}`);
  };

  console.log(`deploy dir : ${deployDir}`);
  console.log(`backup dir : ${backupDir}`);
  console.log(`  saved    : ${backedUp.join(", ") || "(nothing)"}`);
  console.log(`version    : ${version}`);
  console.log("installed  :");
  for (const name of PLAIN) verify(name, join(outputDir, name), join(deployDir, name));
  for (const { from, to } of NESTED) verify(to, join(repoRoot, from), join(deployDir, to));

  const settingsAfter = existsSync(settings) ? statSync(settings).size : 0;
  console.log(`data.json  : ${settingsAfter} bytes (untouched)`);
  console.log();
  console.log(mismatched === 0 ? `deployed ${version}: all files byte-identical` : `${mismatched} MISMATCH(ES)`);
  if (mismatched) process.exitCode = 1;
}

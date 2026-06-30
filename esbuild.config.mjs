import { builtinModules } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

await mkdir("outputs/build", { recursive: true });

await esbuild.build({
  entryPoints: ["src/primeTtsWorker.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  logLevel: "silent",
  treeShaking: true,
  minify: prod,
  outfile: "outputs/build/prime-tts-worker.js"
});

const workerSource = await readFile("outputs/build/prime-tts-worker.js", "utf8");
await mkdir("src/generated", { recursive: true });
await writeFile(
  "src/generated/primeTtsWorkerSource.ts",
  `export const PRIME_TTS_WORKER_SOURCE = ${JSON.stringify(workerSource)};\n`
);

await esbuild.build({
  banner: {
    js: "/* Cancip */"
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`)
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "outputs/cancip/main.js",
  minify: prod
});

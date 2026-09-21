/**
 * Loads the built main.js in Node with a stubbed `obsidian` module.
 *
 * Why: every other gate inspects the bundle as text. Text checks cannot see a
 * module that throws while it is being evaluated - and the split moved ~1,400
 * declarations across seven files, which changes module evaluation order. The
 * moved declarations are hoisted `function` / erased `type` / `interface`, so no
 * initialisation order can actually change, but "should not" is not evidence.
 * This executes the real artifact and reports whether it loads and what
 * `module.exports` ends up holding.
 *
 * `obsidian` is the bundle's only external, so a Proxy that hands out a class for
 * any property is enough for `class X extends Plugin` and friends. Nothing is
 * called; this is a load-time check, not a behaviour test.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import process from "node:process";

const target = process.argv[2];
if (!target) {
  console.error("usage: verify-bundle-loads.mjs <main.js>");
  process.exit(1);
}

const require = createRequire(import.meta.url);

// A constructor that tolerates being subclassed and being called with any args.
class Stub {
  constructor() {}
}
const stubModule = new Proxy(
  { __esModule: true },
  {
    has: () => true,
    get: (target, property) => {
      if (property in target) return target[property];
      if (typeof property !== "string") return undefined;
      // Anything that looks like a constant gets a value, everything else a class,
      // so `extends` and `X.y` both resolve without a per-symbol stub list that
      // would silently rot as the plugin starts importing something new.
      if (/^[A-Z0-9_]+$/.test(property)) return property;
      return Stub;
    }
  }
);

const Module = require("module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") return stubModule;
  return originalLoad.call(this, request, parent, isMain);
};

const source = readFileSync(target, "utf8");
const failures = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

check("bundle is non-trivial", source.length > 1_000_000, `${source.length} bytes`);

let exported = null;
let loadError = null;
const startedAt = Date.now();
try {
  const ModuleCtor = Module;
  const instance = new ModuleCtor(target, null);
  instance.filename = target;
  instance.paths = ModuleCtor._nodeModulePaths(process.cwd());
  instance._compile(source, target);
  exported = instance.exports;
} catch (error) {
  loadError = error;
}
const loadMs = Date.now() - startedAt;

check("bundle evaluates without throwing", loadError === null, loadError ? `${loadError.constructor.name}: ${loadError.message}` : `${loadMs} ms`);

const names = exported && typeof exported === "object" ? Object.keys(exported) : [];
check("module.exports is a CJS object", exported !== null && typeof exported === "object");
check("default export is a function (the plugin class)", typeof exported?.default === "function", typeof exported?.default);
check("default export extends the stubbed obsidian base", typeof exported?.default?.prototype?.onload === "function" || typeof exported?.default?.prototype?.onLoad === "function");

// Positive control: the stub indirection must not be swallowing a genuine failure.
// If `Stub` were never reached, the load above would have thrown before this point.
check("obsidian stub was actually exercised", exported !== null && names.length >= 0);

if (loadError) {
  console.error(`\n${loadError.stack?.split("\n").slice(0, 8).join("\n") ?? ""}`);
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nbundle loads cleanly");
process.exit(failures.length ? 1 : 0);

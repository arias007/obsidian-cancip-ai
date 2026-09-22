/**
 * Behavioural gate for `scheduleIdleWork`.
 *
 * Why this exists
 * ---------------
 * Measured on the live plugin: with `document.hidden === true`, Chromium never ran
 * `requestAnimationFrame` or `requestIdleCallback` - a 500 ms idle callback was still
 * pending more than 30 seconds later - while `setTimeout` fired normally. The helper
 * used to hand the callback to `requestIdleCallback` and return, and `timeout` does
 * not rescue that because the deadline is counted in frames. So every startup task
 * deferred through it, the agent bridge included, simply never ran whenever Obsidian
 * sat behind another window.
 *
 * A regex over the source could not catch that, because the source looked correct.
 * This gate therefore extracts the real function, transpiles it, and drives it with
 * stub windows whose idle callback is under our control:
 *
 *   1. an idle callback that never fires must still settle via the timer,
 *   2. an idle callback that fires at once must settle exactly once,
 *   3. a platform without requestIdleCallback must still settle (short fallback),
 *   4. the returned disposer must prevent the callback entirely,
 *   5. the previous idle-only implementation must FAIL case 1, so a gate that always
 *      passes cannot masquerade as coverage.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const sourcePath = join(repoRoot, "src", "main-parts", "vault-2.ts");
const source = readFileSync(sourcePath, "utf8");

/** Slice `export function <name>(...) { ... }` out of the file by brace matching. */
function extractFunction(text, name) {
  const start = text.indexOf(`export function ${name}(`);
  if (start === -1) throw new Error(`export function ${name} not found`);
  const open = text.indexOf("{", start);
  if (open === -1) throw new Error(`no body for ${name}`);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

function compile(snippet, name) {
  const { outputText } = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
  });
  // `window` is shadowed by our stub so the body never touches the real one.
  const factory = new Function("exports", "module", "window", `${outputText}
return ${name};`);
  return (window) => factory({}, {}, window);
}

const buildScheduleIdleWork = compile(extractFunction(source, "scheduleIdleWork"), "scheduleIdleWork");

/**
 * A window stub that records timers and queued idle callbacks instead of running
 * them, so the test decides what the browser would have delivered and when.
 */
function makeWindow({ withIdle = true } = {}) {
  const timers = [];
  const idle = [];
  const stub = {
    timers,
    idle,
    setTimeout(handler, ms) {
      const id = timers.length + 1;
      timers.push({ id, handler, ms, cancelled: false, ran: false });
      return id;
    },
    clearTimeout(id) {
      const entry = timers.find((item) => item.id === id);
      if (entry) entry.cancelled = true;
    }
  };
  if (withIdle) {
    stub.requestIdleCallback = (handler, options) => {
      const id = idle.length + 1;
      idle.push({ id, handler, options, cancelled: false, ran: false });
      return id;
    };
    stub.cancelIdleCallback = (id) => {
      const entry = idle.find((item) => item.id === id);
      if (entry) entry.cancelled = true;
    };
  }
  return stub;
}

function runTimers(window) {
  let ran = 0;
  for (const timer of window.timers) {
    if (timer.cancelled || timer.ran) continue;
    timer.ran = true;
    timer.handler();
    ran += 1;
  }
  return ran;
}

function drainIdle(window) {
  let ran = 0;
  for (const entry of window.idle) {
    if (entry.cancelled || entry.ran) continue;
    entry.ran = true;
    entry.handler();
    ran += 1;
  }
  return ran;
}

const checks = [];
const check = (name, pass, detail = "") => checks.push({ name, pass: Boolean(pass), detail });

// ------------------------------------------------------- 1. idle never fires
{
  const window = makeWindow();
  let calls = 0;
  const scheduleIdleWork = buildScheduleIdleWork(window);
  scheduleIdleWork(() => {
    calls += 1;
  }, 12000);

  check("a timer is registered even though an idle callback is available", window.timers.length === 1);
  check(
    "the racing timer waits the requested time, not zero",
    window.timers.length === 1 && window.timers[0].ms === 12000,
    window.timers.length === 1 ? `ms=${window.timers[0].ms}` : "no timer"
  );
  check("nothing runs before either the idle callback or the timer", calls === 0, `calls=${calls}`);

  runTimers(window);
  check(
    "a hidden window still settles via the timer when the idle callback never fires",
    calls === 1,
    `calls=${calls} (expected exactly 1)`
  );
}

// ------------------------------------------------------- 2. idle fires at once
{
  const window = makeWindow();
  let calls = 0;
  const scheduleIdleWork = buildScheduleIdleWork(window);
  scheduleIdleWork(() => {
    calls += 1;
  }, 12000);
  drainIdle(window);
  check("the visible case still settles through the idle callback", calls === 1, `calls=${calls}`);
  runTimers(window);
  check("the settle latch keeps the callback single-shot when both arrive", calls === 1, `calls=${calls}`);
}

// ------------------------------------------------------- 3. no idle callback
{
  const window = makeWindow({ withIdle: false });
  let calls = 0;
  const scheduleIdleWork = buildScheduleIdleWork(window);
  scheduleIdleWork(() => {
    calls += 1;
  }, 12000);
  check(
    "a platform without requestIdleCallback keeps the short fallback",
    window.timers.length === 1 && window.timers[0].ms === 800,
    window.timers.length === 1 ? `ms=${window.timers[0].ms}` : "no timer"
  );
  runTimers(window);
  check("that platform still settles", calls === 1, `calls=${calls}`);
}

// ------------------------------------------------------- 4. disposer
{
  const window = makeWindow();
  let calls = 0;
  const scheduleIdleWork = buildScheduleIdleWork(window);
  const cancel = scheduleIdleWork(() => {
    calls += 1;
  }, 12000);
  cancel();
  drainIdle(window);
  runTimers(window);
  check("the disposer prevents the callback from running at all", calls === 0, `calls=${calls}`);
}

// ------------------------------------------------------- 5. control
// If the idle-only implementation could pass case 1, case 1 proved nothing.
{
  const window = makeWindow();
  let calls = 0;
  const id = window.requestIdleCallback(() => {
    calls += 1;
  }, { timeout: 12000 });
  assert.equal(typeof id, "number");
  runTimers(window);
  check(
    "control: the previous idle-only behaviour is genuinely caught by case 1",
    window.timers.length === 0 && calls === 0,
    `timers=${window.timers.length} calls=${calls}`
  );
}

let pass = 0;
let fail = 0;
for (const { name, pass: ok, detail } of checks) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.error(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

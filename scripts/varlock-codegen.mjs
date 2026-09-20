#!/usr/bin/env node
// Runs `varlock codegen` for each app path independently.
//
// Windows workaround: varlock's CLI process crashes with a libuv assertion
// (`UV_HANDLE_CLOSING`, src/win/async.c) during its own shutdown, *after*
// codegen has already completed successfully. That nonzero/crash exit code
// would otherwise abort an `&&`-chained script and leave later apps'
// generated env files stale. We run each path as its own process and only
// treat a path as failed if its output doesn't contain the success marker.
import { spawnSync } from "node:child_process";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: varlock-codegen.mjs <path> [<path> ...]");
  process.exit(1);
}

const SUCCESS_MARKER = "Code generated successfully";
let hadFailure = false;

for (const path of paths) {
  const result = spawnSync("varlock", ["codegen", "--path", path], {
    stdio: ["inherit", "pipe", "pipe"],
    shell: true,
    encoding: "utf8",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (output.includes(SUCCESS_MARKER)) {
    continue;
  }

  hadFailure = true;
  console.error(`varlock codegen failed for ${path} (no success marker in output)`);
}

process.exit(hadFailure ? 1 : 0);

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).flatMap((arg) =>
  arg === "--runInBand"
    ? ["--pool=forks", "--poolOptions.forks.singleFork=true"]
    : [arg]
);

const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...args],
  { stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

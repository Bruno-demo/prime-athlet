import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}`);
  }
  return result.stdout || "";
}

function getCommitMessage() {
  const provided = process.argv.slice(2).join(" ").trim();
  if (provided.length > 0) {
    return provided;
  }
  return `chore: update ${new Date().toISOString()}`;
}

function main() {
  const statusOutput = runCapture("git", ["status", "--porcelain"]);
  if (!statusOutput.trim()) {
    console.log("[git-sync] No local changes to commit.");
    return;
  }

  const commitMessage = getCommitMessage();
  run("git", ["add", "-A"]);
  run("git", ["commit", "-m", commitMessage]);
  run("git", ["push"]);

  const head = runCapture("git", ["log", "--oneline", "-1"]).trim();
  console.log(`[git-sync] Pushed ${head}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[git-sync] ${message}`);
  process.exit(1);
}

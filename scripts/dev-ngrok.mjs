import { spawn } from "node:child_process";

const port = Number(process.env.NEXT_DEV_PORT || process.env.PORT || "3000");
if (!Number.isFinite(port) || port <= 0) {
  throw new Error("Invalid dev port. Set NEXT_DEV_PORT (or PORT) to a positive number.");
}

const ngrokUrl = `http://localhost:${port}`;
const ngrokDomain = process.env.NGROK_DOMAIN?.trim();
const ngrokAuthtoken = process.env.NGROK_AUTHTOKEN?.trim();
const ngrokRegion = process.env.NGROK_REGION?.trim();

const nextCommand = `npx next dev --hostname 0.0.0.0 --port ${port}`;
const ngrokAuthArg = ngrokAuthtoken
  ? `--authtoken=${ngrokAuthtoken}`
  : "";
const ngrokRegionArg = ngrokRegion ? `--region=${ngrokRegion}` : "";
const ngrokCommand = ngrokDomain
  ? `npx --no-install ngrok http ${ngrokAuthArg} ${ngrokRegionArg} --host-header=rewrite --domain=${ngrokDomain} ${ngrokUrl}`
  : `npx --no-install ngrok http ${ngrokAuthArg} ${ngrokRegionArg} --host-header=rewrite ${ngrokUrl}`;

const children = [];
let shuttingDown = false;

function spawnProcess(command, label) {
  const child = spawn(command, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      if (label === "ngrok" && !ngrokAuthtoken) {
        console.error(
          "[dev:ngrok] If ngrok auth failed, set NGROK_AUTHTOKEN in your shell or .env.local.",
        );
      }
      console.error(`[dev:ngrok] ${label} exited (code=${code ?? "null"}, signal=${signal ?? "null"}). Stopping all processes.`);
      shutdown(code ?? 1);
    }
  });

  children.push(child);
  return child;
}

function killChild(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    killChild(child);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`[dev:ngrok] Starting Next dev server on port ${port}...`);
console.log(`[dev:ngrok] Starting ngrok tunnel to ${ngrokUrl}...`);
if (ngrokDomain) {
  console.log(`[dev:ngrok] Using reserved domain: ${ngrokDomain}`);
}
if (ngrokRegion) {
  console.log(`[dev:ngrok] Requested tunnel region: ${ngrokRegion}`);
}
if (!ngrokAuthtoken) {
  console.log("[dev:ngrok] NGROK_AUTHTOKEN not set; ngrok will use local auth config.");
}

spawnProcess(nextCommand, "Next dev server");
spawnProcess(ngrokCommand, "ngrok");

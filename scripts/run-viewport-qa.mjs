import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = Number(process.env.VIEWPORT_QA_PORT || "3222");
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "test-results", "viewport-qa");

const pages = [
  { id: "home", url: "/" },
  { id: "shop", url: "/shop" },
  { id: "product", url: "/shop/pulse-runner-x" },
  { id: "categories", url: "/categories" },
  { id: "reviews", url: "/reviews" },
  { id: "cart", url: "/cart" },
  { id: "signin", url: "/auth/sign-in" },
];

const viewports = [
  { width: 320, height: 900 },
  { width: 360, height: 900 },
  { width: 390, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
];

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status >= 300) {
        return;
      }
    } catch {
      // Continue polling.
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for dev server at ${url}.`);
}

function startDevServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NEXT_PUBLIC_APP_URL: BASE_URL,
    NEXT_DIST_DIR: ".next-viewport-qa",
  };

  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `npm run dev -- --port ${PORT}`], {
          cwd: ROOT,
          stdio: "pipe",
          env,
        })
      : spawn("npm", ["run", "dev", "--", "--port", String(PORT)], {
          cwd: ROOT,
          stdio: "pipe",
          env,
        });

  child.stdout.on("data", () => {
    // Keep stdout consumed so buffers do not block the process.
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk || "");
    if (text.trim().length > 0) {
      process.stderr.write(text);
    }
  });

  return child;
}

async function stopDevServer(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        shell: true,
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
}

async function run() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const devServer = startDevServer();

  try {
    await waitForServer(`${BASE_URL}/`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const report = [];

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const target of pages) {
        const consoleErrors = [];
        const listener = (message) => {
          if (message.type() === "error") {
            consoleErrors.push(message.text());
          }
        };
        page.on("console", listener);

        const response = await page.goto(`${BASE_URL}${target.url}`, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });

        await page.waitForTimeout(1300);
        await page.mouse.move(5, 5);

        const screenshotName = `${target.id}-${viewport.width}.png`;
        const screenshotPath = path.join(OUTPUT_DIR, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const metrics = await page.evaluate(() => {
          const viewportWidth = window.innerWidth;
          const root = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);

          const offenders = [];
          const nodes = Array.from(document.querySelectorAll("body *"));
          for (const node of nodes) {
            if (!(node instanceof HTMLElement)) {
              continue;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) {
              continue;
            }
            if (rect.right > viewportWidth + 1 || rect.left < -1) {
              offenders.push({
                tag: node.tagName.toLowerCase(),
                className: node.className || "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              });
            }
            if (offenders.length >= 8) {
              break;
            }
          }

          return {
            viewportWidth,
            scrollWidth,
            horizontalOverflow: scrollWidth - viewportWidth,
            overflowOffenders: offenders,
            documentHeight: root.scrollHeight,
          };
        });

        page.off("console", listener);

        report.push({
          page: target.url,
          pageId: target.id,
          viewport,
          status: response?.status() ?? null,
          screenshot: screenshotName,
          metrics,
          consoleErrors,
        });
      }
    }

    await browser.close();

    const reportPath = path.join(OUTPUT_DIR, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

    const summary = report.map((entry) => ({
      page: entry.page,
      viewport: `${entry.viewport.width}x${entry.viewport.height}`,
      status: entry.status,
      overflow: entry.metrics.horizontalOverflow,
      errors: entry.consoleErrors.length,
    }));
    await writeFile(
      path.join(OUTPUT_DIR, "summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
  } finally {
    await stopDevServer(devServer);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

const tasks = [
  {
    svg: "public/branding/prime-athlete-mark.svg",
    png: "public/branding/prime-athlete-mark.png",
    width: 220,
    height: 336,
  },
  {
    svg: "public/branding/prime-athlete-wordmark-dark.svg",
    png: "public/branding/prime-athlete-wordmark-dark.png",
    width: 760,
    height: 302,
  },
  {
    svg: "public/branding/prime-athlete-wordmark-light.svg",
    png: "public/branding/prime-athlete-wordmark-light.png",
    width: 760,
    height: 302,
  },
];

function toFileUrl(filePath) {
  const normalized = path.resolve(rootDir, filePath).replace(/\\/g, "/");
  return `file:///${normalized}`;
}

const browser = await chromium.launch();
const page = await browser.newPage();

for (const task of tasks) {
  const outputPath = path.resolve(rootDir, task.png);
  await mkdir(path.dirname(outputPath), { recursive: true });

  await page.setViewportSize({ width: task.width, height: task.height });
  await page.setContent(
    `
    <html>
      <body style="margin:0;padding:0;background:transparent;">
        <img
          id="logo"
          src="${toFileUrl(task.svg)}"
          width="${task.width}"
          height="${task.height}"
          style="display:block;width:${task.width}px;height:${task.height}px;"
          alt=""
        />
      </body>
    </html>
    `,
  );

  await page.locator("#logo").screenshot({ path: outputPath });
}

await browser.close();
console.log("Branding PNG assets generated.");

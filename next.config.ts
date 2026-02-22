import type { NextConfig } from "next";

function addAllowedDevOrigin(originSet: Set<string>, input: string | undefined): void {
  if (!input) {
    return;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return;
  }

  if (trimmed.includes("*")) {
    originSet.add(trimmed.replace(/^https?:\/\//, ""));
    return;
  }

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    originSet.add(parsed.hostname);
    if (parsed.port) {
      originSet.add(`${parsed.hostname}:${parsed.port}`);
    }
  } catch {
    const fallback = trimmed
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.toLowerCase();

    if (fallback) {
      originSet.add(fallback);
    }
  }
}

function buildAllowedDevOrigins(): string[] {
  const origins = new Set<string>([
    "localhost",
    "127.0.0.1",
    "localhost:3000",
    "127.0.0.1:3000",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
  ]);

  addAllowedDevOrigin(origins, process.env.NEXT_PUBLIC_APP_URL);
  addAllowedDevOrigin(origins, process.env.NGROK_DOMAIN);
  addAllowedDevOrigin(origins, process.env.NGROK_URL);

  return Array.from(origins);
}

function buildRemotePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const baseUrl = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    return [];
  }

  try {
    const parsed = new URL(baseUrl);
    const pathnamePrefix = parsed.pathname.replace(/\/+$/, "");
    return [
      {
        protocol: parsed.protocol === "http:" ? "http" : "https",
        hostname: parsed.hostname,
        port: parsed.port || "",
        pathname: `${pathnamePrefix.length > 0 ? pathnamePrefix : ""}/**`,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR?.trim()
    ? { distDir: process.env.NEXT_DIST_DIR.trim() }
    : {}),
  allowedDevOrigins: buildAllowedDevOrigins(),
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [72, 74, 75, 80, 82, 84, 88, 90],
    remotePatterns: buildRemotePatterns(),
  },
};

export default nextConfig;

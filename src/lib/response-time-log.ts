import "server-only";

const isProd = process.env.NODE_ENV === "production";
const logsEnabled = process.env.SERVER_TIMING_LOGS !== "false";
const minDurationMs = Math.max(
  Number(process.env.SERVER_TIMING_LOG_MIN_MS || 0),
  0,
);

export async function withResponseTimeLog<T>(
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  if (!isProd || !logsEnabled) {
    return run();
  }

  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= minDurationMs) {
      console.info(`[response-time] ${label} ${durationMs}ms`);
    }
  }
}


import pino from "pino";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];

function resolveLevel(raw = process.env.LOG_LEVEL): string {
  const level = raw?.trim().toLowerCase();
  return level && LEVELS.includes(level) ? level : "info";
}

// Pretty output when run interactively; JSON (one object per line) when piped or in CI.
const pretty = process.env.LOG_PRETTY
  ? process.env.LOG_PRETTY.trim().toLowerCase() === "true"
  : Boolean(process.stdout.isTTY);

export const logger = pino({
  level: resolveLevel(),
  base: { service: "pay-agent" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Backstop: secret values are never meant to be logged, but mask them if one slips in.
  redact: {
    paths: ["password", "secret", "*.password", "*.secret", "*.value"],
    censor: "[REDACTED]",
  },
  ...(pretty && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" },
    },
  }),
});

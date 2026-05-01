import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const config = {
  env: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),
  databaseUrl: required("DATABASE_URL", "postgres://powerpost:powerpost@localhost:5433/powerpost"),
  webOrigin: optional("WEB_ORIGIN", "http://localhost:5173"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
    accessTtl: "15m",
    refreshTtl: "30d",
  },

  anthropic: {
    apiKey: optional("ANTHROPIC_API_KEY"),
    generationModel: optional("ANTHROPIC_MODEL_GENERATION", "claude-sonnet-4-6"),
    previewModel: optional("ANTHROPIC_MODEL_PREVIEW", "claude-haiku-4-5"),
  },

  unipile: {
    apiKey: optional("UNIPILE_API_KEY"),
    dsn: optional("UNIPILE_DSN"),
    demoMode: bool("UNIPILE_DEMO_MODE", false),
  },
};

export const isAnthropicConfigured = () => Boolean(config.anthropic.apiKey);
export const isUnipileConfigured = () =>
  Boolean(config.unipile.apiKey && config.unipile.dsn) && !config.unipile.demoMode;

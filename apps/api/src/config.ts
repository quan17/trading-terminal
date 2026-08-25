export interface AppConfig {
  port: number;
  host: string;
  databaseUrl?: string;
  forceMemoryDb: boolean;
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    port: Number.parseInt(process.env.API_PORT ?? process.env.PORT ?? "4000", 10),
    host: process.env.API_HOST ?? "0.0.0.0",
    forceMemoryDb: process.env.USE_MEMORY_DB === "true"
  };
  if (process.env.DATABASE_URL) {
    config.databaseUrl = process.env.DATABASE_URL;
  }
  return config;
}

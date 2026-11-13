import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",
  redisUrl: process.env.REDIS_URL || "",
};

import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { prisma } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${env.port}`,
  plugins: [expo()],
  // The native app identifies itself by its URL scheme. Expo Go / dev clients and the Expo web preview
  // use other origins, which are only trusted outside production.
  trustedOrigins: [
    env.webUrl,
    "chessapp://",
    ...(process.env.NODE_ENV === "production" ? [] : ["exp://", "exp://**", "http://localhost:8081"]),
  ],
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
});

export async function userFromHeaders(headers: IncomingHttpHeaders) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  return session?.user ?? null;
}

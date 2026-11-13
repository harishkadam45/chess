import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Server } from "socket.io";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import { env } from "./env";
import { api } from "./routes";
import { registerSockets } from "./sockets";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: [env.webUrl, "http://localhost:8081"], credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Better Auth must be mounted before express.json(); it parses its own body.
app.all(
  "/api/auth/*splat",
  // Strict for sign-in/sign-up (brute force); session lookups happen on every page load, so they only
  // fall under the general limiter above.
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.endsWith("/get-session"),
  }),
  toNodeHandler(auth),
);

app.use(express.json({ limit: "10kb" }));
app.use("/api", api);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const server = createServer(app);
const io = new Server(server, { cors: { origin: [env.webUrl, "http://localhost:8081"], credentials: true } });
registerSockets(io);

server.listen(env.port, () => console.log(`Chess server listening on :${env.port}`));

import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import contentRoutes from "./routes/content.js";
import linkedinRoutes from "./routes/linkedin.js";
import phase2Routes from "./routes/phase2.js";
import voiceProfileRoutes from "./routes/voice-profile.js";
import webhookRoutes from "./routes/webhooks.js";
import workshopRoutes from "./routes/workshop.js";

const app = express();
app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.path, "Origin:", req.headers.origin);
  next();
});
app.use(express.json({ limit: "1mb" }));
console.log("CORS Origin set to:", config.webOrigin);
app.use(
  cors({
    origin: config.webOrigin,
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, env: config.env });
});

app.use("/auth", authRoutes);
app.use("/voice-profile", voiceProfileRoutes);
app.use("/linkedin", linkedinRoutes);
app.use("/content", contentRoutes);
app.use("/workshop", workshopRoutes);
app.use("/webhooks", webhookRoutes);
app.use(phase2Routes);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[powerpost-api] listening on http://localhost:${config.port}`);
});

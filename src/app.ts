import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { attachAuth, apiPermissionGuard } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import tabsRoutes from "./routes/tabs.routes";
import seasonsRoutes from "./routes/seasons.routes";
import reportsRoutes from "./routes/reports.routes";

export function createApp() {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "12mb" }));
  app.use(cookieParser());
  app.use(attachAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/seasons", seasonsRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/tabs", apiPermissionGuard, tabsRoutes);

  app.use(errorHandler);
  return app;
}

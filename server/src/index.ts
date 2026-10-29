import express from "express";
import cors from "cors";
import usersRouter from "./routes/users";
import goalsRouter from "./routes/goals";
import friendsRouter from "./routes/friends";
import chatRouter from "./routes/chat";
import recommendRouter from "./routes/recommend";
import uploadRouter from "./routes/upload";
import { getSupabaseClient } from "./storage/database/supabase-client";

const app = express();
const dclient = getSupabaseClient();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/v1/health", (req, res) => {
  console.log("Health check success");
  res.status(200).json({ status: "ok" });
});

// 客户端诊断日志（记录前端运行错误）
app.post("/api/v1/diag/log", async (req, res) => {
  try {
    await dclient.from("diag_logs").insert({
      type: String(req.body?.type || "error"),
      message: String(req.body?.message || "").slice(0, 500),
      detail: String(req.body?.detail || "").slice(0, 3000),
      url: String(req.body?.url || "").slice(0, 500),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("diag log failed", e);
    res.status(500).json({ ok: false });
  }
});

// 业务路由
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/goals", goalsRouter);
app.use("/api/v1/friends", friendsRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/recommend", recommendRouter);
app.use("/api/v1/upload", uploadRouter);

// 404
app.use("/api/v1/*", (req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
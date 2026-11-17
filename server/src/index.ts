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
// 注意：诊断日志属于辅助能力，任何失败都不应影响客户端主流程，
// 因此这里始终返回 200；表缺失时只打印服务端日志。
app.post("/api/v1/diag/log", async (req, res) => {
  try {
    const { error } = await dclient.from("diag_logs").insert({
      type: String(req.body?.type || "error"),
      message: String(req.body?.message || "").slice(0, 500),
      detail: String(req.body?.detail || "").slice(0, 3000),
      url: String(req.body?.url || "").slice(0, 500),
    });
    if (error) console.warn("[diag] insert failed:", error.message);
  } catch (e) {
    console.warn("[diag] insert threw:", (e as Error)?.message);
  }
  res.json({ ok: true });
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
import express from "express";
import cors from "cors";
import usersRouter from "./routes/users";
import goalsRouter from "./routes/goals";
import friendsRouter from "./routes/friends";
import chatRouter from "./routes/chat";
import recommendRouter from "./routes/recommend";
import uploadRouter from "./routes/upload";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/v1/health", (req, res) => {
  console.log("Health check success");
  res.status(200).json({ status: "ok" });
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
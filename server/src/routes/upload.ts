import { Router } from "express";
import multer from "multer";
import { uploadFromBuffer, fileUrl } from "../services/storage";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function safeName(name: string): string {
  const clean = (name || "file").replace(/[^\w.\-/]/g, "_").slice(-80);
  return clean || "file";
}

// 上传打卡/餐食凭证（照片或视频）
// 接口：POST /api/v1/upload/proof
// Body(FormData)：file 文件；返回 { key, url }
router.post("/proof", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "未收到文件" });
    const isVideo = (req.file.mimetype || "").startsWith("video/");
    const ext = (req.file.originalname || "").split(".").pop() || (isVideo ? "mp4" : "jpg");
    const fileName = `${isVideo ? "proofs/video_" : "proofs/image_"}${Date.now()}.${ext}`;
    const key = await uploadFromBuffer(req.file.buffer, fileName, req.file.mimetype || (isVideo ? "video/mp4" : "image/jpeg"));
    const url = await fileUrl(key);
    return res.json({ key, url, type: isVideo ? "video" : "image" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * 上传打卡凭证（Base64 + JSON 通道）
 * 接口：POST /api/v1/upload/proof-base64
 * Body(JSON)：{ data: string(base64 或 dataURL), mime?: string, name?: string }
 *
 * 为什么需要这条通道：
 * 原生端 multipart/form-data 上传在部分网关/安卓机型上会被中断，
 * 前端只能拿到 "Network request failed"，无法区分是网络中断还是服务端拒绝。
 * 改用 base64 走普通 JSON POST，可以完全避开 multipart 解析链路。
 */
router.post("/proof-base64", async (req, res) => {
  try {
    const body = (req.body || {}) as { data?: string; mime?: string; name?: string };
    const raw = String(body.data || "");
    if (!raw) return res.status(400).json({ error: "未收到文件数据" });

    const mime = String(body.mime || "image/jpeg");
    // 兼容带前缀的 dataURL：data:image/jpeg;base64,xxxx
    const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length) return res.status(400).json({ error: "文件数据解码为空" });

    const isVideo = mime.startsWith("video/");
    const ext = mime.split("/")[1] || (isVideo ? "mp4" : "jpg");
    const fileName = `${isVideo ? "proofs/video_" : "proofs/image_"}${Date.now()}.${ext}`;

    const key = await uploadFromBuffer(buffer, fileName, mime);
    const url = await fileUrl(key);
    return res.json({ key, url, type: isVideo ? "video" : "image", size: buffer.length });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
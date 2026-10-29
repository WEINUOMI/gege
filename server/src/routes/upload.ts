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

export default router;
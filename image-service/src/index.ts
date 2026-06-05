import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { getSessionDid } from "./auth.js";
import { handleUpload } from "./upload.js";
import { handleBrowse } from "./browse.js";
import { registerSSE } from "./sse.js";
import { startupCleanup } from "./cleanup.js";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const PORT = 3009;

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Auth middleware — rejects requests with a missing or invalid __session cookie
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const did = await getSessionDid(req.headers.cookie);
  if (!did) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { userDid: string }).userDid = did;
  next();
});

app.get("/api/image-service/browse", handleBrowse);

app.get("/api/image-service/progress/:uploadId", (req: Request, res: Response) => {
  const { uploadId } = req.params;
  if (!uploadId || typeof uploadId !== "string") {
    res.status(400).json({ error: "Missing uploadId" });
    return;
  }
  registerSSE(uploadId, res);
});

app.post("/api/image-service/upload", upload.single("file"), handleUpload);

// Multer error handler (file size exceeded, etc.)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large (max 50MB)" });
      return;
    }
  }
  console.error("[image-service] unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

startupCleanup();

app.listen(PORT, () => {
  console.log(`Image Service running on port ${PORT}`);
});

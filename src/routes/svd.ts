import { Router, type IRouter } from "express";
import { hfInference, bufferToBase64, modelLoading, getHfToken } from "../lib/hf-client";

const router: IRouter = Router();

const MODELS = {
  "svd": "stabilityai/stable-video-diffusion-img2vid",
  "svd-xt": "stabilityai/stable-video-diffusion-img2vid-xt",
  "svd-xt-1-1": "stabilityai/stable-video-diffusion-img2vid-xt-1-1",
} as const;

type SVDModel = keyof typeof MODELS;

router.get("/svd/models", (_req, res) => {
  res.json({
    models: Object.keys(MODELS),
    default: "svd-xt",
    description: "Stable Video Diffusion - image to video generation",
    input_type: "image URL or base64",
    requires: "HF_TOKEN (free at huggingface.co)",
  });
});

router.post("/svd/generate", async (req, res) => {
  try {
    getHfToken();

    const {
      image_url,
      image_b64,
      model = "svd-xt",
      num_frames = 25,
      fps = 7,
      motion_bucket_id = 127,
      noise_aug_strength = 0.02,
    } = req.body as {
      image_url?: string;
      image_b64?: string;
      model?: SVDModel;
      num_frames?: number;
      fps?: number;
      motion_bucket_id?: number;
      noise_aug_strength?: number;
    };

    if (!image_url && !image_b64) {
      res.status(400).json({
        error: "image_url or image_b64 is required",
        description: "SVD generates video FROM an input image",
      });
      return;
    }

    let imageInput: string;

    if (image_b64) {
      imageInput = image_b64.startsWith("data:") ? image_b64 : `data:image/png;base64,${image_b64}`;
    } else {
      const imgResp = await fetch(image_url!);
      if (!imgResp.ok) {
        res.status(400).json({ error: "Failed to fetch image from image_url" });
        return;
      }
      const buf = Buffer.from(await imgResp.arrayBuffer());
      const ct = imgResp.headers.get("content-type") ?? "image/jpeg";
      imageInput = `data:${ct};base64,${buf.toString("base64")}`;
    }

    const modelId = MODELS[model as SVDModel] ?? MODELS["svd-xt"];

    const result = await hfInference({
      modelId,
      inputs: imageInput,
      parameters: {
        num_frames: Math.min(num_frames, 25),
        fps,
        motion_bucket_id,
        noise_aug_strength,
      },
      waitForModel: true,
    });

    if (!result.ok && result.status === 503) {
      modelLoading(res, result.estimatedTime!);
      return;
    }

    const b64 = result.buffer ? bufferToBase64(result.buffer) : null;

    res.json({
      b64_json: b64,
      content_type: result.contentType || "video/mp4",
      model,
      num_frames,
      fps,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "SVD generation failed");
    const message = err instanceof Error ? err.message : "SVD failed";
    res.status(500).json({ error: message });
  }
});

export default router;

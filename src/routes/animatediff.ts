import { Router, type IRouter } from "express";
import { hfInference, bufferToBase64, modelLoading, getHfToken } from "../lib/hf-client";

const router: IRouter = Router();

const MODELS = {
  "animatediff-v3": "guoyww/animatediff-motion-adapter-v1-5-3",
  "animatediff-lightning": "ByteDance/AnimateDiff-Lightning",
  "hotshot-xl": "hotshotco/Hotshot-XL",
} as const;

type AnimateDiffModel = keyof typeof MODELS;

router.get("/animatediff/models", (_req, res) => {
  res.json({
    models: Object.keys(MODELS),
    default: "animatediff-lightning",
    description: "AnimateDiff - text to animated GIF/video",
    requires: "HF_TOKEN (free at huggingface.co)",
  });
});

router.post("/animatediff/generate", async (req, res) => {
  try {
    getHfToken();

    const {
      prompt,
      negative_prompt = "bad quality, worse quality, low resolution",
      model = "animatediff-lightning",
      num_frames = 16,
      num_inference_steps = 4,
      guidance_scale = 1.0,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      model?: AnimateDiffModel;
      num_frames?: number;
      num_inference_steps?: number;
      guidance_scale?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const modelId = MODELS[model as AnimateDiffModel] ?? MODELS["animatediff-lightning"];

    const result = await hfInference({
      modelId,
      inputs: prompt.trim(),
      parameters: {
        negative_prompt,
        num_frames: Math.min(num_frames, 32),
        num_inference_steps: Math.min(num_inference_steps, 20),
        guidance_scale,
      },
      waitForModel: true,
    });

    if (!result.ok && result.status === 503) {
      modelLoading(res, result.estimatedTime!);
      return;
    }

    const b64 = result.buffer ? bufferToBase64(result.buffer) : null;
    const contentType = result.contentType || "video/mp4";

    res.json({
      b64_json: b64,
      content_type: contentType,
      prompt: prompt.trim(),
      model,
      num_frames,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "AnimateDiff generation failed");
    const message = err instanceof Error ? err.message : "AnimateDiff failed";
    res.status(500).json({ error: message });
  }
});

export default router;

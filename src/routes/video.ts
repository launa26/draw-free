import { Router, type IRouter } from "express";
import { hfInference, bufferToBase64, modelLoading, getHfToken } from "../lib/hf-client";

const router: IRouter = Router();

const MODELS = {
  "zeroscope-v2": "cerspense/zeroscope_v2_576w",
  "zeroscope-xl": "cerspense/zeroscope_v2_XL",
  "text-to-video": "damo-vilab/text-to-video-ms-1.7b",
  "modelscope": "damo-vilab/text-to-video-ms-1.7b",
} as const;

type VideoModel = keyof typeof MODELS;

router.get("/video/models", (_req, res) => {
  res.json({
    models: Object.keys(MODELS),
    default: "zeroscope-v2",
    description: "General text-to-video models via HuggingFace",
    requires: "HF_TOKEN (free at huggingface.co)",
    also_available: {
      animatediff: "POST /api/animatediff/generate",
      stable_video_diffusion: "POST /api/svd/generate",
      open_sora: "POST /api/opensora/generate",
      univideo: "POST /api/univideo/generate",
      comfyui: "POST /api/comfyui/txt2vid",
    },
  });
});

router.post("/video/generate", async (req, res) => {
  try {
    getHfToken();

    const {
      prompt,
      negative_prompt = "low quality, blurry",
      model = "zeroscope-v2",
      num_frames = 16,
      fps = 8,
      num_inference_steps = 40,
      guidance_scale = 9.0,
      seed,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      model?: VideoModel;
      num_frames?: number;
      fps?: number;
      num_inference_steps?: number;
      guidance_scale?: number;
      seed?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const modelId = MODELS[model as VideoModel] ?? MODELS["zeroscope-v2"];

    const parameters: Record<string, unknown> = {
      negative_prompt,
      num_frames: Math.min(num_frames, 24),
      fps,
      num_inference_steps: Math.min(num_inference_steps, 50),
      guidance_scale,
    };
    if (seed !== undefined) parameters["seed"] = seed;

    const result = await hfInference({
      modelId,
      inputs: prompt.trim(),
      parameters,
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
      prompt: prompt.trim(),
      model,
      num_frames,
      fps,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Video generation failed");
    const message = err instanceof Error ? err.message : "Video generation failed";
    res.status(500).json({ error: message });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { hfInference, bufferToBase64, modelLoading, getHfToken } from "../lib/hf-client";

const router: IRouter = Router();

const MODELS = {
  "open-sora-v1-2": "hpcai-tech/Open-Sora",
  "open-sora-plan": "LanguageBind/Open-Sora-Plan-v1.3.0",
} as const;

type OpenSoraModel = keyof typeof MODELS;

router.get("/opensora/models", (_req, res) => {
  res.json({
    models: Object.keys(MODELS),
    default: "open-sora-v1-2",
    description: "Open-Sora - high quality open source text to video",
    requires: "HF_TOKEN (free at huggingface.co)",
    note: "High VRAM model — HF free inference may queue",
  });
});

router.post("/opensora/generate", async (req, res) => {
  try {
    getHfToken();

    const {
      prompt,
      negative_prompt = "low quality, blurry, distorted",
      model = "open-sora-v1-2",
      resolution = "480p",
      duration = "2s",
      num_inference_steps = 30,
      guidance_scale = 7.5,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      model?: OpenSoraModel;
      resolution?: "240p" | "480p" | "720p";
      duration?: "2s" | "4s" | "8s" | "16s";
      num_inference_steps?: number;
      guidance_scale?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const modelId = MODELS[model as OpenSoraModel] ?? MODELS["open-sora-v1-2"];

    const result = await hfInference({
      modelId,
      inputs: prompt.trim(),
      parameters: {
        negative_prompt,
        resolution,
        duration,
        num_inference_steps: Math.min(num_inference_steps, 50),
        guidance_scale,
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
      prompt: prompt.trim(),
      model,
      resolution,
      duration,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Open-Sora generation failed");
    const message = err instanceof Error ? err.message : "Open-Sora failed";
    res.status(500).json({ error: message });
  }
});

export default router;

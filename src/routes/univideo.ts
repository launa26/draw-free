import { Router, type IRouter } from "express";
import { hfInference, bufferToBase64, modelLoading, getHfToken } from "../lib/hf-client";

const router: IRouter = Router();

const MODELS = {
  "univideo": "thu-ml/univa-video",
  "show-1": "showlab/show-1",
  "videocrafter2": "VideoCrafter/VideoCrafter2",
} as const;

type UniVideoModel = keyof typeof MODELS;

router.get("/univideo/models", (_req, res) => {
  res.json({
    models: Object.keys(MODELS),
    default: "videocrafter2",
    description: "UniVideo / VideoCrafter - unified video generation",
    requires: "HF_TOKEN (free at huggingface.co)",
  });
});

router.post("/univideo/generate", async (req, res) => {
  try {
    getHfToken();

    const {
      prompt,
      negative_prompt = "low quality, worse quality, blurry",
      model = "videocrafter2",
      num_frames = 16,
      fps = 8,
      width = 512,
      height = 320,
      num_inference_steps = 50,
      guidance_scale = 12.0,
      seed,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      model?: UniVideoModel;
      num_frames?: number;
      fps?: number;
      width?: number;
      height?: number;
      num_inference_steps?: number;
      guidance_scale?: number;
      seed?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const modelId = MODELS[model as UniVideoModel] ?? MODELS["videocrafter2"];

    const parameters: Record<string, unknown> = {
      negative_prompt,
      num_frames: Math.min(num_frames, 32),
      fps,
      width,
      height,
      num_inference_steps: Math.min(num_inference_steps, 100),
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
      width,
      height,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "UniVideo generation failed");
    const message = err instanceof Error ? err.message : "UniVideo failed";
    res.status(500).json({ error: message });
  }
});

export default router;

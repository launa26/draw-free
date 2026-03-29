import { Router, type IRouter } from "express";

const router: IRouter = Router();

const POLLINATIONS_BASE = "https://image.pollinations.ai";

const MODELS = ["flux", "flux-realism", "flux-cablyai", "flux-anime", "flux-3d", "turbo"] as const;
type ImageModel = typeof MODELS[number];

router.get("/image/models", (_req, res) => {
  res.json({
    models: MODELS,
    default: "flux",
    description: "Available free image generation models",
  });
});

router.post("/image/generate", async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt = "",
      width = 1024,
      height = 1024,
      model = "flux",
      seed,
      enhance = false,
      nologo = true,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      width?: number;
      height?: number;
      model?: ImageModel;
      seed?: number;
      enhance?: boolean;
      nologo?: boolean;
    };

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const params = new URLSearchParams({
      width: String(Math.min(Math.max(width, 128), 2048)),
      height: String(Math.min(Math.max(height, 128), 2048)),
      model: MODELS.includes(model as ImageModel) ? model : "flux",
      nologo: String(nologo),
      enhance: String(enhance),
    });

    if (negative_prompt) params.set("negative_prompt", negative_prompt);
    if (seed !== undefined) params.set("seed", String(seed));

    const imageUrl = `${POLLINATIONS_BASE}/prompt/${encodedPrompt}?${params.toString()}`;

    const imageResp = await fetch(imageUrl);

    if (!imageResp.ok) {
      res.status(502).json({ error: `Image service returned ${imageResp.status}` });
      return;
    }

    const contentType = imageResp.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await imageResp.arrayBuffer());
    const base64 = buffer.toString("base64");

    res.json({
      url: imageUrl,
      b64_json: base64,
      content_type: contentType,
      prompt: prompt.trim(),
      model,
      width,
      height,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Image generation failed");
    const message = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: message });
  }
});

router.get("/image/generate", async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt = "",
      width = "1024",
      height = "1024",
      model = "flux",
      seed,
      enhance = "false",
      nologo = "true",
      format = "url",
    } = req.query as {
      prompt?: string;
      negative_prompt?: string;
      width?: string;
      height?: string;
      model?: string;
      seed?: string;
      enhance?: string;
      nologo?: string;
      format?: "url" | "json";
    };

    if (!prompt || prompt.trim() === "") {
      res.status(400).json({ error: "prompt query parameter is required" });
      return;
    }

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const params = new URLSearchParams({
      width: String(Math.min(Math.max(Number(width), 128), 2048)),
      height: String(Math.min(Math.max(Number(height), 128), 2048)),
      model: MODELS.includes(model as ImageModel) ? model : "flux",
      nologo: nologo === "false" ? "false" : "true",
      enhance: enhance === "true" ? "true" : "false",
    });

    if (negative_prompt) params.set("negative_prompt", negative_prompt);
    if (seed) params.set("seed", seed);

    const imageUrl = `${POLLINATIONS_BASE}/prompt/${encodedPrompt}?${params.toString()}`;

    if (format === "url") {
      res.json({ url: imageUrl, prompt: prompt.trim(), model });
      return;
    }

    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      res.status(502).json({ error: `Image service returned ${imageResp.status}` });
      return;
    }

    const contentType = imageResp.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await imageResp.arrayBuffer());
    const base64 = buffer.toString("base64");

    res.json({
      url: imageUrl,
      b64_json: base64,
      content_type: contentType,
      prompt: prompt.trim(),
      model,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Image generation (GET) failed");
    const message = err instanceof Error ? err.message : "Image generation failed";
    res.status(500).json({ error: message });
  }
});

router.get("/image/proxy", async (req, res) => {
  try {
    const { prompt, width = "512", height = "512", model = "flux" } = req.query as {
      prompt?: string;
      width?: string;
      height?: string;
      model?: string;
    };

    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const imageUrl = `${POLLINATIONS_BASE}/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true`;

    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      res.status(502).send("Failed to fetch image");
      return;
    }

    const contentType = imageResp.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const buffer = Buffer.from(await imageResp.arrayBuffer());
    res.send(buffer);
  } catch (err: unknown) {
    req.log.error({ err }, "Image proxy failed");
    res.status(500).send("Proxy error");
  }
});

export default router;

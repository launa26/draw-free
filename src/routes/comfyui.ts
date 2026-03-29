import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function getComfyUIBase(): string {
  const base = process.env["COMFYUI_URL"] ?? "http://127.0.0.1:8188";
  return base.replace(/\/$/, "");
}

router.get("/comfyui/status", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const resp = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      res.status(502).json({ status: "unreachable", comfyui_url: base });
      return;
    }
    const data = await resp.json();
    res.json({ status: "online", comfyui_url: base, system: data });
  } catch {
    res.status(503).json({
      status: "offline",
      comfyui_url: getComfyUIBase(),
      help: "Set COMFYUI_URL env var to your ComfyUI server address",
    });
  }
});

router.get("/comfyui/models", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const resp = await fetch(`${base}/object_info`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      res.status(502).json({ error: "Could not reach ComfyUI" });
      return;
    }
    const data = await resp.json() as Record<string, unknown>;
    const checkpoints = (data["CheckpointLoaderSimple"] as { input?: { required?: { ckpt_name?: [string[]] } } })
      ?.input?.required?.ckpt_name?.[0] ?? [];

    res.json({ checkpoints, comfyui_url: base });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI models fetch failed");
    res.status(503).json({ error: "ComfyUI not reachable. Set COMFYUI_URL." });
  }
});

router.post("/comfyui/txt2img", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const {
      prompt,
      negative_prompt = "bad quality, blurry, distorted",
      checkpoint = "v1-5-pruned-emaonly.ckpt",
      width = 512,
      height = 512,
      steps = 20,
      cfg = 7,
      sampler = "euler",
      scheduler = "normal",
      seed = Math.floor(Math.random() * 2 ** 32),
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      checkpoint?: string;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      scheduler?: string;
      seed?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const clientId = randomUUID();

    const workflow = {
      "3": {
        inputs: {
          seed,
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
          denoise: 1,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
        class_type: "KSampler",
      },
      "4": {
        inputs: { ckpt_name: checkpoint },
        class_type: "CheckpointLoaderSimple",
      },
      "5": {
        inputs: { width, height, batch_size: 1 },
        class_type: "EmptyLatentImage",
      },
      "6": {
        inputs: { text: prompt.trim(), clip: ["4", 1] },
        class_type: "CLIPTextEncode",
      },
      "7": {
        inputs: { text: negative_prompt, clip: ["4", 1] },
        class_type: "CLIPTextEncode",
      },
      "8": {
        inputs: { samples: ["3", 0], vae: ["4", 2] },
        class_type: "VAEDecode",
      },
      "9": {
        inputs: {
          filename_prefix: "api_output",
          images: ["8", 0],
        },
        class_type: "SaveImage",
      },
    };

    const queueResp = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!queueResp.ok) {
      const err = await queueResp.text();
      res.status(502).json({ error: `ComfyUI error: ${err}` });
      return;
    }

    const queueData = await queueResp.json() as { prompt_id: string; number: number };

    res.json({
      prompt_id: queueData.prompt_id,
      queue_number: queueData.number,
      client_id: clientId,
      status: "queued",
      poll_endpoint: `/api/comfyui/result/${queueData.prompt_id}`,
      message: "Use GET /api/comfyui/result/:prompt_id to retrieve the image when ready",
    });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI txt2img failed");
    const message = err instanceof Error ? err.message : "ComfyUI request failed";
    res.status(500).json({ error: message });
  }
});

router.post("/comfyui/txt2vid", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const {
      prompt,
      negative_prompt = "bad quality, blurry",
      checkpoint = "v1-5-pruned-emaonly.ckpt",
      width = 512,
      height = 512,
      steps = 20,
      cfg = 7,
      num_frames = 16,
      fps = 8,
      seed = Math.floor(Math.random() * 2 ** 32),
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      checkpoint?: string;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      num_frames?: number;
      fps?: number;
      seed?: number;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const clientId = randomUUID();

    const workflow = {
      "1": { inputs: { ckpt_name: checkpoint }, class_type: "CheckpointLoaderSimple" },
      "2": { inputs: { text: prompt.trim(), clip: ["1", 1] }, class_type: "CLIPTextEncode" },
      "3": { inputs: { text: negative_prompt, clip: ["1", 1] }, class_type: "CLIPTextEncode" },
      "4": { inputs: { width, height, batch_size: num_frames }, class_type: "EmptyLatentImage" },
      "5": {
        inputs: {
          seed, steps, cfg,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
        class_type: "KSampler",
      },
      "6": { inputs: { samples: ["5", 0], vae: ["1", 2] }, class_type: "VAEDecode" },
      "7": {
        inputs: { frame_rate: fps, loop_count: 0, filename_prefix: "api_video", format: "video/h264-mp4", images: ["6", 0] },
        class_type: "VHS_VideoCombine",
      },
    };

    const queueResp = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!queueResp.ok) {
      const err = await queueResp.text();
      res.status(502).json({ error: `ComfyUI error: ${err}` });
      return;
    }

    const queueData = await queueResp.json() as { prompt_id: string; number: number };

    res.json({
      prompt_id: queueData.prompt_id,
      queue_number: queueData.number,
      client_id: clientId,
      status: "queued",
      poll_endpoint: `/api/comfyui/result/${queueData.prompt_id}`,
      message: "Use GET /api/comfyui/result/:prompt_id to retrieve the video when ready",
    });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI txt2vid failed");
    const message = err instanceof Error ? err.message : "ComfyUI request failed";
    res.status(500).json({ error: message });
  }
});

router.get("/comfyui/result/:promptId", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const { promptId } = req.params;

    const histResp = await fetch(`${base}/history/${promptId}`, { signal: AbortSignal.timeout(5000) });
    if (!histResp.ok) {
      res.status(502).json({ error: "Could not fetch history from ComfyUI" });
      return;
    }

    const history = await histResp.json() as Record<string, {
      outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[]; gifs?: { filename: string; subfolder: string; type: string }[] }>;
      status?: { completed: boolean; status_str: string };
    }>;

    const entry = history[promptId];
    if (!entry) {
      res.json({ status: "pending", prompt_id: promptId, message: "Still processing..." });
      return;
    }

    if (!entry.status?.completed) {
      res.json({ status: "processing", prompt_id: promptId, status_str: entry.status?.status_str });
      return;
    }

    const outputs = entry.outputs ?? {};
    const files: { node: string; filename: string; url: string; type: string }[] = [];

    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
      const mediaItems = [...(nodeOutput.images ?? []), ...(nodeOutput.gifs ?? [])];
      for (const item of mediaItems) {
        const fileUrl = `${base}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder)}&type=${item.type}`;
        files.push({ node: nodeId, filename: item.filename, url: fileUrl, type: item.type });
      }
    }

    res.json({ status: "completed", prompt_id: promptId, files });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI result fetch failed");
    const message = err instanceof Error ? err.message : "Failed to get result";
    res.status(500).json({ error: message });
  }
});

router.post("/comfyui/workflow", async (req, res) => {
  try {
    const base = getComfyUIBase();
    const { workflow, client_id = randomUUID() } = req.body as {
      workflow: Record<string, unknown>;
      client_id?: string;
    };

    if (!workflow || typeof workflow !== "object") {
      res.status(400).json({ error: "workflow object is required" });
      return;
    }

    const queueResp = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id }),
    });

    if (!queueResp.ok) {
      const err = await queueResp.text();
      res.status(502).json({ error: `ComfyUI error: ${err}` });
      return;
    }

    const data = await queueResp.json() as { prompt_id: string; number: number };

    res.json({
      prompt_id: data.prompt_id,
      queue_number: data.number,
      status: "queued",
      poll_endpoint: `/api/comfyui/result/${data.prompt_id}`,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI custom workflow failed");
    const message = err instanceof Error ? err.message : "Workflow execution failed";
    res.status(500).json({ error: message });
  }
});

export default router;

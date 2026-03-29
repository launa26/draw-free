import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

function getComfyUIBase(): string {
  const base = process.env["COMFYUI_URL"] ?? "http://127.0.0.1:8188";
  return base.replace(/\/$/, "");
}

async function pollResult(
  base: string,
  promptId: string,
  timeoutMs = 300_000,
  intervalMs = 2000,
): Promise<{ files: { node: string; filename: string; url: string; type: string }[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const histResp = await fetch(`${base}/history/${promptId}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (histResp.ok) {
      const history = (await histResp.json()) as Record<
        string,
        {
          outputs?: Record<
            string,
            {
              images?: { filename: string; subfolder: string; type: string }[];
              gifs?: { filename: string; subfolder: string; type: string }[];
              videos?: { filename: string; subfolder: string; type: string }[];
            }
          >;
          status?: { completed: boolean; status_str: string };
        }
      >;
      const entry = history[promptId];
      if (entry?.status?.completed) {
        const files: { node: string; filename: string; url: string; type: string }[] = [];
        for (const [nodeId, nodeOutput] of Object.entries(entry.outputs ?? {})) {
          const items = [
            ...(nodeOutput.images ?? []),
            ...(nodeOutput.gifs ?? []),
            ...(nodeOutput.videos ?? []),
          ];
          for (const item of items) {
            const fileUrl = `${base}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder)}&type=${item.type}`;
            files.push({ node: nodeId, filename: item.filename, url: fileUrl, type: item.type });
          }
        }
        return { files };
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Generation timed out");
}

router.get("/status", async (_req, res) => {
  const base = getComfyUIBase();
  try {
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
      comfyui_url: base,
      help: "Set COMFYUI_URL env var to your ComfyUI server address (default: http://127.0.0.1:8188)",
    });
  }
});

router.get("/models", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const [objResp, adResp] = await Promise.all([
      fetch(`${base}/object_info`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/object_info/ADE_AnimateDiffLoaderWithContext`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    ]);

    if (!objResp.ok) {
      res.status(502).json({ error: "Could not reach ComfyUI" });
      return;
    }

    const data = (await objResp.json()) as Record<string, unknown>;
    const checkpoints =
      (
        data["CheckpointLoaderSimple"] as {
          input?: { required?: { ckpt_name?: [string[]] } };
        }
      )?.input?.required?.ckpt_name?.[0] ?? [];

    let animatediff_models: string[] = [];
    if (adResp?.ok) {
      const adData = (await adResp.json()) as Record<string, unknown>;
      animatediff_models =
        (
          adData["ADE_AnimateDiffLoaderWithContext"] as {
            input?: { required?: { model_name?: [string[]] } };
          }
        )?.input?.required?.model_name?.[0] ?? [];
    }

    res.json({ checkpoints, animatediff_models, comfyui_url: base });
  } catch (err: unknown) {
    req.log.error({ err }, "ComfyUI models fetch failed");
    res.status(503).json({ error: "ComfyUI not reachable. Set COMFYUI_URL." });
  }
});

router.post("/txt2img", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const {
      prompt,
      negative_prompt = "bad quality, blurry, distorted, deformed, disfigured",
      checkpoint = "v1-5-pruned-emaonly.safetensors",
      width = 512,
      height = 512,
      steps = 20,
      cfg = 7,
      sampler = "euler",
      scheduler = "normal",
      seed = Math.floor(Math.random() * 2 ** 32),
      wait = false,
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
      wait?: boolean;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const clientId = randomUUID();

    const workflow = {
      "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
      "5": { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
      "6": { class_type: "CLIPTextEncode", inputs: { text: prompt.trim(), clip: ["4", 1] } },
      "7": { class_type: "CLIPTextEncode", inputs: { text: negative_prompt, clip: ["4", 1] } },
      "3": {
        class_type: "KSampler",
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
      },
      "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
      "9": {
        class_type: "SaveImage",
        inputs: { filename_prefix: "txt2img", images: ["8", 0] },
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

    const queueData = (await queueResp.json()) as { prompt_id: string; number: number };

    if (wait) {
      const result = await pollResult(base, queueData.prompt_id);
      res.json({ status: "completed", prompt_id: queueData.prompt_id, ...result });
      return;
    }

    res.json({
      prompt_id: queueData.prompt_id,
      queue_number: queueData.number,
      client_id: clientId,
      status: "queued",
      poll_endpoint: `/api/result/${queueData.prompt_id}`,
      message: "GET /api/result/:prompt_id to retrieve when ready",
    });
  } catch (err: unknown) {
    req.log.error({ err }, "txt2img failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "txt2img failed" });
  }
});

router.post("/animatediff", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const {
      prompt,
      negative_prompt = "bad quality, blurry, distorted, deformed, watermark, text",
      checkpoint = "realisticVisionV60B1_v51VAE.safetensors",
      animatediff_model = "mm_sd_v15_v2.ckpt",
      width = 512,
      height = 512,
      steps = 20,
      cfg = 7,
      sampler = "euler_ancestral",
      scheduler = "normal",
      num_frames = 16,
      fps = 8,
      seed = Math.floor(Math.random() * 2 ** 32),
      loop_count = 0,
      format = "video/h264-mp4",
      wait = false,
    } = req.body as {
      prompt: string;
      negative_prompt?: string;
      checkpoint?: string;
      animatediff_model?: string;
      width?: number;
      height?: number;
      steps?: number;
      cfg?: number;
      sampler?: string;
      scheduler?: string;
      num_frames?: number;
      fps?: number;
      seed?: number;
      loop_count?: number;
      format?: string;
      wait?: boolean;
    };

    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const clientId = randomUUID();

    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: prompt.trim(), clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: negative_prompt, clip: ["1", 1] } },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { width, height, batch_size: Math.min(num_frames, 32) },
      },
      "5": {
        class_type: "ADE_AnimateDiffLoaderWithContext",
        inputs: {
          model_name: animatediff_model,
          beta_schedule: "sqrt_linear (AnimateDiff)",
          model: ["1", 0],
        },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed,
          steps,
          cfg,
          sampler_name: sampler,
          scheduler,
          denoise: 1,
          model: ["5", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "7": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
      "8": {
        class_type: "VHS_VideoCombine",
        inputs: {
          frame_rate: fps,
          loop_count,
          filename_prefix: "animatediff",
          format,
          images: ["7", 0],
          save_output: true,
        },
      },
    };

    const queueResp = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!queueResp.ok) {
      const errText = await queueResp.text();
      res.status(502).json({ error: `ComfyUI error: ${errText}` });
      return;
    }

    const queueData = (await queueResp.json()) as { prompt_id: string; number: number };

    if (wait) {
      const result = await pollResult(base, queueData.prompt_id, 300_000);
      res.json({ status: "completed", prompt_id: queueData.prompt_id, ...result });
      return;
    }

    res.json({
      prompt_id: queueData.prompt_id,
      queue_number: queueData.number,
      client_id: clientId,
      status: "queued",
      poll_endpoint: `/api/result/${queueData.prompt_id}`,
      message: "GET /api/result/:prompt_id to retrieve when ready",
      workflow_info: {
        checkpoint,
        animatediff_model,
        num_frames,
        fps,
        format,
      },
    });
  } catch (err: unknown) {
    req.log.error({ err }, "AnimateDiff generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "AnimateDiff failed" });
  }
});

router.get("/result/:promptId", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const { promptId } = req.params;

    const histResp = await fetch(`${base}/history/${promptId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!histResp.ok) {
      res.status(502).json({ error: "Could not fetch history from ComfyUI" });
      return;
    }

    const history = (await histResp.json()) as Record<
      string,
      {
        outputs?: Record<
          string,
          {
            images?: { filename: string; subfolder: string; type: string }[];
            gifs?: { filename: string; subfolder: string; type: string }[];
            videos?: { filename: string; subfolder: string; type: string }[];
          }
        >;
        status?: { completed: boolean; status_str: string };
      }
    >;

    const entry = history[promptId];
    if (!entry) {
      res.json({ status: "pending", prompt_id: promptId, message: "Still processing..." });
      return;
    }

    if (!entry.status?.completed) {
      res.json({
        status: "processing",
        prompt_id: promptId,
        status_str: entry.status?.status_str,
      });
      return;
    }

    const files: { node: string; filename: string; url: string; type: string }[] = [];
    for (const [nodeId, nodeOutput] of Object.entries(entry.outputs ?? {})) {
      const items = [
        ...(nodeOutput.images ?? []),
        ...(nodeOutput.gifs ?? []),
        ...(nodeOutput.videos ?? []),
      ];
      for (const item of items) {
        const fileUrl = `${base}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder)}&type=${item.type}`;
        files.push({ node: nodeId, filename: item.filename, url: fileUrl, type: item.type });
      }
    }

    res.json({ status: "completed", prompt_id: promptId, files });
  } catch (err: unknown) {
    req.log.error({ err }, "Result fetch failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to get result" });
  }
});

router.post("/workflow", async (req, res) => {
  const base = getComfyUIBase();
  try {
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

    const data = (await queueResp.json()) as { prompt_id: string; number: number };

    res.json({
      prompt_id: data.prompt_id,
      queue_number: data.number,
      status: "queued",
      poll_endpoint: `/api/result/${data.prompt_id}`,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Custom workflow failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Workflow execution failed" });
  }
});

router.get("/queue", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const resp = await fetch(`${base}/queue`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      res.status(502).json({ error: "Could not reach ComfyUI" });
      return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err: unknown) {
    req.log.error({ err }, "Queue fetch failed");
    res.status(503).json({ error: "ComfyUI not reachable" });
  }
});

router.delete("/queue", async (req, res) => {
  const base = getComfyUIBase();
  try {
    const resp = await fetch(`${base}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clear: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      res.status(502).json({ error: "Could not clear queue" });
      return;
    }
    res.json({ message: "Queue cleared" });
  } catch (err: unknown) {
    req.log.error({ err }, "Queue clear failed");
    res.status(503).json({ error: "ComfyUI not reachable" });
  }
});

export default router;

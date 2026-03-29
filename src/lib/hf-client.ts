const HF_API_BASE = "https://api-inference.huggingface.co";

export function getHfToken(): string {
  const token = process.env["HF_TOKEN"];
  if (!token) {
    throw new Error(
      "HF_TOKEN is not set. Get a free token at https://huggingface.co/settings/tokens"
    );
  }
  return token;
}

export interface HfRequestOptions {
  modelId: string;
  inputs: unknown;
  parameters?: Record<string, unknown>;
  waitForModel?: boolean;
}

export interface HfResponse {
  ok: boolean;
  status: number;
  contentType: string;
  buffer?: Buffer;
  json?: unknown;
  estimatedTime?: number;
}

export async function hfInference(opts: HfRequestOptions): Promise<HfResponse> {
  const token = getHfToken();
  const url = `${HF_API_BASE}/models/${opts.modelId}`;

  const body: Record<string, unknown> = { inputs: opts.inputs };
  if (opts.parameters) body["parameters"] = opts.parameters;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  if (opts.waitForModel) {
    headers["X-Wait-For-Model"] = "true";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (response.status === 503) {
    const json = await response.json() as { estimated_time?: number };
    return {
      ok: false,
      status: 503,
      contentType,
      estimatedTime: json.estimated_time ?? 30,
    };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${text}`);
  }

  if (contentType.includes("application/json")) {
    const json = await response.json();
    return { ok: true, status: 200, contentType, json };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { ok: true, status: 200, contentType, buffer };
}

export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function modelLoading(res: import("express").Response, estimatedTime: number) {
  res.status(202).json({
    status: "loading",
    message: "Model is warming up on HuggingFace, please retry in a moment.",
    retry_after_seconds: estimatedTime,
    estimated_time: estimatedTime,
  });
}

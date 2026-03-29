# 🎨 AI Media API

API tạo ảnh và video bằng AI — miễn phí, dễ dùng, cho bot sử dụng.

## ✨ Tính năng

- 🖼️ **Tạo ảnh AI** — Pollinations.AI (Flux, SDXL) — **không cần API key**
- 🎬 **AnimateDiff** — Text → animated video
- 🎥 **Stable Video Diffusion** — Image → video
- 🌐 **Open-Sora** — Text → video chất lượng cao
- 🎞️ **UniVideo / VideoCrafter** — Text → video
- ⚙️ **ComfyUI Proxy** — Kết nối ComfyUI self-hosted

---

## 🚀 Deploy lên Render (miễn phí)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)

1. Fork repo này
2. Vào [render.com](https://render.com) → **New Web Service** → kết nối repo
3. Điền:
   - **Build Command:** `cd artifacts/api-server && npm install --legacy-peer-deps && node ./build.mjs`
   - **Start Command:** `node --enable-source-maps artifacts/api-server/dist/index.mjs`
4. Thêm env var `HF_TOKEN` (lấy miễn phí tại [huggingface.co](https://huggingface.co/settings/tokens))
5. Bấm **Deploy**

---

## 🔑 Environment Variables

| Biến | Bắt buộc | Mô tả |
|------|----------|-------|
| `PORT` | ✅ | Port server (Render tự set) |
| `HF_TOKEN` | ✅ cho video | Token Hugging Face miễn phí |
| `COMFYUI_URL` | ❌ | URL ComfyUI server nếu self-host |

---

## 📡 API Endpoints

### 🖼️ Tạo Ảnh (miễn phí, không cần key)

**`POST /api/image/generate`**
```json
{
  "prompt": "a futuristic city at night, cinematic",
  "model": "flux",
  "width": 1024,
  "height": 1024
}
```

**Models:** `flux` · `flux-realism` · `flux-anime` · `flux-3d` · `flux-cablyai` · `turbo`

**Response:**
```json
{
  "url": "https://image.pollinations.ai/...",
  "b64_json": "...",
  "content_type": "image/jpeg"
}
```

---

### 🎬 AnimateDiff — Text → Animation

**`POST /api/animatediff/generate`**
```json
{
  "prompt": "a cat running in a field, smooth motion",
  "model": "animatediff-lightning",
  "num_frames": 16
}
```

**Models:** `animatediff-lightning` · `animatediff-v3` · `hotshot-xl`

---

### 🎥 Stable Video Diffusion — Image → Video

**`POST /api/svd/generate`**
```json
{
  "image_url": "https://example.com/photo.jpg",
  "model": "svd-xt",
  "num_frames": 25,
  "fps": 7
}
```

**Models:** `svd` · `svd-xt` · `svd-xt-1-1`

---

### 🌐 Open-Sora — Text → Video

**`POST /api/opensora/generate`**
```json
{
  "prompt": "a sunset over the ocean, time-lapse",
  "resolution": "480p",
  "duration": "4s"
}
```

---

### 🎞️ UniVideo — Text → Video

**`POST /api/univideo/generate`**
```json
{
  "prompt": "a rocket launching into space",
  "model": "videocrafter2",
  "num_frames": 16,
  "fps": 8
}
```

**Models:** `videocrafter2` · `univideo` · `show-1`

---

### ⚙️ ZeroScope / ModelScope

**`POST /api/video/generate`**
```json
{
  "prompt": "a dog playing in the park",
  "model": "zeroscope-v2",
  "num_frames": 16
}
```

---

### 🛠️ ComfyUI Proxy (self-hosted)

Set env var `COMFYUI_URL=http://your-server:8188`

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/comfyui/status` | Kiểm tra kết nối |
| `GET /api/comfyui/models` | Danh sách checkpoints |
| `POST /api/comfyui/txt2img` | Text → Ảnh |
| `POST /api/comfyui/txt2vid` | Text → Video |
| `POST /api/comfyui/workflow` | Custom workflow JSON |
| `GET /api/comfyui/result/:id` | Lấy kết quả |

**`POST /api/comfyui/txt2img`**
```json
{
  "prompt": "a beautiful landscape",
  "negative_prompt": "blurry, low quality",
  "checkpoint": "v1-5-pruned-emaonly.ckpt",
  "width": 512,
  "height": 512,
  "steps": 20
}
```

---

### ❤️ Health Check

**`GET /api/healthz`**
```json
{ "status": "ok" }
```

---

## 🤖 Dùng cho Bot

**Discord Bot / Telegram Bot / n8n / Make.com** — gọi thẳng HTTP request:

```python
import requests

# Tạo ảnh
resp = requests.post("https://your-app.onrender.com/api/image/generate", json={
    "prompt": "a cute anime girl",
    "model": "flux-anime"
})
image_url = resp.json()["url"]

# Tạo video
resp = requests.post("https://your-app.onrender.com/api/animatediff/generate", json={
    "prompt": "dancing robot"
})
video_b64 = resp.json()["b64_json"]
```

```javascript
// Node.js / Discord.js
const res = await fetch("https://your-app.onrender.com/api/image/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "cyberpunk city", model: "flux" })
});
const { url } = await res.json();
```

---

## 📦 Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 5
- **Image AI:** Pollinations.AI (Flux / SDXL)
- **Video AI:** Hugging Face Inference API
- **Build:** esbuild
- **Deploy:** Render.com

---

## 📄 License

MIT — Dùng thoải mái!

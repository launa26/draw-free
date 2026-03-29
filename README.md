# ComfyUI + AnimateDiff API Server

API server Node.js/Express để tạo ảnh và video AI bằng **ComfyUI** + **AnimateDiff**, không dùng API bên ngoài — chạy hoàn toàn local hoặc tự host.

---

## Tính năng

- Tạo **ảnh** từ text (Stable Diffusion qua ComfyUI)
- Tạo **video hoạt ảnh** từ text (AnimateDiff qua ComfyUI)
- Hỗ trợ poll kết quả hoặc chờ đồng bộ (`wait: true`)
- Xem queue, xóa queue
- Chạy custom workflow JSON bất kỳ

---

## Yêu cầu

- Node.js 18+
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) đang chạy (có GPU)
- Custom nodes ComfyUI:
  - [ComfyUI-AnimateDiff-Evolved](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
  - [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)
- Models:
  - Stable Diffusion checkpoint (ví dụ: `v1-5-pruned-emaonly.safetensors`)
  - AnimateDiff motion module (ví dụ: `mm_sd_v15_v2.ckpt`)

---

## Cài đặt

```bash
npm install
npm run build
npm start
```

---

## Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `8080` | Port chạy server |
| `COMFYUI_URL` | `http://127.0.0.1:8188` | URL của ComfyUI server |

---

## API Endpoints

### Hệ thống

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/healthz` | Health check |
| GET | `/api/status` | Kiểm tra kết nối ComfyUI |
| GET | `/api/models` | Danh sách checkpoints & AnimateDiff models |
| GET | `/api/queue` | Xem queue |
| DELETE | `/api/queue` | Xóa queue |

---

### Tạo ảnh — `POST /api/txt2img`

```json
{
  "prompt": "a beautiful sunset over the ocean",
  "negative_prompt": "bad quality, blurry",
  "checkpoint": "v1-5-pruned-emaonly.safetensors",
  "width": 512,
  "height": 512,
  "steps": 20,
  "cfg": 7,
  "sampler": "euler",
  "seed": 12345,
  "wait": false
}
```

---

### Tạo video — `POST /api/animatediff`

```json
{
  "prompt": "a girl walking in the park, cinematic",
  "negative_prompt": "bad quality, blurry, watermark",
  "checkpoint": "realisticVisionV60B1_v51VAE.safetensors",
  "animatediff_model": "mm_sd_v15_v2.ckpt",
  "width": 512,
  "height": 512,
  "steps": 20,
  "cfg": 7,
  "num_frames": 16,
  "fps": 8,
  "format": "video/h264-mp4",
  "wait": false
}
```

---

### Lấy kết quả — `GET /api/result/:prompt_id`

```json
{
  "status": "completed",
  "prompt_id": "abc-123",
  "files": [
    {
      "filename": "animatediff_00001.mp4",
      "url": "http://127.0.0.1:8188/view?filename=...",
      "type": "output"
    }
  ]
}
```

> Trạng thái: `pending` → `processing` → `completed`

---

### Custom workflow — `POST /api/workflow`

```json
{
  "workflow": { ...ComfyUI workflow JSON... }
}
```

---

## Flow hoạt động

```
Client  →  POST /api/animatediff
        ←  { prompt_id, poll_endpoint }

Client  →  GET /api/result/:prompt_id   (poll mỗi 2-3 giây)
        ←  { status: "pending" }
        ←  { status: "processing" }
        ←  { status: "completed", files: [...] }
```

Hoặc dùng `"wait": true` để server tự chờ và trả kết quả ngay (timeout 5 phút).

---

## Deploy lên Render + ComfyUI trên Google Colab

Xem file `comfyui_animatediff_colab.ipynb` để chạy ComfyUI miễn phí trên Colab với GPU T4, sau đó dùng URL ngrok làm `COMFYUI_URL` trên Render.

---

## License

MIT

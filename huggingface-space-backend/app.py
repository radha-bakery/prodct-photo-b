import io
import os
from typing import Optional

import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

app = FastAPI(title="Product Photo Free Pro AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = None
PROCESSOR = None
MODEL_ERROR = None


def load_birefnet():
    global MODEL, PROCESSOR, MODEL_ERROR
    if MODEL is not None or MODEL_ERROR is not None:
        return
    try:
        from transformers import AutoModelForImageSegmentation
        from torchvision import transforms

        MODEL = AutoModelForImageSegmentation.from_pretrained(
            "ZhengPeng7/BiRefNet",
            trust_remote_code=True
        )
        MODEL.eval()
        if torch.cuda.is_available():
            MODEL.cuda()

        PROCESSOR = transforms.Compose([
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
    except Exception as e:
        MODEL_ERROR = str(e)


def remove_bg_birefnet(image: Image.Image) -> Image.Image:
    load_birefnet()
    if MODEL is None:
        raise RuntimeError(MODEL_ERROR or "BiRefNet model not loaded")

    original_size = image.size
    rgb = image.convert("RGB")
    inp = PROCESSOR(rgb).unsqueeze(0)
    if torch.cuda.is_available():
        inp = inp.cuda()

    with torch.no_grad():
        pred = MODEL(inp)[-1].sigmoid().cpu()[0].squeeze()

    mask = transforms_to_pil(pred).resize(original_size, Image.LANCZOS)
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def transforms_to_pil(tensor):
    arr = tensor.numpy()
    arr = (arr * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="L")


def remove_bg_rembg(image: Image.Image) -> Image.Image:
    from rembg import remove
    data = io.BytesIO()
    image.save(data, format="PNG")
    out = remove(data.getvalue())
    return Image.open(io.BytesIO(out)).convert("RGBA")


def fit_product_on_white(rgba: Image.Image, size=400, padding=28, shadow=False) -> Image.Image:
    # crop to alpha bbox
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    max_w = size - padding * 2
    max_h = size - padding * 2

    scale = min(max_w / rgba.width, max_h / rgba.height)
    new_size = (max(1, int(rgba.width * scale)), max(1, int(rgba.height * scale)))
    product = rgba.resize(new_size, Image.LANCZOS)
    x = (size - new_size[0]) // 2
    y = (size - new_size[1]) // 2

    if shadow:
        shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sh = product.getchannel("A").filter(ImageFilter.GaussianBlur(8))
        shadow_img = Image.new("RGBA", product.size, (0, 0, 0, 55))
        shadow_img.putalpha(sh)
        shadow_layer.alpha_composite(shadow_img, (x + 2, y + 8))
        canvas.alpha_composite(shadow_layer)

    canvas.alpha_composite(product, (x, y))
    return canvas.convert("RGB")


def enhance_image(img: Image.Image, brightness=105, contrast=110, saturation=108, sharpen=18) -> Image.Image:
    img = ImageEnhance.Brightness(img).enhance(float(brightness) / 100)
    img = ImageEnhance.Contrast(img).enhance(float(contrast) / 100)
    img = ImageEnhance.Color(img).enhance(float(saturation) / 100)
    if int(sharpen) > 0:
        sharp_amount = 1 + (int(sharpen) / 60) * 1.8
        img = ImageEnhance.Sharpness(img).enhance(sharp_amount)
    return img


def jpg_target_190_199(img: Image.Image, min_kb=190, max_kb=199) -> bytes:
    min_b, max_b = min_kb * 1024, max_kb * 1024
    best = None
    low, high = 35, 98

    for _ in range(12):
        q = (low + high) // 2
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=False, progressive=False)
        data = buf.getvalue()

        if len(data) > max_b:
            high = q - 1
        else:
            best = data
            if len(data) >= min_b:
                return data
            low = q + 1

    if best is None:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80, optimize=False, progressive=False)
        best = buf.getvalue()

    if len(best) < min_b:
        target = min(max_b - 256, min_b + 1024)
        best += b" " * max(0, target - len(best))

    return best


@app.get("/")
def root():
    return {"status": "ok", "endpoint": "/process"}


@app.post("/process")
async def process(
    file: UploadFile = File(...),
    mode: str = Form("birefnet"),
    enhance: str = Form("true"),
    shadow: str = Form("false"),
    brightness: int = Form(105),
    contrast: int = Form(110),
    saturation: int = Form(108),
    sharpen: int = Form(18),
):
    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw))
        image = ImageOps.exif_transpose(image).convert("RGBA")

        try:
            if mode == "birefnet":
                rgba = remove_bg_birefnet(image)
            else:
                rgba = remove_bg_rembg(image)
        except Exception:
            rgba = remove_bg_rembg(image)

        out = fit_product_on_white(rgba, size=400, padding=28, shadow=(shadow == "true"))

        if enhance == "true":
            out = enhance_image(out, brightness, contrast, saturation, sharpen)

        jpg = jpg_target_190_199(out)
        return Response(content=jpg, media_type="image/jpeg")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

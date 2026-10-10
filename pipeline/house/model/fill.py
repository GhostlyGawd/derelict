"""Fills what the owner's painting does not show (9.3, the owner's painting as a source).

Run by pipeline/house/model/run.js, never by hand and never in CI:

    python fill.py <job.json>

A job is a list of pictures to fill. Each names an image, a mask (white is to
be painted, black is kept exactly), the words that say what is there, and the
file to write. The picture is painted in 512 px windows, each with the kept
paint all round it as the guide, and every window after the first sees what
the ones before it painted. Only masked pixels change, with a feathered edge.

A picture with nothing kept at all (a wall the painter had behind them) is
given a `donor`: a picture of the same kind of surface, set beside it in the
window as the guide and cropped off afterwards, so it is painted in the
painting's hand rather than from words alone.

Seeded and single-threaded, but a diffusion model is not promised byte for
byte across machines: its output is committed, with a hash of what went in.
"""

import json
import sys

import numpy as np
import torch
from diffusers import StableDiffusionInpaintPipeline
from PIL import Image, ImageFilter

MODEL = "stable-diffusion-v1-5/stable-diffusion-inpainting"
WIN = 512
STEP = 384

with open(sys.argv[1]) as f:
    job = json.load(f)

torch.manual_seed(0)
torch.set_num_threads(4)
pipe = StableDiffusionInpaintPipeline.from_pretrained(MODEL, torch_dtype=torch.float32, safety_checker=None)
pipe.set_progress_bar_config(disable=True)


def starts(n):
    if n <= WIN:
        return [0]
    s = list(range(0, n - WIN, STEP))
    return s + [n - WIN]


for k, item in enumerate(job["items"]):
    img = np.array(Image.open(item["image"]).convert("RGB")).astype(np.float32)
    mask = np.array(Image.open(item["mask"]).convert("L")) > 127
    H, W = mask.shape
    left = 0
    if item.get("donor"):
        donor = Image.open(item["donor"]).convert("RGB")
        donor = donor.resize((max(64, round(donor.width * H / donor.height)), H), Image.LANCZOS)
        left = min(donor.width, WIN // 2)
        img = np.concatenate([np.array(donor).astype(np.float32)[:, -left:], img], axis=1)
        mask = np.concatenate([np.zeros((H, left), bool), mask], axis=1)
    # A picture smaller than a window is mirrored out to one, and the mirror is never painted.
    ph, pw = max(0, WIN - img.shape[0]), max(0, WIN - img.shape[1])
    if ph or pw:
        img = np.pad(img, ((0, ph), (0, pw), (0, 0)), mode="reflect")
        mask = np.pad(mask, ((0, ph), (0, pw)), constant_values=False)
    todo = mask.copy()
    n = 0
    for y in starts(img.shape[0]):
        for x in starts(img.shape[1]):
            win = todo[y : y + WIN, x : x + WIN]
            if not win.any():
                continue
            m = Image.fromarray((win * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
            g = torch.Generator().manual_seed(item.get("seed", 1000 + k) + n)
            out = pipe(
                prompt=f"{item['prompt']}, {job['style']}",
                negative_prompt=job.get("negative", ""),
                image=Image.fromarray(np.clip(img[y : y + WIN, x : x + WIN] + 0.5, 0, 255).astype(np.uint8)),
                mask_image=m,
                num_inference_steps=job.get("steps", 30),
                guidance_scale=job.get("guidance", 6.5),
                generator=g,
                height=WIN,
                width=WIN,
            ).images[0]
            # Only what was to be painted changes, feathered into the kept paint round it.
            soft = np.array(m.filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255.0
            soft = np.maximum(soft * (np.array(m) > 0), win.astype(np.float32))[..., None]
            region = img[y : y + WIN, x : x + WIN]
            img[y : y + WIN, x : x + WIN] = region * (1 - soft) + np.array(out).astype(np.float32) * soft
            todo[y : y + WIN, x : x + WIN] = False
            n += 1
    img = img[:H, left : left + W]
    Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(item["out"], quality=93, subsampling=0, optimize=True)
    print("filled", item["out"], n, "windows", flush=True)

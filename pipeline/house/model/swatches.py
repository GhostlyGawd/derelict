"""Repeating textures grown from swatches of the owner's painting (9.3).

Run by pipeline/house/model/run.js, never by hand and never in CI:

    python swatches.py <job.json>

Each item names a swatch (a patch of the painting, already cut square-on by
swatch.js at the texture's own texels per metre), the size of texture to grow,
and the file to write. Two steps:

1. Image quilting (Efros and Freeman, 2001): the texture is laid out in
   overlapping blocks cut from the swatch, each chosen among those whose
   overlap matches what is already laid, and joined along the seam where the
   two differ least. It is the painting's own paint, rearranged, never
   invented.
2. Wrapping: the texture is rolled by half its size, so its edges meet in a
   cross through the middle, and the model repaints a narrow band along that
   cross from the paint either side. Rolled back, the texture repeats with no
   seam.

Seeded, but a diffusion model is not promised byte for byte across machines:
the outputs are committed, with a hash of what went in.
"""

import json
import sys

import numpy as np
import torch
from diffusers import StableDiffusionInpaintPipeline
from PIL import Image, ImageFilter

MODEL = "stable-diffusion-v1-5/stable-diffusion-inpainting"

with open(sys.argv[1]) as f:
    job = json.load(f)
torch.manual_seed(0)
torch.set_num_threads(4)
pipe = StableDiffusionInpaintPipeline.from_pretrained(MODEL, torch_dtype=torch.float32, safety_checker=None)
pipe.set_progress_bar_config(disable=True)


def min_cut(err, axis):
    """The cheapest path through an error surface, top to bottom (axis 0) or left to right (axis 1)."""
    e = err if axis == 0 else err.T
    h, w = e.shape
    cost = e.copy()
    for y in range(1, h):
        left = np.concatenate([[np.inf], cost[y - 1, :-1]])
        right = np.concatenate([cost[y - 1, 1:], [np.inf]])
        cost[y] += np.minimum(np.minimum(left, cost[y - 1]), right)
    path = np.zeros(h, int)
    path[-1] = int(np.argmin(cost[-1]))
    for y in range(h - 2, -1, -1):
        x = path[y + 1]
        lo, hi = max(0, x - 1), min(w, x + 2)
        path[y] = lo + int(np.argmin(cost[y, lo:hi]))
    mask = np.zeros((h, w), bool)
    for y in range(h):
        mask[y, : path[y]] = True  # True: keep what was there before
    return mask if axis == 0 else mask.T


def quilt(src, out_h, out_w, block, overlap, rng, tolerance=0.1):
    H, W, _ = src.shape
    step = block - overlap
    ny = int(np.ceil((out_h - overlap) / step))
    nx = int(np.ceil((out_w - overlap) / step))
    canvas = np.zeros((ny * step + overlap, nx * step + overlap, 3), np.float32)
    stride = max(1, int(np.sqrt((H - block + 1) * (W - block + 1) / 2500)))
    cands = [(y, x) for y in range(0, H - block + 1, stride) for x in range(0, W - block + 1, stride)]
    patches = np.stack([src[y : y + block, x : x + block] for y, x in cands])
    for by in range(ny):
        for bx in range(nx):
            y0, x0 = by * step, bx * step
            if by == 0 and bx == 0:
                canvas[y0 : y0 + block, x0 : x0 + block] = patches[rng.integers(len(cands))]
                continue
            region = canvas[y0 : y0 + block, x0 : x0 + block]
            errs = np.zeros(len(cands), np.float64)
            if bx > 0:
                errs += ((patches[:, :, :overlap] - region[None, :, :overlap]) ** 2).sum((1, 2, 3))
            if by > 0:
                errs += ((patches[:, :overlap] - region[None, :overlap]) ** 2).sum((1, 2, 3))
            ok = np.flatnonzero(errs <= errs.min() * (1 + tolerance) + 1e-6)
            k = ok[rng.integers(len(ok))]
            patch = patches[k].copy()
            keep = np.zeros((block, block), bool)
            if bx > 0:
                e = ((patch[:, :overlap] - region[:, :overlap]) ** 2).sum(2)
                keep[:, :overlap] |= min_cut(e, 0)
            if by > 0:
                e = ((patch[:overlap] - region[:overlap]) ** 2).sum(2)
                keep[:overlap] |= min_cut(e, 1)
            patch[keep] = region[keep]
            canvas[y0 : y0 + block, x0 : x0 + block] = patch
    return canvas[:out_h, :out_w]


def wrap(img, band, prompt, style, negative, seed, strength, axes="uv"):
    """Rolls the texture by half, repaints a band along the seams, and rolls it back."""
    h, w, _ = img.shape
    dy = h // 2 if "v" in axes else 0
    dx = w // 2 if "u" in axes else 0
    rolled = np.roll(img, (dy, dx), (0, 1))
    mask = np.zeros((h, w), np.uint8)
    if dy:
        mask[h // 2 - band : h // 2 + band] = 255
    if dx:
        mask[:, w // 2 - band : w // 2 + band] = 255
    # The model works at 512: a smaller texture is painted larger and brought back down.
    S = 512
    im = Image.fromarray(np.clip(rolled + 0.5, 0, 255).astype(np.uint8)).resize((S, S), Image.LANCZOS)
    m = Image.fromarray(mask).resize((S, S), Image.NEAREST)
    out = pipe(
        prompt=f"{prompt}, {style}",
        negative_prompt=negative,
        image=im,
        mask_image=m,
        num_inference_steps=30,
        guidance_scale=5.5,
        strength=strength,
        generator=torch.Generator().manual_seed(seed),
        height=S,
        width=S,
    ).images[0]
    out = np.array(out.resize((w, h), Image.LANCZOS)).astype(np.float32)
    soft = np.array(Image.fromarray(mask).filter(ImageFilter.GaussianBlur(band / 3))).astype(np.float32)[..., None] / 255.0
    mixed = rolled * (1 - soft) + out * soft
    return np.roll(mixed, (-dy, -dx), (0, 1))


for i, item in enumerate(job["items"]):
    src = np.array(Image.open(item["swatch"]).convert("RGB")).astype(np.float32)
    w, h = item["size"]
    rng = np.random.default_rng(item.get("seed", 7 + i))
    block = min(item.get("block", 48), src.shape[0] - 2, src.shape[1] - 2)
    if item.get("quilt", True):
        tex = quilt(src, h, w, block, max(6, block // 4), rng)
    else:
        # A pattern (the rug) is kept whole, only brought to size.
        tex = np.array(Image.fromarray(src.astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32)
    tex = wrap(tex, item.get("band", 10), item["prompt"], job["style"], job.get("negative", ""), item.get("seed", 7 + i), item.get("strength", 0.7), item.get("axes", "uv"))
    Image.fromarray(np.clip(tex + 0.5, 0, 255).astype(np.uint8)).save(item["out"])
    print("grew", item["out"], w, "x", h, flush=True)

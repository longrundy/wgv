"""
Build the rail mark from wgvflagwaivenb.gif (the pre-keyed source).

Why this source: the original white-background GIF had to be keyed here, and
light red blends along the waving flag fell under the red/navy threshold and
got painted white -- 30.3% of flag edge pixels came out near-white. This file
was keyed properly upstream, so its boundary is 0.1% near-white. Nothing to
key; only the recolour and the downscale happen here.

Still recoloured: the lettering is (36,36,85) navy, which is 1.12 contrast
against the #17325a rail and would be invisible.
"""
from PIL import Image
import numpy as np
import os

SRC   = 'wgvflagwaivenb.gif'
OUT_W = 170          # 2x the 85px CSS box
DEDUPE = 0.4
Q = 80
RAIL = np.array([0x17, 0x32, 0x5a], dtype=float)

im = Image.open(SRC)
n = im.n_frames
sw, sh = im.size
OUT_H = round(sh * OUT_W / sw)

def letter_top(rgba):
    """Topmost row holding real navy lettering. Strong blue dominance picks out
       (36,36,85) and its blends while excluding the flag's plum outline
       (108,36,85), where blue only matches red rather than beating it.
       Derived from the artwork so a replacement GIF re-measures itself."""
    p = rgba[..., :3].astype(float)
    a = rgba[..., 3].astype(float) / 255.
    navy = (a > 0.4) & (p[..., 2] > p[..., 0] + 30) & (p[..., 2] > p[..., 1] + 20)
    rows = np.where(navy.sum(axis=1) > 5)[0]
    return int(rows[0]) if len(rows) else rgba.shape[0]

def recolour(rgba, ltop):
    """Lettering -> white, flag kept. Returns premultiplied RGB + alpha."""
    p = rgba[..., :3].astype(float)
    a = rgba[..., 3].astype(float) / 255.
    r, g, b = p[..., 0], p[..., 1], p[..., 2]

    # Red against GREEN only, deliberately not against blue. The flag carries a
    # dark plum outline -- (108,36,85), (108,0,85), (72,0,85) -- where blue sits
    # level with red. Requiring r>b+40 as well threw that outline into the
    # lettering bucket and painted it white, which is what put a pale rim around
    # the waving edge. No lettering colour in this palette has r more than 40
    # above g, so testing green alone separates them cleanly.
    isred = r > g + 40

    # Above the lettering there is nothing but flag and pole, so nothing there
    # may turn white. Without this a handful of the flag's paler outline shades
    # sit just under the threshold and leave bright specks on the waving edge.
    isred[:ltop] = True

    colour = np.where(isred[..., None], p, np.array([255., 255., 255.]))
    return colour * a[..., None], a

# BOX, not LANCZOS. Lanczos rings at a sharp alpha edge: the premultiplied
# channels overshoot, and dividing that overshoot by a small alpha clips to
# pure white. That produced 350 forced-white pixels along the flag edge.
# BOX is a straight area average -- no overshoot, nothing to clip.
def resize(arr):
    if arr.ndim == 2:
        return np.asarray(Image.fromarray(arr.astype(np.float32), 'F')
                          .resize((OUT_W, OUT_H), Image.BOX), dtype=float)
    return np.dstack([resize(arr[..., c]) for c in range(arr.shape[2])])

def bleed(rgb, alpha, passes=4):
    """Push edge colour outward into the transparent margin. Lossy webp
       subsamples chroma across the alpha edge, so leaving black out there
       drags a dark rim onto the flag."""
    out = rgb.copy()
    known = alpha > 0.02
    for _ in range(passes):
        unknown = ~known
        if not unknown.any():
            break
        acc = np.zeros_like(out)
        cnt = np.zeros(out.shape[:2])
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(out, dy, 0), dx, 1) * np.roll(np.roll(known, dy, 0), dx, 1)[..., None]
            cnt += np.roll(np.roll(known, dy, 0), dx, 1)
        fill = unknown & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill][..., None]
        known = known | fill
    return out

im.seek(0)
LTOP = letter_top(np.array(im.convert('RGBA')))
print(f'lettering starts at row {LTOP} of {sh}; everything above is flag only')

frames, durations = [], []
prev = None
for i in range(n):
    im.seek(i)
    dur = im.info.get('duration', 50)
    rgba = np.array(im.convert('RGBA'))

    pm, a = recolour(rgba, LTOP)
    # downscale premultiplied so nothing bleeds across the alpha edge
    pm_s = np.clip(resize(pm), 0, 255)
    a_s = np.clip(resize(a), 0, 1)
    straight = np.clip(pm_s / np.maximum(a_s, 1e-6)[..., None], 0, 255)
    straight = bleed(straight, a_s)
    out = np.dstack([straight, a_s * 255.]).astype(np.uint8)

    # the source holds each pose over several frame slots; collapse the runs
    # and roll their time into the frame we keep, so the motion is unchanged
    if prev is not None and np.abs(out.astype(int) - prev.astype(int)).mean() < DEDUPE:
        durations[-1] += dur
        continue
    frames.append(Image.fromarray(out, 'RGBA'))
    durations.append(dur)
    prev = out

print(f'source  {sw}x{sh}  {n} frames')
print(f'kept    {len(frames)} unique frames, {sum(durations)}ms total')
print(f'output  {OUT_W}x{OUT_H}')

# measure the flag edge the same way the complaint was measured
f0 = np.array(frames[0]).astype(float)
al = f0[..., 3] / 255.
top = slice(0, int(OUT_H * 0.42))
sel = (al[top] > 0.05) & (al[top] < 0.98)
edge = f0[..., :3][top][sel]
print(f'flag edge: {sel.sum()} partial pixels, '
      f'{(edge.min(axis=1) > 170).mean() * 100:.1f}% near-white')

def on_rail(img, scale=2):
    a = np.array(img).astype(float)
    aa = a[..., 3:4] / 255.
    flat = (a[..., :3] * aa + RAIL * (1 - aa)).astype(np.uint8)
    return Image.fromarray(flat).resize((img.width * scale, img.height * scale), Image.LANCZOS)

on_rail(frames[0]).save('rebuilt_on_rail.png')
Image.fromarray(np.array(on_rail(frames[0], 4))[60:300, 240:600]).save('rebuilt_flagedge.png')

# guarantee the thing that was actually wrong: no pale rim on the flag
def dilate(m, k):
    o = m.copy()
    for _ in range(k):
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
            o = o | np.roll(np.roll(m, dy, 0), dx, 1)
        m = o.copy()
    return o

rim = 0
for fr in frames:
    a = np.array(fr).astype(float)
    al = a[..., 3] / 255.
    rgb = a[..., :3]
    zone = np.zeros_like(al, bool)
    zone[:int(a.shape[0] * .32)] = True
    red = (al > 0.4) & (rgb[..., 0] > rgb[..., 1] + 40) & zone
    pale = (dilate(red, 2) & ~red) & (al > 0.35) & (rgb.min(axis=2) > 150)
    rim += pale.sum()
assert rim == 0, f'{rim} pale pixels ring the flag; the recolour rule has regressed'
print(f'flag rim: {rim} pale pixels above alpha 0.35 (must be 0)')

frames[0].save('wgv_rail.webp', save_all=True, append_images=frames[1:],
               duration=durations, loop=0, quality=Q, method=6)
frames[0].save('wgv_rail_static.webp', quality=90, method=6)
print(f'webp    {os.path.getsize("wgv_rail.webp")/1024:.1f} KB  '
      f'(still {os.path.getsize("wgv_rail_static.webp")/1024:.1f} KB)')

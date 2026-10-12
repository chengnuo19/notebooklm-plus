"""Generate NotebookLM Plus extension icons (16/48/128) with pure stdlib.

Brand-blue rounded square + white ring + white check (a "correct answer" motif).
No third-party deps (no PIL). Run: python tools/make_icons.py
"""
import math
import os
import struct
import zlib

BG = (37, 99, 235)       # #2563EB
WHITE = (255, 255, 255)


def write_png(path, w, h, pixels):
    def chunk(typ, data):
        body = typ + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0 (None)
        for x in range(w):
            raw += bytes(pixels[y * w + x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def dist_seg(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0.0, 1.0)
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def blend(bg, fg, t):
    return tuple(int(round(bg[i] + (fg[i] - bg[i]) * t)) for i in range(3))


def make(s):
    r_corner = s * 0.22
    cx, cy = s / 2.0, s / 2.0
    circle_r = s * 0.34
    ring_w = s * 0.085
    a = (s * 0.34, s * 0.52)
    b = (s * 0.45, s * 0.63)
    c = (s * 0.68, s * 0.38)
    check_w = s * 0.075
    px = []
    for y in range(s):
        for x in range(s):
            fx, fy = x + 0.5, y + 0.5
            # rounded-rect alpha
            rx, ry = min(fx, s - fx), min(fy, s - fy)
            alpha = 1.0
            if rx < r_corner and ry < r_corner:
                dd = math.hypot(r_corner - rx, r_corner - ry)
                alpha = clamp(r_corner - dd + 0.5, 0.0, 1.0)
            # white check + ring over brand bg (soft 1px edge)
            dcheck = min(dist_seg(fx, fy, *a, *b), dist_seg(fx, fy, *b, *c))
            ring = abs(math.hypot(fx - cx, fy - cy) - circle_r)
            cov = max(clamp(check_w / 2 - dcheck + 0.5, 0.0, 1.0),
                      clamp(ring_w / 2 - ring + 0.5, 0.0, 1.0))
            col = blend(BG, WHITE, cov)
            px.append((col[0], col[1], col[2], int(round(255 * alpha))))
    return px


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "src", "assets")
    os.makedirs(out, exist_ok=True)
    for sz in (16, 48, 128):
        write_png(os.path.join(out, "icon{}.png".format(sz)), sz, sz, make(sz))
        print("wrote icon{}.png".format(sz))


if __name__ == "__main__":
    main()

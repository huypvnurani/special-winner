"""Sinh icon PNG cho PWA (không cần thư viện ngoài): nền màu thương hiệu + chữ cái trắng.

    python3 tools/make_icons.py                 # dùng màu/chữ mặc định bên dưới
    python3 tools/make_icons.py "#4f46e5" YS    # màu hex + 1–2 ký tự (A–Z, 0–9)

Muốn icon vẽ tay đẹp hơn: thay hàm draw() (xem YuhScan/tools/make_icons.py) hoặc chép PNG
của mình vào public/icons/ với đúng 4 tên: icon-192, icon-512, icon-maskable-512, apple-touch-icon.
"""
import os
import struct
import sys
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
COLOR = sys.argv[1] if len(sys.argv) > 1 else '#C9524D'
TEXT = (sys.argv[2] if len(sys.argv) > 2 else 'YT').upper()[:2]
FG = (255, 255, 255, 255)

# Font bitmap 5x7
FONT = {
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '01110 00100 00100 00100 00100 00100 01110', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 10001 11001 10101 10011 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 10101 01010', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def png(path, size, px):
    raw = b''.join(b'\x00' + bytes(v for p in px[y * size:(y + 1) * size] for v in p) for y in range(size))

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def draw(size, radius, inset):
    """radius: bo góc nền (0 = vuông, cho maskable/apple). inset: lề an toàn quanh chữ (0..0.5)."""
    bg = hex_rgb(COLOR)
    clear = (0, 0, 0, 0)
    r = radius * size
    px = []
    for y in range(size):
        for x in range(size):
            # Bo góc: điểm nằm ngoài cung tròn ở 4 góc thì trong suốt
            cx = min(max(x + 0.5, r), size - r)
            cy = min(max(y + 0.5, r), size - r)
            px.append(bg if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r else clear)

    glyphs = [FONT.get(ch, FONT['O']).split() for ch in TEXT] or [FONT['O'].split()]
    cols = len(glyphs) * 5 + (len(glyphs) - 1)       # 1 cột trống giữa 2 chữ
    box = size * (1 - 2 * inset)
    cell = int(min(box / cols, box / 7 * 0.75))
    x0 = (size - cols * cell) // 2
    y0 = (size - 7 * cell) // 2
    for gi, g in enumerate(glyphs):
        for row, bits in enumerate(g):
            for col, b in enumerate(bits):
                if b != '1':
                    continue
                gx = x0 + (gi * 6 + col) * cell
                gy = y0 + row * cell
                for yy in range(gy, gy + cell):
                    px[yy * size + gx:yy * size + gx + cell] = [FG] * cell
    return px


os.makedirs(OUT, exist_ok=True)
for name, size, radius, inset in (('icon-192.png', 192, 0.22, 0.2), ('icon-512.png', 512, 0.22, 0.2),
                                  ('apple-touch-icon.png', 180, 0, 0.2), ('icon-maskable-512.png', 512, 0, 0.3)):
    png(os.path.join(OUT, name), size, draw(size, radius, inset))
    print('wrote', name)

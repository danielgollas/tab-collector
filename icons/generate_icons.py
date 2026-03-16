# Generate Tab Collector icons using pure Python
# Design: 2 stacked colored tab cards on a rounded dark background
import struct, zlib, math

def create_png(size, filename):
    """Create a tab-collector icon as PNG."""
    pixels = []
    s = size

    def in_rounded_rect(x, y, rx, ry, rw, rh, corner_r):
        """Check if (x,y) is inside a rounded rectangle."""
        if x < rx or x > rx + rw or y < ry or y > ry + rh:
            return False
        if x < rx + corner_r:
            cx = rx + corner_r
        elif x > rx + rw - corner_r:
            cx = rx + rw - corner_r
        else:
            cx = x
        if y < ry + corner_r:
            cy = ry + corner_r
        elif y > ry + rh - corner_r:
            cy = ry + rh - corner_r
        else:
            cy = y
        if cx == x and cy == y:
            return True
        dx = x - cx
        dy = y - cy
        return (dx * dx + dy * dy) <= corner_r * corner_r

    def blend(bg, fg, alpha):
        a = alpha / 255.0
        return [
            int(bg[0] * (1 - a) + fg[0] * a),
            int(bg[1] * (1 - a) + fg[1] * a),
            int(bg[2] * (1 - a) + fg[2] * a),
            min(255, bg[3] + alpha),
        ]

    # Colors
    bg_color = [52, 73, 94]
    tab_colors = [
        [66, 133, 244],   # blue
        [52, 168, 83],     # green
    ]
    tab_accent = [
        [100, 160, 255],   # light blue
        [87, 202, 118],    # light green
    ]

    # Background
    pad = s * 0.06
    corner = s * 0.15

    # Card dimensions — bigger cards, only 2
    card_w = s * 0.76
    card_h = s * 0.26
    card_x = (s - card_w) / 2
    card_corner = s * 0.07
    tab_notch_w = card_w * 0.38
    tab_notch_h = card_h * 0.38

    # Vertical layout for 2 cards
    card_gap = s * 0.1
    total_h = card_h * 2 + card_gap
    start_y = (s - total_h) / 2

    for y in range(s):
        row = []
        for x in range(s):
            pixel = [0, 0, 0, 0]

            # Background rounded square
            if in_rounded_rect(x, y, pad, pad, s - 2 * pad, s - 2 * pad, corner):
                pixel = bg_color + [255]

            # Draw 2 tab cards
            for i in range(2):
                cy = start_y + i * (card_h + card_gap)
                color = tab_colors[i]
                accent = tab_accent[i]

                # Main card body
                if in_rounded_rect(x, y, card_x, cy, card_w, card_h, card_corner):
                    pixel = color + [255]

                # Tab notch on top-left
                notch_x = card_x
                notch_y = cy - tab_notch_h
                if notch_y >= pad and in_rounded_rect(x, y, notch_x, notch_y, tab_notch_w, tab_notch_h + card_corner, card_corner * 0.7):
                    if y < cy:
                        pixel = accent + [255]

                # Content lines on card
                line_y1 = cy + card_h * 0.35
                line_y2 = cy + card_h * 0.65
                line_x_start = card_x + card_w * 0.08
                line_x_end1 = card_x + card_w * 0.7
                line_x_end2 = card_x + card_w * 0.5
                line_thick = max(1, s * 0.025)

                if line_x_start <= x <= line_x_end1 and line_y1 <= y <= line_y1 + line_thick:
                    pixel = blend(pixel, [255, 255, 255], 70)
                if line_x_start <= x <= line_x_end2 and line_y2 <= y <= line_y2 + line_thick:
                    pixel = blend(pixel, [255, 255, 255], 70)

            row.extend(pixel)
        pixels.append(bytes([0] + row))

    raw = b''.join(pixels)

    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', s, s, 8, 6, 0, 0, 0)
    compressed = zlib.compress(raw)

    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))

base = '/Users/dgollas/projects/tab-collector/icons'
create_png(16, f'{base}/icon16.png')
create_png(48, f'{base}/icon48.png')
create_png(128, f'{base}/icon128.png')
print("Icons generated.")

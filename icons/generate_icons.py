# Generate simple PNG icons for the extension using pure Python
import struct, zlib

def create_png(size, filename):
    """Create a simple tab-collector icon as PNG."""
    pixels = []
    center = size / 2
    radius = size * 0.4
    
    for y in range(size):
        row = []
        for x in range(size):
            dx = x - center + 0.5
            dy = y - center + 0.5
            dist = (dx*dx + dy*dy) ** 0.5
            
            if dist <= radius:
                # Blue circle with a folder/tab shape
                # Draw a simple folder tab notch at the top
                tab_left = center - radius * 0.5
                tab_right = center + radius * 0.1
                tab_top = center - radius * 0.85
                tab_bottom = center - radius * 0.55
                
                if tab_left <= x <= tab_right and tab_top <= y <= tab_bottom:
                    # Lighter blue for the tab
                    row.extend([100, 160, 255, 255])
                elif y > tab_bottom or x > tab_right or x < tab_left:
                    # Main circle body
                    row.extend([66, 133, 244, 255])
                else:
                    row.extend([66, 133, 244, 255])
            else:
                row.extend([0, 0, 0, 0])
        pixels.append(bytes([0] + row))  # filter byte + RGBA
    
    raw = b''.join(pixels)
    
    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    compressed = zlib.compress(raw)
    
    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))

create_png(16, '/home/user/tab-collector/icons/icon16.png')
create_png(48, '/home/user/tab-collector/icons/icon48.png')
create_png(128, '/home/user/tab-collector/icons/icon128.png')
print("Icons generated.")

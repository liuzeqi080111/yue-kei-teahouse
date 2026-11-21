"""Redraw the baked street signs at the exported panels' aspect ratios.

Run after neighborhood-walk/build.py exports the district from Blender:
    python scripts/rebuild-street-signs.py exported-district.glb assets/street/district.glb

Requires Pillow, NumPy and the Windows KaiTi/Georgia fonts. Only sign
material/image assignments are edited.
"""

import argparse
from copy import deepcopy
from io import BytesIO
import json
import os
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFont


# Original names and enamel colours from the afternoon, walking and Yue Kei kits.
SIGNS = {
    'wash': ('海興洗衣', 'HOI HING   /   LAUNDRY', '#316a73', '#fff1cc'),
    'mansion': ('安和樓', 'ON WO BUILDING   /   1968', '#713e31', '#f5d395'),
    'market': ('榕下夜市', 'BANYAN MARKET', '#a34630', '#fff0c9'),
    'records': ('永聲唱片', 'WING SING   /   RECORDS', '#704638', '#f4d49d'),
    'tailor': ('玲記衣檔', 'LING KEE   /   CLOTHING', '#455e6d', '#fff0ce'),
    'cart': ('街坊雜貨', 'NEIGHBOURHOOD SUNDRIES', '#9b653a', '#ffe3a6'),
    'garden': ('榕蔭小坐', 'BANYAN REST GARDEN', '#486747', '#eee5b9'),
    'tea-street': ('廟街', 'TEMPLE STREET', '#274d41', '#f8e9c4'),
    'lane': ('安和里', 'ON WO LANE', '#274d41', '#f8e9c4'),
    'bakery': ('南洋餅家', 'NANYANG BAKERY', '#9b6652', '#fae4b2'),
    'herbal': ('春生藥房', 'CHUN SANG DISPENSARY', '#495b49', '#e7d8ac'),
    'radio': ('光華電器', 'KWONG WAH ELECTRIC', '#716555', '#f5e6c2'),
    'hours': ('即日磅洗', 'WASH   •   DRY   •   PRESS', '#e7dbbb', '#436668'),
    'notice': ('街坊告示', 'RESIDENTS’ NOTICE BOARD', '#dac99c', '#664f3f'),
    'number': ('廿三', '23   ON WO LANE', '#405a59', '#ebe4c9'),
    'shing': ('成記', 'SHING KEE', '#964132', '#f6d9a0'),
    'rice': ('成記糧油', 'SHING KEE   •   RICE MERCHANT', '#3c5346', '#f3ddb3'),
    'clothier': ('永泰布莊', 'WING TAI   /   FABRICS', '#874b43', '#fae6b4'),
    'printshop': ('新光印務', 'SUN KWONG LETTERPRESS', '#3e6264', '#f1d4a4'),
    'fascia': ('粵記茶餐廳', 'Y U E   K E I     •     H O N G   K O N G', '#17463f', '#fed99a'),
    'blade': ('冰室', '粵 記', '#e8cc89', '#a83f32'),
}
FONTS = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'


def draw_sign(key, width, height):
    title, caption, background, ink = SIGNS[key]
    image = Image.new('RGB', (width, height), background)
    draw = ImageDraw.Draw(image)
    unit = min(width, height)
    border = {'fascia': '#dcc18c', 'blade': '#964832'}.get(key, ink)
    for margin, weight in [(0.045, 0.013), (0.082, 0.005)]:
        inset = round(unit * margin)
        draw.rounded_rectangle((inset, inset, width - 1 - inset, height - 1 - inset),
                               radius=round(unit * 0.045), outline=border,
                               width=max(1, round(unit * weight)))

    def line(text, x, y, max_width, max_height, *, tracking=0, font='STKAITI.TTF', fill=ink):
        size = round(max_height * 1.16)
        while True:
            face = ImageFont.truetype(FONTS / font, size)
            parts = list(text) if tracking else [text]
            boxes = [draw.textbbox((0, 0), part, font=face) for part in parts]
            top = min(box[1] for box in boxes)
            bottom = max(box[3] for box in boxes)
            widths = [box[2] - box[0] for box in boxes]
            span = sum(widths) + tracking * (len(parts) - 1)
            if span <= max_width and bottom - top <= max_height:
                break
            size -= 1
        left = x - span / 2
        for part, box, part_width in zip(parts, boxes, widths):
            draw.text((round(left - box[0]), round(y - (top + bottom) / 2)), part, font=face, fill=fill)
            left += part_width + tracking
        return span

    if key in {'shing', 'blade'}:
        for letter, y in zip(title, (0.30, 0.61)):
            line(letter, width / 2, height * y, width * 0.69, height * 0.25)
        line(caption, width / 2, height * 0.85, width * 0.70, height * 0.095,
             font='STKAITI.TTF' if key == 'blade' else 'georgiab.ttf',
             fill='#17483c' if key == 'blade' else ink)
    else:
        ratio = width / height
        spacing = min(height * 0.90, max(height * 0.065, (width - 4 * height) * 0.074))
        title_width = line(title, width / 2, height * 0.401, width * 0.77, height * 0.47,
                           tracking=spacing)
        line(caption, width / 2, height * 0.759, width * 0.78, height * 0.15,
             font='georgiab.ttf')
        if key == 'fascia':
            for side, text in [(0.107, '港 式'), (0.893, '茶 座')]:
                x, y = width * side, height * 0.49
                draw.ellipse((x - height * 0.30, y - height * 0.24,
                              x + height * 0.30, y + height * 0.24),
                             outline='#aa936d', width=max(1, height // 140))
                line(text, x, y, height * 0.49, height * 0.15)
        elif ratio >= 7:
            # Keep the long fascia visually balanced without stretching the type.
            y = round(height * 0.49)
            outer = round(height * 0.43)
            inner = round((width - title_width) / 2 - height * 0.59)
            draw.line((outer, y, inner, y), fill=ink, width=max(1, height // 150))
            draw.line((width - inner, y, width - outer, y), fill=ink, width=max(1, height // 150))

    stream = BytesIO()
    image.save(stream, format='PNG', optimize=True)
    return stream.getvalue()


def read_glb(path):
    raw = path.read_bytes()
    magic, version, total, json_size, kind = struct.unpack_from('<4sIII4s', raw)
    if (magic, version, total, kind) != (b'glTF', 2, len(raw), b'JSON'):
        raise ValueError(f'{path} is not a glTF 2.0 binary asset')
    binary_size, kind = struct.unpack_from('<I4s', raw, 20 + json_size)
    if kind != b'BIN\0' or binary_size != len(raw) - 28 - json_size:
        raise ValueError(f'{path} must contain one embedded buffer')
    gltf = json.loads(raw[20:20 + json_size])
    buffer = memoryview(raw)[28 + json_size:]
    views = [buffer[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
             for view in gltf['bufferViews']]
    return gltf, views


def accessor(gltf, views, index):
    item = gltf['accessors'][index]
    view = gltf['bufferViews'][item['bufferView']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[item['type']]
    dtype = np.dtype({5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[item['componentType']])
    return np.ndarray((item['count'], components), dtype, views[item['bufferView']],
                      item.get('byteOffset', 0), (view.get('byteStride', dtype.itemsize * components), dtype.itemsize))


def panel_dimensions(gltf, views, node, primitive):
    attributes = primitive['attributes']
    positions = accessor(gltf, views, attributes['POSITION']) * node.get('scale', [1, 1, 1])
    uv = accessor(gltf, views, attributes['TEXCOORD_0'])
    indices = accessor(gltf, views, primitive['indices']).reshape(-1, 3)
    points, coords = positions[indices], uv[indices]
    if not (np.allclose(uv.min(0), 0) and np.allclose(uv.max(0), 1)):
        raise ValueError(f"{node['name']} does not map the full sign texture")
    # World-space steps for one unit of U and of V, for every triangle.
    axes = np.linalg.solve(coords[:, 1:] - coords[:, :1], points[:, 1:] - points[:, :1])
    sizes = np.linalg.norm(axes, axis=2)
    if (not np.allclose(sizes, sizes[0], atol=1e-5)
            or not np.allclose((axes[:, 0] * axes[:, 1]).sum(axis=1), 0, atol=1e-5)):
        raise ValueError(f"{node['name']} has incompatible or skewed sign faces in one primitive")
    return sizes[0]


def write_glb(gltf, views, destination):
    binary = bytearray()
    for view, payload in zip(gltf['bufferViews'], views, strict=True):
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(payload)
        binary.extend(payload)
        binary.extend(b'\0' * (-len(binary) % 4))
    gltf['buffers'][0]['byteLength'] = len(binary)
    header = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    header += b' ' * (-len(header) % 4)
    with destination.open('wb') as output:
        output.write(struct.pack('<4sIII4s', b'glTF', 2, 28 + len(header) + len(binary), len(header), b'JSON'))
        output.write(header)
        output.write(struct.pack('<I4s', len(binary), b'BIN\0'))
        output.write(binary)


def rebuild(source, destination):
    gltf, views = read_glb(source)
    materials, textures, images = (gltf[name] for name in ('materials', 'textures', 'images'))
    originals = {material['name']: i for i, material in enumerate(materials)}
    layouts = {}
    for node in gltf['nodes']:
        if 'mesh' not in node:
            continue
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            index = primitive['material']
            key = materials[index]['name'].split('@')[0]
            if key not in SIGNS:
                continue
            metres_w, metres_h = panel_dimensions(gltf, views, node, primitive)
            ratio = metres_w / metres_h
            height = min(320 if ratio < 1 else 224, int(4096 / ratio))
            width = round(height * ratio)
            layouts.setdefault(key, {}).setdefault((width, height), []).append(primitive)

    missing = SIGNS.keys() - layouts.keys()
    if missing:
        raise ValueError(f"District is missing sign materials: {', '.join(sorted(missing))}")

    for key, sizes in layouts.items():
        base = originals[key]
        for offset, ((width, height), primitives) in enumerate(sizes.items()):
            name = key if offset == 0 else f'{key}@{width}x{height}'
            if name in originals:
                index = originals[name]
            else:
                material = deepcopy(materials[base])
                material['name'] = name
                texture = material['pbrMetallicRoughness']['baseColorTexture']
                textures.append({**textures[texture['index']], 'source': len(images)})
                texture['index'] = len(textures) - 1
                images.append({'name': name, 'mimeType': 'image/png', 'bufferView': len(views)})
                views.append(b'')
                gltf['bufferViews'].append({'buffer': 0})
                index = len(materials)
                materials.append(material)
            texture_index = materials[index]['pbrMetallicRoughness']['baseColorTexture']['index']
            image = images[textures[texture_index]['source']]
            views[image['bufferView']] = draw_sign(key, width, height)
            for primitive in primitives:
                primitive['material'] = index
    write_glb(gltf, views, destination)
    print(f'Rebuilt {sum(len(sizes) for sizes in layouts.values())} sign textures across '
          f'{sum(len(panels) for sizes in layouts.values() for panels in sizes.values())} primitives.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='input district GLB')
    parser.add_argument('destination', type=Path, help='output district GLB')
    args = parser.parse_args()
    rebuild(args.source, args.destination)

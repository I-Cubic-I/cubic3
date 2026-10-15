# 팔 아래 구역의 점: 위치 격자별 색 종류(망토 파랑·튜닉 크림·가죽 갈색·피부·기타) 개수
import bpy, sys
from collections import defaultdict
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]; me = o.data
bsdf = [n for n in o.active_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
img = bsdf.inputs['Base Color'].links[0].from_node.image; W, H = img.size; px = img.pixels[:]
uvl = me.uv_layers.active.data
def kind(u, v):
    x = min(W-1, max(0, int(u*W))); y = min(H-1, max(0, int(v*H))); k = (y*W+x)*4; r, g, b = px[k], px[k+1], px[k+2]
    if b > r * 1.4 and b > 0.25: return 'blue'
    if r > 0.75 and g > 0.65 and b > 0.45: return 'cream'
    if r > 0.6 and 0.3 < g < 0.7 and b < 0.55 and r > g * 1.15: return 'skin'
    if r < 0.6 and g < 0.4 and r > b: return 'brown'
    return 'other'
grid = defaultdict(lambda: defaultdict(int))
for p in me.polygons:
    for li in p.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        for side, sx in (('R', -1), ('L', 1)):
            if sx * co.x > 0.18 and -0.5 < co.z < 0.25:
                key = (side, round(abs(co.x) * 10) / 10, round(co.z * 10) / 10, 'front' if co.y < -0.05 else ('mid' if co.y < 0.12 else 'back'))
                grid[key][kind(*uvl[li].uv)] += 1
for k in sorted(grid):
    d = grid[k]; print('G', k, dict(d))

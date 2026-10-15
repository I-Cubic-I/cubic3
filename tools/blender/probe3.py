# 리깅된 모델에서 오른쪽 팔 근처 점: 색 종류별 · (|x|, z) 격자별로 팔 가중치 평균과 y 범위
import bpy, sys
from collections import defaultdict
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.vertex_groups][0]; me = o.data
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
names = {g.index: g.name for g in o.vertex_groups}
vk = {}
for p in me.polygons:
    for li in p.loop_indices: vk[me.loops[li].vertex_index] = kind(*uvl[li].uv)
want = sys.argv[sys.argv.index('--') + 2]
grid = defaultdict(list)
for v in me.vertices:
    co = v.co
    if co.x < -0.16 and -0.45 < co.z < 0.25 and co.y < 0.15 and vk.get(v.index) == want:
        aw = sum(g.weight for g in v.groups if names[g.group].endswith('.R'))
        grid[(round(-co.x * 25) / 25, round(co.z * 25) / 25)].append((aw, co.y))
for k in sorted(grid, key=lambda k: (-k[1], k[0])):
    L = grid[k]; print(k, len(L), 'arm %.2f' % (sum(a for a, _ in L) / len(L)), 'y %.2f..%.2f' % (min(y for _, y in L), max(y for _, y in L)))

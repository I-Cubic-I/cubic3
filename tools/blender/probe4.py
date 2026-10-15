# 크림 끝동(팔 가중치 1인 크림 점)에서 크림 점끼리 이어진 데로 번져 가며, 어디까지 닿는지(거리별)
import bpy, sys
from collections import defaultdict
import heapq
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
votes = defaultdict(lambda: defaultdict(int))
for p in me.polygons:
    for li in p.loop_indices: votes[me.loops[li].vertex_index][kind(*uvl[li].uv)] += 1
vk = {i: max(d, key=d.get) for i, d in votes.items()}
adj = defaultdict(list)
for e in me.edges:
    a, b = e.vertices; adj[a].append(b); adj[b].append(a)
for side, sx in (('R', -1), ('L', 1)):
    seeds = [v.index for v in me.vertices if vk.get(v.index) == 'cream' and sx * v.co.x > 0.31 and sum(g.weight for g in v.groups if names[g.group].endswith('.' + side)) > 0.95]
    dist = {i: 0.0 for i in seeds}; h = [(0.0, i) for i in seeds]
    while h:
        d, i = heapq.heappop(h)
        if d > dist.get(i, 9): continue
        for j in adj[i]:
            if vk.get(j) not in ('cream', 'skin'): continue
            nd = d + (me.vertices[i].co - me.vertices[j].co).length
            if nd < dist.get(j, 9) and nd < 0.5: dist[j] = nd; heapq.heappush(h, (nd, j))
    grid = defaultdict(list)
    for i, d in dist.items():
        if d == 0: continue
        co = me.vertices[i].co; grid[(round(sx * co.x * 25) / 25, round(co.z * 25) / 25)].append((d, co.y))
    print('SIDE', side, len(seeds), len(dist))
    for k in sorted(grid, key=lambda k: (-k[1], k[0])):
        L = grid[k]; print(side, k, len(L), 'geo %.2f' % min(d for d, _ in L), 'y %.2f..%.2f' % (min(y for _, y in L), max(y for _, y in L)))

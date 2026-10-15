# 리깅 결과 점검: 오른팔을 앞으로 들어(지팡이 들기와 같은 축) 많이 늘어난 모서리의 점들(색 종류·자리·팔 가중치)
import bpy, sys, math
from collections import defaultdict
from mathutils import Matrix, Vector
src = sys.argv[sys.argv.index('--') + 1]; ang = float(sys.argv[sys.argv.index('--') + 2]); bone = sys.argv[sys.argv.index('--') + 3]; axis = sys.argv[sys.argv.index('--') + 4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.vertex_groups][0]; me = o.data
rig = [x for x in bpy.context.scene.objects if x.type == 'ARMATURE'][0]
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
votes = defaultdict(lambda: defaultdict(int))
for p in me.polygons:
    for li in p.loop_indices: votes[me.loops[li].vertex_index][kind(*uvl[li].uv)] += 1
vk = {i: max(d, key=d.get) for i, d in votes.items()}
names = {g.index: g.name for g in o.vertex_groups}
mw = o.matrix_world
P0 = [mw @ v.co for v in me.vertices]
pb = [b for b in rig.pose.bones if b.name.replace('.', '') == bone.replace('.', '')][0]
bpy.context.view_layer.update()
R = Matrix.Rotation(ang, 4, axis)
hw = rig.matrix_world @ pb.head
M = rig.matrix_world.inverted() @ Matrix.Translation(hw) @ R @ Matrix.Translation(-hw) @ rig.matrix_world @ pb.matrix
pb.matrix = M
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); em = ev.to_mesh()
P1 = [ev.matrix_world @ v.co for v in em.vertices]
print('HAND', [round(c, 2) for c in (rig.matrix_world @ [b for b in rig.pose.bones if b.name.startswith('hand') and b.name.endswith('R')][0].head)])
bad = defaultdict(lambda: [0, 0.0, 0.0])
for e in me.edges:
    a, b = e.vertices; l0 = (P0[a] - P0[b]).length; l1 = (P1[a] - P1[b]).length
    if l0 > 1e-5 and l1 / l0 > 2.0 and l1 > 0.02:
        for i in (a, b):
            v = me.vertices[i]; aw = sum(g.weight for g in v.groups if names[g.group].endswith('R') and names[g.group] != 'spine')
            k = (vk.get(i), round(P0[i].x * 25) / 25, round(P0[i].y * 25) / 25, round(P0[i].z * 25) / 25)
            bad[k][0] += 1; bad[k][1] += aw; bad[k][2] = max(bad[k][2], l1 / l0)
print('NBAD', len(bad))
for k in sorted(bad, key=lambda k: -bad[k][0])[:60]:
    n, s, mx = bad[k]; print('B', k, n, 'arm %.2f' % (s / n), 'x%.1f' % mx)

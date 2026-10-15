# 뼈대 모델에서 오른팔 쪽 점들의 위치·가중치를 찍어 본다
import bpy, sys
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH' and x.vertex_groups][0]
names = {g.index: g.name for g in o.vertex_groups}
mw = o.matrix_world
rows = []
for v in o.data.vertices:
    p = mw @ v.co
    if p.x < -0.25 and -0.2 < p.z < 0.25:
        w = sorted(((names[g.group], round(g.weight, 2)) for g in v.groups), key=lambda t: -t[1])[:2]
        rows.append((round(p.x, 2), round(p.y, 2), round(p.z, 2), w))
print('N', len(rows))
import random; random.seed(1)
for r in random.sample(rows, min(40, len(rows))): print('P', r)
print('MW', [list(map(lambda x: round(x, 3), r)) for r in mw])

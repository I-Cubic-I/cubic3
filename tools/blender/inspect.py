# Blender 백그라운드 분석: 모델 크기와 높이별 왼쪽(지팡이 쪽) 점 분포
import bpy, sys
from collections import defaultdict
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print('MESHES', [(o.name, len(o.data.vertices), tuple(round(v, 3) for v in o.dimensions)) for o in objs])
o = objs[0]; mw = o.matrix_world
vs = [mw @ v.co for v in o.data.vertices]
xs = [v.x for v in vs]; ys = [v.y for v in vs]; zs = [v.z for v in vs]
print('BOUNDS x', round(min(xs),3), round(max(xs),3), 'y', round(min(ys),3), round(max(ys),3), 'z', round(min(zs),3), round(max(zs),3))
# Blender는 Z가 위. 높이(z) 구간마다 x 분포
for k in range(20):
    z0 = min(zs) + (max(zs) - min(zs)) * k / 20; z1 = z0 + (max(zs) - min(zs)) / 20
    sl = [v for v in vs if z0 <= v.z < z1]
    if not sl: continue
    xx = sorted(v.x for v in sl)
    print(f'z {z0:.2f}..{z1:.2f} n={len(sl)} x[{xx[0]:.2f},{xx[-1]:.2f}] left<-0.35: {sum(1 for v in sl if v.x < -0.35)} right>0.35: {sum(1 for v in sl if v.x > 0.35)}')

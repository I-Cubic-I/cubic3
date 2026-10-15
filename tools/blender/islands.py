# 연결된 덩어리(섬)별 크기·범위: 지팡이가 따로 떨어진 덩어리인지 본다
import bpy, bmesh, sys
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
seen = set(); isl = []
for v in bm.verts:
    if v.index in seen: continue
    stack = [v]; comp = []; seen.add(v.index)
    while stack:
        a = stack.pop(); comp.append(a)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen: seen.add(b.index); stack.append(b)
    isl.append(comp)
isl.sort(key=len, reverse=True)
print('ISLANDS', len(isl))
for c in isl[:12]:
    xs = [v.co.x for v in c]; ys = [v.co.y for v in c]; zs = [v.co.z for v in c]
    print(f'n={len(c)} x[{min(xs):.2f},{max(xs):.2f}] y[{min(ys):.2f},{max(ys):.2f}] z[{min(zs):.2f},{max(zs):.2f}]')
# 지팡이 기둥: 왼쪽(x<-0.36) 점들의 높이별 중심
import statistics as st
for k in range(10):
    z0 = -0.95 + k * 0.19; sl = [v.co for v in bm.verts if z0 <= v.co.z < z0 + 0.19 and v.co.x < -0.36]
    if sl: print(f'z {z0:.2f} n={len(sl)} cx={st.mean(p.x for p in sl):.3f} cy={st.mean(p.y for p in sl):.3f} y[{min(p.y for p in sl):.2f},{max(p.y for p in sl):.2f}]')

# 텍스처에서 피부색인 점들을 찾아 위치별로 묶는다(손·얼굴 → 관절 자리)
import bpy, sys
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]; me = o.data
img = None
for n in o.active_material.node_tree.nodes:
    if n.type == 'TEX_IMAGE' and n.image and 'base' in (n.label + n.name + n.image.name).lower() or (n.type == 'TEX_IMAGE' and img is None): img = n.image
# 색 텍스처 고르기: 노드 이름에 상관없이 Base Color에 연결된 것
bsdf = [n for n in o.active_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
lk = bsdf.inputs['Base Color'].links
img = lk[0].from_node.image if lk else img
W, H = img.size; px = list(img.pixels)
uv = me.uv_layers.active.data
def col(u, v):
    x = min(W - 1, max(0, int(u * W))); y = min(H - 1, max(0, int(v * H))); k = (y * W + x) * 4
    return px[k], px[k + 1], px[k + 2]
skin = {}
for poly in me.polygons:
    for li in poly.loop_indices:
        vi = me.loops[li].vertex_index; r, g, b = col(*uv[li].uv)
        if r > 0.55 and 0.25 < g < 0.75 and b < 0.55 and r > g * 1.1 and g > b * 1.05: skin[vi] = me.vertices[vi].co.copy()
print('IMG', img.name, W, H, 'skin', len(skin))
pts = list(skin.values())
for name, f in [('right(x<-0.25)', lambda p: p.x < -0.25), ('left(x>0.25)', lambda p: p.x > 0.25), ('face(|x|<0.25,z>0.2)', lambda p: abs(p.x) < 0.25 and p.z > 0.2)]:
    s = [p for p in pts if f(p)]
    if s:
        print(name, len(s), 'x', round(min(p.x for p in s), 2), round(max(p.x for p in s), 2), 'y', round(min(p.y for p in s), 2), round(max(p.y for p in s), 2), 'z', round(min(p.z for p in s), 2), round(max(p.z for p in s), 2),
              'c', tuple(round(sum(getattr(p, a) for p in s) / len(s), 3) for a in 'xyz'))

# 새 마법사(Meshy 모델)에 뼈대 심기 — Blender 백그라운드로 실행
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/blender/rig.py -- 입력.glb 출력.glb
# 1) 지팡이(나무색·수정색 조각)를 떼어 'Staff'로 → 오른손 뼈에 통째로 붙인다(휘지 않게, 꾸미기로 바꿔 끼울 수 있게)
# 2) 몸통·머리·양팔 뼈대(관절 자리는 이 모델에 맞춘 값)
# 3) 가중치는 직접: 머리·모자·수염은 머리 뼈만, 팔 뼈는 팔 둘레만(망토가 팔을 따라 늘어나지 않게)
# 좌표: Blender는 Z가 위, 캐릭터 앞 = -Y, 캐릭터 오른쪽 = -X
import bpy, bmesh, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = argv[0], argv[1]

# ---- 이 모델의 관절 자리 ----
STAFF_AXIS = (-0.42, -0.36)   # 지팡이 기둥(x, y)
STAFF_R = 0.09                # 기둥 반지름(이 안의 나무·수정 조각만 지팡이)
J = {
    'hips':    ((0, 0.0, -0.45), (0, 0.0, -0.1)),
    'spine':   ((0, 0.0, -0.1), (0, -0.02, 0.22)),
    'neck':    ((0, -0.02, 0.22), (0, -0.04, 0.34)),
    'head':    ((0, -0.04, 0.34), (0, -0.04, 0.95)),
    'shoulder.R': ((-0.06, -0.02, 0.2), (-0.24, -0.02, 0.2)),
    'upper_arm.R': ((-0.24, -0.02, 0.2), (-0.34, -0.14, 0.07)),
    'forearm.R': ((-0.34, -0.14, 0.07), (-0.40, -0.28, 0.0)),
    'hand.R':  ((-0.40, -0.28, 0.0), (-0.42, -0.34, -0.04)),
    'shoulder.L': ((0.06, -0.02, 0.2), (0.24, -0.02, 0.2)),
    'upper_arm.L': ((0.24, -0.02, 0.2), (0.37, -0.08, -0.06)),
    'forearm.L': ((0.37, -0.08, -0.06), (0.45, -0.18, -0.28)),
    'hand.L':  ((0.45, -0.18, -0.28), (0.47, -0.22, -0.38)),
}
PARENT = {'spine': 'hips', 'neck': 'spine', 'head': 'neck', 'shoulder.R': 'spine', 'upper_arm.R': 'shoulder.R', 'forearm.R': 'upper_arm.R', 'hand.R': 'forearm.R',
          'shoulder.L': 'spine', 'upper_arm.L': 'shoulder.L', 'forearm.L': 'upper_arm.L', 'hand.L': 'forearm.L'}
HEAD_Z0, HEAD_Z1 = 0.30, 0.36     # 이 높이 위는 머리 뼈만(사이는 섞음)
ARM_R = 0.16                      # (예전 값, 안 씀)
SLEEVE_R0, SLEEVE_R1 = 0.14, 0.32 # 팔로 볼 원뿔 반지름: 어깨 쪽 · 손목 쪽(늘어진 소매 자락까지)
DRAPE_SMOOTH = 12                 # 망토 자락 가중치 다듬기 횟수
CUFF_GEO = 0.3                    # 소매 끝동: 통째로 붙은 크림 천에서 이어진 길이로 이만큼까지 함께
DRAPE_R0, DRAPE_R1 = 0.10, 0.38   # 망토 자락: 팔에서 이 거리까지는 통째로, 여기까지 점점 덜 따라간다
# 포션 두 개(Blender 좌표 · 반지름): 파란 유리라 소매로 잘못 잡히지 않게 뺀다
POTIONS = [((0.19, -0.165, -0.255), 0.1), ((-0.238, -0.125, -0.235), 0.075)]
BODY_HALF = 0.17                  # 몸통 가운데(|x| 이 안)는 팔로 보지 않는다
BACK_Y = 0.12                     # 이보다 뒤(+y)는 등 뒤 망토라 팔로 보지 않는다

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]; body.name = 'Wizard'
me = body.data

# ---- 1) 지팡이 고르기: 기둥 안의 UV 조각 중 나무색·수정색이 대부분인 것 ----
bsdf = [n for n in body.active_material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
img = bsdf.inputs['Base Color'].links[0].from_node.image
W, H = img.size; px = img.pixels[:]
uvl = me.uv_layers.active.data
def col(u, v):
    x = min(W - 1, max(0, int(u * W))); y = min(H - 1, max(0, int(v * H))); k = (y * W + x) * 4
    return px[k], px[k + 1], px[k + 2]
def staffy(r, g, b):
    wood = r < 0.62 and g < 0.45 and b < 0.32 and r > b      # 어두운 갈색
    crystal = b > 0.55 and b > r * 1.6                         # 파란 수정
    return wood or crystal
vcol = {}
for p in me.polygons:
    for li in p.loop_indices: vcol[me.loops[li].vertex_index] = col(*uvl[li].uv)
def kind(r, g, b):
    if b > r * 1.4 and b > 0.25: return 'blue'
    if r > 0.75 and g > 0.65 and b > 0.45: return 'cream'
    if r > 0.6 and 0.3 < g < 0.7 and b < 0.55 and r > g * 1.15: return 'skin'
    if r < 0.6 and g < 0.4 and r > b: return 'brown'
    return 'other'
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
seen = set(); staff_faces = set()
for f0 in bm.faces:
    if f0.index in seen: continue
    stack = [f0]; comp = []; seen.add(f0.index)
    while stack:   # 꼭짓점을 함께 쓰는 면끼리 = UV 조각
        f = stack.pop(); comp.append(f)
        for v in f.verts:
            for g in v.link_faces:
                if g.index not in seen: seen.add(g.index); stack.append(g)
    vs = {v.index for f in comp for v in f.verts}
    inside = sum(1 for i in vs if ((bm.verts[i].co.x - STAFF_AXIS[0]) ** 2 + (bm.verts[i].co.y - STAFF_AXIS[1]) ** 2) ** 0.5 < STAFF_R) / len(vs)
    st = sum(1 for i in vs if staffy(*vcol.get(i, (1, 1, 1)))) / len(vs)
    if inside > 0.9 and st > 0.5: staff_faces.update(f.index for f in comp)
print('STAFF faces', len(staff_faces), 'of', len(bm.faces))
bm.free()
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
for p in me.polygons: p.select = p.index in staff_faces
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
staff = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o is not body][0]; staff.name = 'Staff'
# 조각 이음매를 붙여 한 덩어리로(자동 가중치가 잘 되게, UV는 유지된다)
for o in (body, staff):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
# 이음매를 붙인 뒤 꼭짓점 번호가 바뀌었으니 색 종류를 다시 잰다(꼭짓점에 닿은 면들의 다수결)
uvl = me.uv_layers.active.data; votes = {}
for p in me.polygons:
    for li in p.loop_indices:
        d = votes.setdefault(me.loops[li].vertex_index, {}); k_ = kind(*col(*uvl[li].uv)); d[k_] = d.get(k_, 0) + 1
VKIND = {i: max(d, key=d.get) for i, d in votes.items()}

# ---- 2) 뼈대 ----
arm_data = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('Rig', arm_data); bpy.context.scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for n, (h, t) in J.items():
    b = arm_data.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t)
for n, pn in PARENT.items(): arm_data.edit_bones[n].parent = arm_data.edit_bones[pn]; arm_data.edit_bones[n].use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
# 가중치: Blender 자동 가중치(뼈 열 확산)는 이 모델에서 팔 뼈 계산에 실패해(팔이 안 따라옴) 직접 정한다
#  - 몸통 뼈(엉덩이·척추·목·머리): 높이에 따라 부드럽게 넘겨 준다
#  - 팔 뼈: 팔 둘레(ARM_R) 안의 점만, 가까운 뼈일수록 크게. 팔에서 멀어질수록 몸통 뼈로 넘어간다
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_NAME')
vg = {g.name: g for g in body.vertex_groups}
print('GROUPS', sorted(vg))
def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b); ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared)); return (p - (a + ab * t)).length
def ss(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
def body_w(z):
    # 엉덩이 → 척추(-0.16~-0.04) → 목(0.18~0.26) → 머리(HEAD_Z0~HEAD_Z1)
    a = ss(-0.16, -0.04, z); b = ss(0.18, 0.26, z); c = ss(HEAD_Z0, HEAD_Z1, z)
    w = {'hips': 1 - a, 'spine': a * (1 - b), 'neck': a * b * (1 - c), 'head': a * b * c}
    return {k: v for k, v in w.items() if v > 1e-4}
# 팔 가중치 k(0~1)를 먼저 정하고(1차: 자리 + 색), 소매 끝동은 이어진 크림 천을 따라 번져 통째로 붙인 뒤(2차), 몸통과 섞는다
#  소매(사용자 2026-10-15: 소매가 팔을 따라오지 않음 · 늘어진 소매 자락까지): 위치만으로는 허리띠·포션과 구분이 안 돼 색으로 가른다
#  - 팔에 바짝 붙은 것(손·손목 가죽·주먹 속 조각): 색과 상관없이 통째로
#  - 크림 소매 끝동 · 손: 팔과 한 덩어리로 통째로(반만 따라가면 끝동이 늘어진 띠가 된다). 몸통 쪽 튜닉(안쪽 크림)은 뺀다
#  - 파란 망토 자락: 팔에 가까울수록 많이, 아래로 멀어질수록 덜 따라 들린다(망토가 팔에 딸려 들리는 느낌)
#  - 갈색 허리띠·주머니, 포션: 몸통
ARM = {}
for side in ('R', 'L'):
    S, Hd = Vector(J[f'upper_arm.{side}'][0]), Vector(J[f'hand.{side}'][0]); ax = Hd - S
    K = {}; FREE = set()
    for v in me.vertices:
        p = v.co
        if p.z > HEAD_Z0 + 0.02: continue
        t = (p - S).dot(ax) / ax.length_squared; d = (p - (S + ax * max(0.0, min(1.0, t)))).length
        r = SLEEVE_R0 + (SLEEVE_R1 - SLEEVE_R0) * max(0.0, min(1.0, t))
        kd = VKIND.get(v.index, 'other'); ax_ = abs(p.x)
        side_ok = (p.x < -0.17) if side == 'R' else (p.x > 0.17)
        if side_ok and p.y < BACK_Y + 0.04: FREE.add(v.index)
        if not side_ok or any((p - Vector(c)).length < rr for c, rr in POTIONS) or not (-0.15 < t < 1.7) or p.y > BACK_Y + 0.04: continue
        dl = min(seg_dist(p, *J[f'forearm.{side}']), seg_dist(p, *J[f'hand.{side}']))
        k = 1 - ss(0.07, 0.1, dl) if ax_ > 0.3 else 0.0
        # 주먹 속에 남은 지팡이 조각(손과 한 UV 조각이라 떼지 못한 것): 손과 함께
        if side == 'R' and ((p.x - STAFF_AXIS[0]) ** 2 + (p.y - STAFF_AXIS[1]) ** 2) ** 0.5 < STAFF_R + 0.02 and abs(p.z - J['hand.R'][0][2]) < 0.2: k = 1.0
        if kd in ('cream', 'skin'):
            if d < r: k = max(k, (1 - ss(r * 0.85, r, d)) * ss(0.28, 0.31, ax_))
        elif kd == 'blue':
            k = max(k, (1 - ss(DRAPE_R0, DRAPE_R1, d)) * ss(0.19, 0.27, ax_) * (1 - ss(BACK_Y - 0.06, BACK_Y + 0.04, p.y)))
        if k > 1e-3: K[v.index] = k
    # 2차: 통째로 붙은 크림·피부에서 이어진 크림·피부 천을 따라(경로 길이 CUFF_GEO까지) 번져 끝동 전체를 붙인다
    adj = {}
    for e in me.edges:
        i, j = e.vertices; adj.setdefault(i, []).append(j); adj.setdefault(j, []).append(i)
    front = [i for i, k in K.items() if k > 0.95 and VKIND.get(i) in ('cream', 'skin')]; geo = {i: 0.0 for i in front}
    while front:
        nxt = []
        for i in front:
            for j in adj.get(i, ()):
                q = me.vertices[j].co
                if VKIND.get(j) not in ('cream', 'skin') or abs(q.x) < 0.29 or (q.x > 0) != (side == 'L'): continue
                g = geo[i] + (me.vertices[i].co - q).length
                if g < CUFF_GEO and g < geo.get(j, 9): geo[j] = g; nxt.append(j)
        front = nxt
    for i in geo: K[i] = 1.0
    # 3차: 망토(파랑) 자락은 이웃 점과 평균을 여러 번 내 부드럽게(끝동·손은 1, 허리띠·튜닉·포션은 0으로 고정) → 이음매에서 한 칸만 확 늘어나지 않게
    free = set(i for i in FREE if VKIND.get(i) == 'blue' and i not in geo)
    for _ in range(DRAPE_SMOOTH):
        nk = {}
        for i in free:
            nb = adj.get(i, ())
            if nb: nk[i] = 0.5 * K.get(i, 0.0) + 0.5 * sum(K.get(j, 0.0) for j in nb) / len(nb)
        K.update(nk)
    K = {i: k for i, k in K.items() if k > 1e-3}
    ARM[side] = K
    print('ARM', side, len(K), 'cuff', len(geo))
for v in me.vertices:
    p = v.co; w = body_w(p.z)
    for side in ('R', 'L'):
        k = ARM[side].get(v.index, 0.0)
        if k <= 0: continue
        names = [f'shoulder.{side}', f'upper_arm.{side}', f'forearm.{side}', f'hand.{side}']
        raw = [1.0 / (seg_dist(p, *J[n]) ** 2 + 1e-4) ** 2 for n in names]; tt = sum(raw)
        w = {n: x * (1 - k) for n, x in w.items()}
        for n, rr in zip(names, raw): w[n] = w.get(n, 0) + k * rr / tt
    s = sum(w.values())
    for n, x in w.items():
        if x / s > 0.01: vg[n].add([v.index], x / s, 'REPLACE')

# 지팡이: 오른손 뼈에 통째로(휘지 않게)
bpy.ops.object.select_all(action='DESELECT'); staff.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE'); arm_data.bones.active = arm_data.bones['hand.R']; bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.parent_set(type='BONE', keep_transform=True)

bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_skins=True, export_animations=False, export_apply=False)
print('DONE', DST)

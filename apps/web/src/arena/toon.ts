/* 아레나 그림체: 카툰 셰이딩(3단 명암) + 잉크 테두리(뒤집은 껍데기). 손그림 느낌이 나게 테두리 굵기를 자리마다 조금씩 흔든다 */
import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';

export const INK = '#140e0a';

let grad: THREE.DataTexture | null = null;
/** 명암 3단(어두움·중간·밝음) */
export function gradientMap(): THREE.DataTexture {
  if (grad) return grad;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
  return grad;
}

const mats = new Map<string, THREE.MeshToonMaterial>();
/** 같은 색은 재료를 나눠 쓴다(따로 고칠 재료는 fresh로) */
export function toon(color: THREE.ColorRepresentation, o: { fresh?: boolean; emissive?: THREE.ColorRepresentation; ei?: number; map?: THREE.Texture } = {}): THREE.MeshToonMaterial {
  const k = typeof color === 'string' ? color : new THREE.Color(color).getHexString();
  if (!o.fresh && !o.emissive && !o.map && mats.has(k)) return mats.get(k)!;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: o.map ?? null });
  if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  if (!o.fresh && !o.emissive && !o.map) mats.set(k, m);
  return m;
}

/** 잉크 굵기는 화면 픽셀 기준(멀리 있어도 같은 굵기로 그린 선처럼). 해상도는 아레나가 매 프레임 넣는다 */
export const INK_U = { res: { value: new THREE.Vector2(1280, 720) }, px: { value: 2.4 } };
/** 잉크 껍데기 재료: 화면에서 법선 방향으로 밀어 뒷면만 검게 그린다. 위치에 따라 굵기를 흔들어 붓 자국처럼 */
function inkMat(w: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { w: { value: w / 0.04 }, col: { value: new THREE.Color(INK) }, res: INK_U.res, px: INK_U.px },
    vertexShader: `uniform float w; uniform vec2 res; uniform float px;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        float j = 0.65 + 0.7 * h(floor(position * 5.0));
        vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec2 n = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        float l = length(n);
        if (l > 1e-4) c.xy += n / l * (px * w * j * 2.0 / res) * c.w;
        // 뒤로 살짝 밀어 앞면과 겹쳐 깜박이지 않게
        c.z += 0.0004 * c.w;
        gl_Position = c;
      }`,
    fragmentShader: `uniform vec3 col; void main(){ gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.BackSide,
  });
}
const inkCache = new Map<number, THREE.ShaderMaterial>();
const inkOf = (w: number) => { let m = inkCache.get(w); if (!m) { m = inkMat(w); inkCache.set(w, m); } return m; };

/** 테두리용 기하: 모서리에서 갈라진 법선을 이어 붙여(부드럽게) 껍데기가 끊기지 않게 */
const hulls = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function hullGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let h = hulls.get(g); if (h) return h;
  const c = new THREE.BufferGeometry(); c.setAttribute('position', g.getAttribute('position').clone()); if (g.index) c.setIndex(g.index.clone());
  h = mergeVertices(c, 1e-3); h.computeVertexNormals(); hulls.set(g, h); return h;
}

/** 카툰 재료 + 잉크 테두리를 단 메시 */
export function ink(geo: THREE.BufferGeometry, mat: THREE.Material, w = 0.05, onTop = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (w > 0) {
    // 맨 위에 그릴 표시(화살표 등)는 가려지지 않게: 테두리 먼저, 몸통을 그 위에
    const im = onTop ? inkMat(w) : inkOf(w); if (onTop) { im.depthTest = false; mat.depthTest = false; m.renderOrder = 21; }
    const o = new THREE.Mesh(hullGeo(geo), im); o.name = 'ink'; if (onTop) o.renderOrder = 20; m.add(o);
  }
  return m;
}
/** 테두리 굵기를 나중에 바꾸거나 숨기기 */
export function setInk(o: THREE.Object3D, on: boolean): void { o.traverse(c => { if (c.name === 'ink') c.visible = on; }); }

/** 빛나는(조명·명암 없는) 재료 */
export const glow = (color: THREE.ColorRepresentation, opacity = 1, add = true): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, toneMapped: false });

/** 캔버스에 그린 그림을 텍스처로 */
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** 손으로 그은 듯한 떨리는 선 */
export function wobbleLine(g: CanvasRenderingContext2D, pts: [number, number][], amp = 1.5): void {
  g.beginPath();
  pts.forEach(([x, y], k) => { const jx = x + (Math.random() - .5) * amp, jy = y + (Math.random() - .5) * amp; if (k) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
  g.stroke();
}

/** 0~1 사이로 자르기·부드러운 보간 */
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const backOut = (x: number) => { x = clamp01(x); const s = 1.7; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };

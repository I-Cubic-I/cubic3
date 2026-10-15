/* 안쪽 주름 선(화면 효과, 사용자 2026-10-15 설정): 표면 방향(노멀)이 급하게 꺾이는 곳 · 앞뒤 거리가 끊기는 곳 ·
   노멀 맵 잔주름 · 텍스처 색이 어두워지는 경계에 잉크 선을 긋는다. 바깥 윤곽선(잉크 껍데기)은 그대로 두고 그 위에 더한다.
   설정: 선 굵기 0.8(× 화면 배율) · 민감도 1 · 잔주름 켬 · 색 경계 켬 */
import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export const CREASE = { thick: 0.8, sens: 1.0, fine: true, colorEdge: true };
/** 작게 보일 때(사용자 2026-10-15): 마법사 키가 화면에서 SMALL1px 아래로 작아지면 선이 옅어지기 시작해 SMALL0px에서 사라지고, THICK_AT px보다 작으면 선도 가늘어진다(CSS 픽셀) */
const SMALL0 = 70, SMALL1 = 150, THICK_AT = 320;

export class CreasePass {
  private rtColor = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private rtNormal = new THREE.WebGLRenderTarget(1, 1);
  private normalMat = new THREE.MeshNormalMaterial();
  private nmCache = new WeakMap<THREE.Material, THREE.MeshNormalMaterial>();
  private quad: THREE.Mesh; private qScene = new THREE.Scene(); private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bgNormal = new THREE.Color(0.5, 0.5, 1.0);

  constructor(private gl: THREE.WebGLRenderer) {
    this.rtNormal.depthTexture = new THREE.DepthTexture(1, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tNormal: { value: null }, tDepth: { value: null }, res: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 200 }, px: { value: 1 }, lo: { value: 0.1 }, ce: { value: 1 }, tanHalf: { value: 0.4 }, dpr: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `#define SMALL0 ${SMALL0.toFixed(1)}
#define SMALL1 ${SMALL1.toFixed(1)}
#define THICK_AT ${THICK_AT.toFixed(1)}
uniform sampler2D tColor, tNormal, tDepth; uniform vec2 res; uniform float near, far, px, lo, ce, tanHalf, dpr; varying vec2 vUv;
        float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
        void main(){
          vec4 c = texture2D(tColor, vUv);
          vec3 n0 = texture2D(tNormal, vUv).xyz * 2.0 - 1.0; float d0 = lin(texture2D(tDepth, vUv).x);
          // 작게 보이는 것은 선을 가늘게, 아주 작으면 없앤다: 이 깊이에서 마법사 키(2.3)가 화면에서 몇 픽셀인지
          float hPx = 2.3 * res.y / (2.0 * tanHalf * d0) / dpr;
          float fade = smoothstep(SMALL0, SMALL1, hPx), thin = clamp(hPx / THICK_AT, 0.45, 1.0);
          float en = 0.0, ed = 0.0, ec = 0.0; float l0 = dot(c.rgb, vec3(0.3, 0.59, 0.11));
          for (int i = 0; i < 8; i++) {
            vec2 o = (i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : i == 3 ? vec2(0.0, -1.0) : i == 4 ? vec2(0.7, 0.7) : i == 5 ? vec2(-0.7, 0.7) : i == 6 ? vec2(0.7, -0.7) : vec2(-0.7, -0.7)) * px * thin / res;
            vec3 n1 = texture2D(tNormal, vUv + o).xyz * 2.0 - 1.0; float d1 = lin(texture2D(tDepth, vUv + o).x);
            en = max(en, 1.0 - dot(n0, n1)); ed = max(ed, abs(d1 - d0) / d0);
            float l1 = dot(texture2D(tColor, vUv + o).rgb, vec3(0.3, 0.59, 0.11)); ec = max(ec, (l0 - l1) / max(l0, 0.05));
          }
          float e = max(max(smoothstep(lo, lo + 0.16, en), smoothstep(0.015, 0.03, ed)), ce * smoothstep(0.08 + lo * 0.4, 0.2 + lo * 0.4, -ec));
          gl_FragColor = vec4(mix(c.rgb, vec3(0.006, 0.004, 0.003), e * fade), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    }));
    this.qScene.add(this.quad);
  }

  /** 장면을 색 · 노멀 두 번 그린 뒤 경계에 선을 그어 화면에 낸다. skip: 노멀 그리기에서 뺄 것(투명한 빛·글자 등) */
  render(scene: THREE.Scene, cam: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget | null = null): void {
    const gl = this.gl, size = gl.getDrawingBufferSize(new THREE.Vector2()), w = size.x, h = size.y;
    if (this.rtColor.width !== w || this.rtColor.height !== h) { this.rtColor.setSize(w, h); this.rtNormal.setSize(w, h); }
    // 글자(스프라이트)는 선을 다 그은 뒤 맨 위에 따로 그린다(뒤 물체의 선이 글자 위로 지나가지 않게)
    const sprites: THREE.Object3D[] = []; scene.traverseVisible(o => { if ((o as THREE.Sprite).isSprite) sprites.push(o); });
    sprites.forEach(o => o.visible = false);
    gl.setRenderTarget(this.rtColor); gl.render(scene, cam);
    // 노멀 그리기: 잉크 껍데기 · 투명한 것 · 글자는 빼고, 배경은 카메라를 보는 노멀로
    const hidden: THREE.Object3D[] = [], swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    scene.traverseVisible(o => {
      const m = o as THREE.Mesh; const mt = m.material as THREE.Material & { normalMap?: THREE.Texture | null } | undefined;
      if (o.name === 'ink' || (mt && !Array.isArray(mt) && mt.transparent)) { hidden.push(o); return; }
      if (!m.isMesh || !mt || Array.isArray(mt)) return;
      let nm = this.normalMat; if (CREASE.fine && mt.normalMap) { nm = this.nmCache.get(mt) ?? new THREE.MeshNormalMaterial({ normalMap: mt.normalMap }); this.nmCache.set(mt, nm); }
      swapped.push([m, m.material]); m.material = nm;
    });
    hidden.forEach(o => o.visible = false);
    const bg = scene.background, fog = scene.fog; scene.background = this.bgNormal; scene.fog = null;
    gl.setRenderTarget(this.rtNormal); gl.render(scene, cam);
    swapped.forEach(([m, mt]) => { m.material = mt; }); hidden.forEach(o => o.visible = true); scene.background = bg; scene.fog = fog;
    const u = (this.quad.material as THREE.ShaderMaterial).uniforms;
    u.tColor.value = this.rtColor.texture; u.tNormal.value = this.rtNormal.texture; u.tDepth.value = this.rtNormal.depthTexture; u.res.value.set(w, h);
    u.near.value = cam.near; u.far.value = cam.far; u.px.value = CREASE.thick * gl.getPixelRatio(); u.lo.value = 0.4 - CREASE.sens * 0.34; u.ce.value = CREASE.colorEdge ? 1 : 0;
    u.tanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)); u.dpr.value = gl.getPixelRatio();
    gl.setRenderTarget(target); gl.render(this.qScene, this.qCam);
    if (sprites.length) {
      // 글자만: 나머지 메시는 잠깐 숨기고, 배경 없이 덧그린다
      const others: THREE.Object3D[] = []; scene.traverseVisible(o => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) others.push(o); });
      others.forEach(o => o.visible = false); sprites.forEach(o => o.visible = true);
      const ac = gl.autoClear; gl.autoClear = false; scene.background = null; gl.clearDepth(); gl.render(scene, cam); scene.background = bg; gl.autoClear = ac;
      others.forEach(o => o.visible = true);
    }
  }
  dispose(): void { this.rtColor.dispose(); this.rtNormal.dispose(); }
}

/** 화면 효과 묶음(EffectComposer)의 맨 앞 그리기 단계로 쓸 때: RenderPass 대신 넣는다(동굴의 심도·색 단계 효과 앞) */
export class CreaseRenderPass extends Pass {
  constructor(private crease: CreasePass, private scene: THREE.Scene, private cam: THREE.PerspectiveCamera) { super(); this.needsSwap = false; }
  render(_r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void { this.crease.render(this.scene, this.cam, this.renderToScreen ? null : readBuffer); }
}

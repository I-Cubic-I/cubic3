/* ================= 3D 테이블 (Three.js r128, 단위 = cm) =================
   규칙·화면 코드는 2D 시험판과 같다. 이 스크립트는 공유 상태 S를 읽어 테이블을 그리고,
   테이블 위 물건을 누르면 숨겨 둔 2D 버튼을 대신 눌러 준다. */
(function(){
if(!window.THREE){return}
const T=THREE;
const canvas=document.createElement('canvas');canvas.id='scene3d';document.body.prepend(canvas);
const renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputEncoding=T.sRGBEncoding;
const scene=new T.Scene();scene.background=new T.Color('#0d1014');scene.fog=new T.Fog('#0d1014',160,420);
const camera=new T.PerspectiveCamera(52,1,1,1200);

/* ---- 조명과 방 ---- */
scene.add(new T.HemisphereLight('#dfe7ff','#2a1c12',.55));
const lamp=new T.SpotLight('#fff1d6',1.25,320,Math.PI/4.2,.45,1.2);lamp.position.set(0,130,10);lamp.target.position.set(0,0,0);
lamp.castShadow=true;lamp.shadow.mapSize.set(1024,1024);lamp.shadow.bias=-.0004;scene.add(lamp,lamp.target);
const fill=new T.DirectionalLight('#9fb8ff',.25);fill.position.set(-80,60,90);scene.add(fill);
const floor=new T.Mesh(new T.PlaneGeometry(1200,1200),new T.MeshStandardMaterial({color:'#2a1d15',roughness:.95}));
floor.rotation.x=-Math.PI/2;floor.position.y=-75;floor.receiveShadow=true;scene.add(floor);
const TABLE_R=62;
const felt=new T.Mesh(new T.CylinderGeometry(TABLE_R,TABLE_R,3,64),new T.MeshStandardMaterial({color:'#1d4a3d',roughness:.92}));
felt.position.y=-1.5;felt.receiveShadow=true;scene.add(felt);
const rim=new T.Mesh(new T.TorusGeometry(TABLE_R+1.5,2.6,12,96),new T.MeshStandardMaterial({color:'#5a3a22',roughness:.6}));
rim.rotation.x=Math.PI/2;rim.position.y=-.6;rim.castShadow=true;scene.add(rim);
const leg=new T.Mesh(new T.CylinderGeometry(8,14,72,24),new T.MeshStandardMaterial({color:'#3b2716',roughness:.8}));leg.position.y=-39;scene.add(leg);

/* ---- 텍스처 (캔버스로 그려서 캐시) ---- */
const COL={S:'#2f5fc8',H:'#d3302f',D:'#d9a800',C:'#2e9450'};
const texCache=new Map();
function canvasTex(key,w,h,draw){if(texCache.has(key))return texCache.get(key);
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;texCache.set(key,t);return t}
const FONT='"Do Hyeon","IBM Plex Sans KR",system-ui,sans-serif';
function round(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function faceTex(card){const s=U(card),r=R(card);return canvasTex('f'+s+r,256,356,(g,w,h)=>{
  g.fillStyle='#fbfaf7';round(g,0,0,w,h,22);g.fill();g.strokeStyle=r>=11?COL[s]:'#d9d6cf';g.lineWidth=r>=11?10:4;round(g,5,5,w-10,h-10,18);g.stroke();
  g.fillStyle=COL[s];g.textAlign='center';g.textBaseline='middle';
  g.font=`120px ${FONT}`;g.fillText(RL(r),w/2,h*.40);g.font=`110px ${FONT}`;g.fillText(SYM[s],w/2,h*.74);
  g.font=`44px ${FONT}`;g.textAlign='left';g.fillText(RL(r),20,40)})}
function backTex(){return canvasTex('back',256,356,(g,w,h)=>{g.fillStyle='#24324f';round(g,0,0,w,h,22);g.fill();
  g.strokeStyle='#f2c318';g.lineWidth=6;round(g,14,14,w-28,h-28,16);g.stroke();
  g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=3;for(let k=-h;k<w;k+=22){g.beginPath();g.moveTo(k,0);g.lineTo(k+h,h);g.stroke()}
  g.fillStyle='#f2c318';g.font=`64px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText('3',w/2,h/2)})}
const MGCOL={hold:'#f4ddcb',bomb:'#f5d6d3',auction:'#e7dff0',balloon:'#ffe3a8',rps:'#d6e4ff',vault:'#dce0e8',count:'#d9e7f3',race:'#d5eadb'};
function mgTex(id,slot){return canvasTex('mg'+id+slot,256,356,(g,w,h)=>{g.fillStyle='#fbfaf7';round(g,0,0,w,h,22);g.fill();
  g.fillStyle=MGCOL[id]||'#e6e8ec';round(g,18,48,w-36,h*.5,14);g.fill();
  g.fillStyle='#1e2b4a';g.textAlign='center';g.textBaseline='middle';g.font=`92px ${FONT}`;g.fillText(String(slot),w/2,48+h*.25);
  g.font=`40px ${FONT}`;const nm=MG[id]?MG[id].name:id;g.fillText(nm,w/2,h*.78);g.font=`26px ${FONT}`;g.fillStyle='#5a6675';g.fillText(MG[id]?MG[id].icon:'',w/2,h*.88)})}
function labelTex(text,color){return canvasTex('l'+text+color,512,96,(g,w,h)=>{g.fillStyle='rgba(10,12,16,.72)';round(g,4,8,w-8,h-16,30);g.fill();
  g.fillStyle=color||'#eef2f6';g.font=`48px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2+2)})}
function dieTex(n){return canvasTex('d'+n,128,128,(g,w,h)=>{g.fillStyle='#f6f3ec';g.fillRect(0,0,w,h);g.fillStyle='#1e2b4a';
  const P={1:[[.5,.5]],2:[[.25,.25],[.75,.75]],3:[[.25,.25],[.5,.5],[.75,.75]],4:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],6:[[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]]}[n];
  P.forEach(([x,y])=>{g.beginPath();g.arc(x*w,y*h,12,0,7);g.fill()})})}

/* ---- 물건 풀: 이름(키)으로 부르고, 위치는 목표로 미끄러진다 ---- */
const CW=6.3,CH=8.8,CT=.05;
const cardGeo=new T.BoxGeometry(CW,CT,CH);
const edgeMat=new T.MeshStandardMaterial({color:'#e9e5dc',roughness:.8});
const pool=new Map();let seen=new Set();
function mats(top,bottom){return [edgeMat,edgeMat,new T.MeshStandardMaterial({map:top,roughness:.55}),new T.MeshStandardMaterial({map:bottom,roughness:.55}),edgeMat,edgeMat]}
function cardObj(key,faceUp,card,spawn){let o=pool.get(key);
  const want=(faceUp?'F':'B')+(card||'');
  if(!o){o=new T.Mesh(cardGeo,mats(backTex(),backTex()));o.castShadow=true;o.receiveShadow=true;o.position.copy(spawn||DECK_POS);scene.add(o);pool.set(key,o);o.userData={}}
  if(o.userData.look!==want){o.material[2].map=faceUp?(card?faceTex(card):backTex()):backTex();o.material[2].needsUpdate=true;o.userData.look=want}
  seen.add(key);return o}
function place(o,pos,rot){o.userData.tp=pos.clone();o.userData.tq=new T.Quaternion().setFromEuler(rot||new T.Euler(0,0,0))}
function genericObj(key,make){let o=pool.get(key);if(!o){o=make();scene.add(o);pool.set(key,o);o.userData=o.userData||{}}seen.add(key);return o}

const DECK_POS=new T.Vector3(-16,0,-2),AWAY=new T.Vector3(0,14,72);
const SEATCOL=['#2f5fc8','#d3302f','#e0b100','#2e9450','#8b5cc9'];
let me0=0;
function seatAngle(k,n){return (k-me0)*2*Math.PI/n}
function dirOf(k,n){const a=seatAngle(k,n);return new T.Vector3(Math.sin(a),0,Math.cos(a))}
function tangentOf(k,n){const d=dirOf(k,n);return new T.Vector3(d.z,0,-d.x)}
function yawToCenter(k,n){return seatAngle(k,n)}

const avatars=new Map();
function avatar(k,n){let a=avatars.get(k);
  if(!a){a=new T.Group();const col=new T.Color(SEATCOL[k%5]);
    const body=new T.Mesh(new T.CylinderGeometry(11,13,34,20),new T.MeshStandardMaterial({color:col,roughness:.7}));body.position.y=4;body.castShadow=true;
    const head=new T.Mesh(new T.SphereGeometry(8.5,24,18),new T.MeshStandardMaterial({color:'#e8c9a8',roughness:.8}));head.position.y=30;head.castShadow=true;
    const ring=new T.Mesh(new T.TorusGeometry(15,.9,8,40),new T.MeshBasicMaterial({color:'#8fb0ff'}));ring.rotation.x=Math.PI/2;ring.position.y=-12;ring.visible=false;
    const lab=new T.Sprite(new T.SpriteMaterial({map:labelTex('…'),depthTest:false}));lab.scale.set(30,5.6,1);lab.position.y=46;
    a.add(body,head,ring,lab);a.userData={ring,lab};scene.add(a);avatars.set(k,a)}
  const d=dirOf(k,n);a.position.copy(d.multiplyScalar(84));a.rotation.y=yawToCenter(k,n);return a}

/* ---- 상태 → 장면 ---- */
let lastSig='';
function sync(){
  if(!S||!S.seats||S.phase==='lobby'){pool.forEach(o=>o.visible=false);avatars.forEach(a=>a.visible=false);return}
  const n=S.seats.length;const mineSeats=S.seats.map((_,k)=>k).filter(k=>S.seats[k].uid===me);
  me0=ctl!=null?ctl:(mineSeats[0]??0);
  seen=new Set();
  // 덱
  const deckH=Math.max(.3,(S.deck?S.deck.length:0)*CT*1.6);
  const deck=genericObj('deck',()=>{const m=new T.Mesh(new T.BoxGeometry(CW,1,CH),mats(backTex(),backTex()));m.castShadow=true;m.receiveShadow=true;return m});
  deck.scale.y=deckH;place(deck,new T.Vector3(DECK_POS.x,deckH/2,DECK_POS.z));deck.userData.click='[data-a="pdeck"]';deck.visible=!!(S.deck&&S.deck.length);
  const deckLab=genericObj('decklab',()=>{const s=new T.Sprite(new T.SpriteMaterial({depthTest:false}));s.scale.set(16,3,1);return s});
  deckLab.material.map=labelTex(`덱 ${S.deck?S.deck.length:0}장`);place(deckLab,new T.Vector3(DECK_POS.x,deckH+5,DECK_POS.z));
  // 버림 줄: 덱 오른쪽으로 줄지어
  (S.row||[]).forEach((c,k)=>{const o=cardObj('c'+c,true,c);const col=k%7,rw=Math.floor(k/7);
    place(o,new T.Vector3(-7+col*7.2,CT/2+rw*.06,-2+rw*10),new T.Euler(0,0,0));o.userData.click=`[data-a="prow"][data-c="${c}"]`});
  // 미니게임 6장
  if(S.board){S.board.forEach((id,k)=>{const key='mg'+k;const o=genericObj(key,()=>{const m=new T.Mesh(cardGeo,mats(backTex(),backTex()));m.castShadow=true;return m});
      o.material[2].map=mgTex(id,k+1);o.material[2].needsUpdate=true;
      const hit=S.die===k+1;place(o,new T.Vector3(-22.5+k*9,hit?1.2:CT/2,-24),new T.Euler(0,0,0));o.userData.click=`[data-slot="${k+1}"]`;o.userData.glow=hit})}
  // 주사위
  if(S.die&&(S.phase==='roll'||S.phase==='clubs'||S.phase==='mg')){const d=genericObj('die',()=>{const m=new T.Mesh(new T.BoxGeometry(3,3,3),[1,2,3,4,5,6].map(x=>new T.MeshStandardMaterial({map:dieTex(x)})));m.castShadow=true;return m});
    // 윗면(+y = 재질 2)에 나온 눈이 오도록
    const faces=[3,4,1,6,2,5];d.material.forEach((m,ix)=>{m.map=dieTex(ix===2?S.die:faces[ix]===S.die?7-S.die:faces[ix]);m.needsUpdate=true});
    if(!rolling)place(d,new T.Vector3(16,1.5,-12),new T.Euler(0,.4,0))}
  // 보상 진열
  const disp=(S.phase==='reward'&&S.reward)?S.reward.disp:(S.rewardDisp||[]);
  disp.forEach((c,k)=>{const o=cardObj('c'+c,true,c);place(o,new T.Vector3(-((disp.length-1)*7.4)/2+k*7.4,CT/2,-38));
    o.userData.click=S.phase==='reward'?`[data-a="rpick"][data-c="${c}"]`:null});
  // 자리마다: 아바타, 손패 부채, 토큰, 앞의 아이템
  const actor=whoActs();
  S.seats.forEach((p,k)=>{const d=dirOf(k,n),t=tangentOf(k,n),yaw=yawToCenter(k,n);
    if(k!==me0){const a=avatar(k,n);a.visible=true;a.userData.ring.visible=actor===k;
      a.userData.lab.material.map=labelTex(`${seatName(k)} · ${p.hand.length}장`,actor===k?'#8fb0ff':null);
      // 손에 든 패(뒷면) 부채꼴
      const m=p.hand.length;p.hand.forEach((c,j)=>{const o=cardObj('c'+c,false,c);const f=(j-(m-1)/2);
        const pos=d.clone().multiplyScalar(74).add(t.clone().multiplyScalar(f*2.2));pos.y=18+Math.abs(f)*-.25;
        place(o,pos,new T.Euler(-1.15,yaw+Math.PI,f*.12,'YXZ'));o.userData.click=null})}
    else{const a=avatars.get(k);if(a)a.visible=false}
    // 토큰(문양 색 큐브)
    p.tokens.forEach((col,j)=>{const key='tok'+k+'_'+j+col;const o=genericObj(key,()=>{const m=new T.Mesh(new T.BoxGeometry(1.8,1.8,1.8),new T.MeshStandardMaterial({color:COL[col],roughness:.35}));m.castShadow=true;return m});
      o.material.color.set(COL[col]);const pos=d.clone().multiplyScalar(44).add(t.clone().multiplyScalar((j-1)*3.2));pos.y=.9;place(o,pos,new T.Euler(0,yaw,0))});
    // 앞에 놓인 아이템(앞면)
    p.front.forEach((c,j)=>{const o=cardObj('c'+c,true,c);const pos=d.clone().multiplyScalar(52).add(t.clone().multiplyScalar(-10+j*4));pos.y=CT/2+j*.06;
      place(o,pos,new T.Euler(0,yaw+Math.PI,0));o.userData.click=null})});
  avatars.forEach((a,k)=>{if(k>=n)a.visible=false});
  // 안 쓰는 물건은 덱 쪽으로 사라짐
  pool.forEach((o,key)=>{if(!seen.has(key)){if(o.userData.dying==null)o.userData.dying=0}else{o.userData.dying=null;o.visible=true}});
  hlKey=null;
  aimFor(S.phase);
}

/* ---- 카메라: 자리 고정, 고개만 자유. 할 일이 생기면 그쪽을 비춘다 ---- */
const EYE=new T.Vector3(0,46,80);
const SHOTS={seat:{pos:EYE,look:new T.Vector3(0,0,-6)},top:{pos:new T.Vector3(0,118,24),look:new T.Vector3(0,0,-14)},reward:{pos:new T.Vector3(0,52,58),look:new T.Vector3(0,0,-34)},board:{pos:new T.Vector3(0,62,46),look:new T.Vector3(0,0,-22)}};
let shot='seat',camPos=EYE.clone(),camLook=SHOTS.seat.look.clone(),yawOff=0,pitchOff=0,lastPhase=null;
function aimFor(ph){if(ph===lastPhase)return;lastPhase=ph;
  const map={main:'seat',defense:'seat',roll:'board',clubs:'board',mg:'top',reward:'reward',ended:'top'};go(map[ph]||'seat')}
function go(name){shot=name;yawOff=0;pitchOff=0}
const tmpLook=new T.Vector3();
function updateCamera(){const s=SHOTS[shot];camPos.lerp(s.pos,.06);camLook.lerp(s.look,.06);
  // 자리에서 바라보는 방향에 고개 돌림을 더한다
  const dir=camLook.clone().sub(camPos);const len=dir.length();dir.normalize();
  const yaw=Math.atan2(dir.x,-dir.z)+yawOff;const pitch=Math.asin(dir.y)+pitchOff;
  tmpLook.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(len).add(camPos);
  camera.position.copy(camPos);camera.lookAt(tmpLook)}

/* ---- 입력: 끌면 둘러보기, 짧게 누르면 테이블 위 물건 고르기 ---- */
const ray=new T.Raycaster(),ptr=new T.Vector2();let down=null,hlKey=null;
function pick(ev){const r=canvas.getBoundingClientRect();ptr.set(((ev.clientX-r.left)/r.width)*2-1,-((ev.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ptr,camera);
  const objs=[];pool.forEach(o=>{if(o.visible&&o.userData.click&&o.userData.dying==null)objs.push(o)});
  const hit=ray.intersectObjects(objs,false)[0];if(!hit)return null;const sel=hit.object.userData.click;const el=document.querySelector(sel);
  return el&&!el.disabled?{obj:hit.object,el}:null}
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,yaw:yawOff,pitch:pitchOff,moved:false};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{
  if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.abs(dx)+Math.abs(dy)>5){down.moved=true;canvas.classList.add('drag')}
    if(down.moved){yawOff=Math.max(-1.6,Math.min(1.6,down.yaw-dx*.004));pitchOff=Math.max(-.6,Math.min(.5,down.pitch+dy*.004))}return}
  const h=pick(e);canvas.classList.toggle('hot',!!h);hover(h&&h.obj)});
canvas.addEventListener('pointerup',e=>{const d=down;down=null;canvas.classList.remove('drag');if(d&&!d.moved){const h=pick(e);if(h)h.el.click()}});
let hovered=null;function hover(o){if(hovered===o)return;if(hovered&&hovered.material[2])hovered.material[2].emissive&&hovered.material[2].emissive.set(0);hovered=o;if(o&&o.material[2]&&o.material[2].emissive)o.material[2].emissive.set('#2a3a66')}

/* ---- 버튼 ---- */
const btns=document.createElement('div');btns.className='cam-btns';
btns.innerHTML='<button type="button" data-shot="seat">기본 시점</button><button type="button" data-shot="top">위에서 보기</button>';
btns.addEventListener('click',e=>{const b=e.target.closest('[data-shot]');if(b)go(b.dataset.shot)});document.body.appendChild(btns);
const hint=document.createElement('div');hint.className='hint3d';hint.textContent='화면을 끌어 둘러보기 · 덱이나 카드를 눌러 고르기';document.body.appendChild(hint);

/* ---- 연출 ---- */
let rolling=0,shake=0;
window.fx3d=function(f){
  if(f.t==='dice'&&!f.seats){rolling=performance.now()+900;go('board')}
  if(f.t==='pop'||f.t==='attack')shake=performance.now()+450;
  if(f.t==='title')go('top')};

/* ---- 루프 ---- */
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<700?64:52;camera.updateProjectionMatrix()}
window.addEventListener('resize',resize);resize();
let lastV=null;
function frame(now){
  if(S){const sig=(S.v||0)+'|'+S.phase+'|'+ctl;if(sig!==lastSig){lastSig=sig;try{sync()}catch(e){console.error(e)}}
    document.body.classList.toggle('in-mg',S.phase==='mg')}
  pool.forEach((o,key)=>{
    if(o.userData.dying!=null){o.userData.dying+=1;o.position.lerp(AWAY,.15);if(o.userData.dying>25){scene.remove(o);pool.delete(key)}return}
    if(o.userData.tp){o.position.lerp(o.userData.tp,.16);o.quaternion.slerp(o.userData.tq,.16)}
    if(o.userData.glow!=null&&o.material[2]&&o.material[2].emissive)o.material[2].emissive.set(o.userData.glow?'#3a3000':'#000')});
  const d=pool.get('die');if(d&&rolling>now){d.position.set(16,4+Math.sin(now/60)*2,-12);d.rotation.x+=.4;d.rotation.z+=.33}
  else if(d&&rolling&&rolling<=now){rolling=0;lastSig=''}
  updateCamera();
  if(shake>now){const k=(shake-now)/450;camera.position.x+=Math.sin(now/18)*.8*k;camera.position.y+=Math.cos(now/23)*.6*k}
  renderer.render(scene,camera);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();

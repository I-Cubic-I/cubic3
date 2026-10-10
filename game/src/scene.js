/* ================= 3D 장면 (Three.js r128) — 1 단위 = 1 cm ================= */
const SC=(()=>{
const T=THREE;
const TY=75;            // 펠트 윗면 높이
const TR=70;            // 테이블 반지름
const SEAT_D=100;        // 의자 거리
const MON={x:0,z:-38};  // 모니터 자리
const BOX={x:-40,z:12}; // 디스크 상자
const DIE={x:36,z:8};
let renderer,scene,camera,canvas;
let W,H,dpr=1;
const clockT0=performance.now();let lastT=clockT0;
const V=(x,y,z)=>new T.Vector3(x,y,z);

/* ---------------- 텍스처 ---------------- */
const texCache=new Map();
function ctex(key,w,h,draw){if(texCache.has(key))return texCache.get(key);const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;texCache.set(key,t);return t}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
const FONT_D="'Black Han Sans','IBM Plex Sans KR',sans-serif",FONT_B="'IBM Plex Sans KR',sans-serif",FONT_M="'VT323',monospace";
const INKC={S:'#2f5fc8',H:'#d3302f',D:'#b98a00',C:'#2e9450'};
function faceTex(c){const base=c.replace(/b$/,'');return ctex('f'+base,256,358,(g,w,h)=>{const s=U(base),r=R(base),it=r>=11;
  g.fillStyle='#f7f3ea';rr(g,0,0,w,h,22);g.fill();
  if(it){g.strokeStyle='#e8b84a';g.lineWidth=14;rr(g,10,10,w-20,h-20,16);g.stroke()}
  g.fillStyle=INKC[s];g.font=`64px ${FONT_D}`;g.textBaseline='top';g.fillText(RL(r),24,20);
  g.font=`48px ${FONT_D}`;g.fillText(SYM[s],26,92);
  g.textAlign='center';g.textBaseline='middle';
  if(it){g.font=`150px ${FONT_D}`;g.fillText(RL(r),w/2,h*0.6)}else{g.font=`150px ${FONT_D}`;g.fillText(SYM[s],w/2,h*0.6)}})}
function backTex(){return ctex('back',256,358,(g,w,h)=>{g.fillStyle='#24324f';rr(g,0,0,w,h,22);g.fill();
  g.strokeStyle='#e8b84a';g.lineWidth=10;rr(g,16,16,w-32,h-32,14);g.stroke();
  g.strokeStyle='rgba(232,184,74,.35)';g.lineWidth=3;for(let k=-h;k<w;k+=22){g.beginPath();g.moveTo(k+30,30);g.lineTo(k+30+h,30+h);g.stroke()}
  g.fillStyle='#24324f';rr(g,w/2-50,h/2-50,100,100,50);g.fill();g.strokeStyle='#e8b84a';g.lineWidth=6;g.stroke();
  g.fillStyle='#e8b84a';g.font=`56px ${FONT_D}`;g.textAlign='center';g.textBaseline='middle';g.fillText('C',w/2,h/2+3)})}
const MGLOOK={hold:['#f0b48f','#cf6f48'],bomb:['#f7a3a3','#c94242'],auction:['#f2d27a','#c79a1c'],balloon:['#ffb35c','#e8853a'],rps:['#a9bdff','#6a7fe0'],vault:['#b9c3d6','#6f7d99'],count:['#9cc3ea','#4f86c6'],race:['#8fd0a4','#3f9a63']};
const mgLook=id=>MGLOOK[id]||['#cfd4dc','#7b8494'];
function floppyTex(id){return ctex('fl'+id,256,268,(g,w,h)=>{const [fld,body]=mgLook(id);
  g.fillStyle=body;g.beginPath();g.moveTo(0,0);g.lineTo(w-24,0);g.lineTo(w,24);g.lineTo(w,h);g.lineTo(0,h);g.closePath();g.fill();
  const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,'rgba(255,255,255,.22)');gr.addColorStop(1,'rgba(0,0,0,.18)');g.fillStyle=gr;g.fill();
  const sg=g.createLinearGradient(66,0,190,0);sg.addColorStop(0,'#9aa1ab');sg.addColorStop(.45,'#e4e8ee');sg.addColorStop(1,'#a7aeb8');
  g.fillStyle=sg;rr(g,66,-6,124,92,6);g.fill();g.fillStyle='#2a2a2e';rr(g,140,14,26,58,4);g.fill();
  g.fillStyle='#fbf8f0';rr(g,22,108,w-44,h-120,8);g.fill();g.fillStyle=fld;g.fillRect(22,108,w-44,12);
  g.fillStyle='#1b2230';g.textAlign='center';g.textBaseline='middle';const nm=MG[id]?MG[id].name:id;
  g.font=`${nm.length>5?34:40}px ${FONT_D}`;g.fillText(nm,w/2,180);
  g.font=`22px ${FONT_M}`;g.fillStyle='#8a7f6a';g.fillText('CUBIC DISK',w/2,236)})}
function pipTex(n){return ctex('die'+n,128,128,(g,w,h)=>{g.fillStyle='#fbf8f0';g.fillRect(0,0,w,h);g.fillStyle=n===1?'#d3302f':'#1b2230';
  const P={1:[[.5,.5]],2:[[.27,.27],[.73,.73]],3:[[.25,.25],[.5,.5],[.75,.75]],4:[[.27,.27],[.73,.27],[.27,.73],[.73,.73]],5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],6:[[.27,.22],[.73,.22],[.27,.5],[.73,.5],[.27,.78],[.73,.78]]}[n];
  P.forEach(([x,y])=>{g.beginPath();g.arc(x*w,y*h,n===1?17:12,0,7);g.fill()})})}
function numTex(n){return ctex('slot'+n,128,128,(g,w,h)=>{g.fillStyle='#e8b84a';g.beginPath();g.arc(64,64,60,0,7);g.fill();g.fillStyle='#1b1408';g.font=`78px ${FONT_D}`;g.textAlign='center';g.textBaseline='middle';g.fillText(n,64,70)})}

/* ---------------- 재료 ---------------- */
const matCache=new Map();
function mat(col,opt={}){const k=col+JSON.stringify(opt);if(!matCache.has(k))matCache.set(k,new T.MeshStandardMaterial(Object.assign({color:new T.Color(col).convertSRGBToLinear(),roughness:.8,metalness:0},opt)));return matCache.get(k)}
const CARD_W=6.3,CARD_H=8.8;
const gCard=()=>gCard.g||(gCard.g=new T.PlaneGeometry(CARD_W,CARD_H));
function makeCard(c){const grp=new T.Group();
  const f=new T.Mesh(gCard(),c?new T.MeshStandardMaterial({map:faceTex(c),roughness:.6}):new T.MeshStandardMaterial({map:backTex(),roughness:.6}));
  const b=new T.Mesh(gCard(),new T.MeshStandardMaterial({map:backTex(),roughness:.6}));b.rotation.y=Math.PI;
  f.castShadow=true;grp.add(f,b);grp.userData.card=c;return grp}
function makeFloppy(id){const geo=new T.BoxGeometry(9,.34,9.4);const [,body]=mgLook(id);const side=mat(body);
  const top=new T.MeshStandardMaterial({map:floppyTex(id),roughness:.5});
  const m=new T.Mesh(geo,[side,side,top,side,side,side]);m.castShadow=true;return m}
function makeDie(){const mats=[3,4,1,6,2,5].map(n=>new T.MeshStandardMaterial({map:pipTex(n),roughness:.4}));
  const m=new T.Mesh(new T.BoxGeometry(2.6,2.6,2.6),mats);m.castShadow=true;return m}
function dieEuler(v){return {1:[0,0,0],6:[Math.PI,0,0],2:[-Math.PI/2,0,0],5:[Math.PI/2,0,0],3:[0,0,Math.PI/2],4:[0,0,-Math.PI/2]}[v]||[0,0,0]}
function makeCube(s){const m=new T.Mesh(new T.BoxGeometry(2.2,2.2,2.2),mat(SUITCOL[s],{roughness:.35}));m.castShadow=true;return m}

/* ---------------- 풀: 키로 관리하고 목표로 미끄러진다 ---------------- */
const pool=new Map();
function want(key,make,pos,euler,scale=1,opt={}){let e=pool.get(key);
  if(!e){const obj=make();obj.position.copy(opt.from||pos);if(opt.fromEuler)obj.rotation.set(...opt.fromEuler);else obj.rotation.set(...euler);obj.scale.setScalar(opt.fromScale!=null?opt.fromScale:scale);
    scene.add(obj);e={obj,tp:new T.Vector3(),tq:new T.Quaternion(),ts:1,speed:8};pool.set(key,e)}
  e.tp.copy(pos);e.tq.setFromEuler(new T.Euler(...euler));e.ts=scale;e.alive=true;e.speed=opt.speed||8;e.lift=opt.lift||0;e.obj.visible=true;
  if(opt.pick)setPick(e.obj,opt.pick);else clearPick(e.obj);
  return e}
function sweep(){for(const [k,e] of pool){if(!e.alive&&!e.dying){e.dying=true;e.ts=0.001}e.alive=false}}
const picks=new Set();
function setPick(o,data){o.userData.pick=data;picks.add(o)}
function clearPick(o){if(o.userData.pick){delete o.userData.pick;picks.delete(o)}}
function stepPool(dt){for(const [k,e] of pool){const a=window.__fast?1:1-Math.exp(-dt*e.speed);
  const tp=e.tp.clone();if(!window.__fast&&e.lift&&e.obj.position.distanceTo(e.tp)>1.2)tp.y+=e.lift*Math.min(1,e.obj.position.distanceTo(e.tp)/20);
  e.obj.position.lerp(tp,a);e.obj.quaternion.slerp(e.tq,a);const s=e.obj.scale.x+(e.ts-e.obj.scale.x)*a;e.obj.scale.setScalar(s);
  if(e.dying&&s<0.02){scene.remove(e.obj);clearPick(e.obj);pool.delete(k)}}}

/* ---------------- 방과 테이블 ---------------- */
function buildRoom(){
  scene.background=new T.Color('#14110e').convertSRGBToLinear();
  scene.add(new T.HemisphereLight('#fff1dd','#1a1410',.6));
  const spot=new T.SpotLight('#ffe4bf',1.25,0,0.72,0.55,1);spot.position.set(0,280,60);spot.target.position.set(0,TY,0);
  spot.castShadow=true;spot.shadow.mapSize.set(1024,1024);spot.shadow.camera.near=100;spot.shadow.camera.far=500;spot.shadow.bias=-0.0006;scene.add(spot,spot.target);
  const fill=new T.DirectionalLight('#c9d8ff',.18);fill.position.set(-120,160,200);scene.add(fill);
    const rug=new T.Mesh(new T.CircleGeometry(165,64),mat('#3a1f1a',{roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.y=.2;rug.receiveShadow=true;scene.add(rug);
  const wood=mat('#5b3b23',{roughness:.55});
  const top=new T.Mesh(new T.CylinderGeometry(TR,TR-1,4,72),wood);top.position.y=TY-2;top.castShadow=true;top.receiveShadow=true;scene.add(top);
  const rim=new T.Mesh(new T.TorusGeometry(TR-3.2,3.2,12,96),wood);rim.rotation.x=Math.PI/2;rim.position.y=TY+.4;rim.castShadow=true;scene.add(rim);
  const felt=new T.Mesh(new T.CircleGeometry(TR-6,72),mat('#1f4c3f',{roughness:.95}));felt.rotation.x=-Math.PI/2;felt.position.y=TY+.05;felt.receiveShadow=true;scene.add(felt);
  const ped=new T.Mesh(new T.CylinderGeometry(9,12,TY-4,24),wood);ped.position.y=(TY-4)/2;scene.add(ped);
  const foot=new T.Mesh(new T.CylinderGeometry(34,38,4,48),wood);foot.position.y=2;foot.receiveShadow=true;scene.add(foot);
  // 엘리베이터 해치(가운데가 내려갔다 올라오는 연출용)
  hatch=new T.Mesh(new T.CircleGeometry(24,48),mat('#0d0b09',{roughness:1}));hatch.rotation.x=-Math.PI/2;hatch.position.set(MON.x,TY+.08,MON.z+2);hatch.scale.setScalar(.001);scene.add(hatch);
}
let hatch;

/* ---------------- 아바타 (앉아서 테이블을 바라본다) ---------------- */
const HAIRS=['#3b2416','#15110e','#7a5236','#5a3a22','#2a1d15'];
function limb(a,b,r,m){const d=b.clone().sub(a);const len=d.length();const g=new T.CylinderGeometry(r,r*.9,len,10);g.translate(0,len/2,0);
  const mesh=new T.Mesh(g,m);mesh.position.copy(a);mesh.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());mesh.castShadow=true;return mesh}
function buildAvatar(col,hairCol){const g=new T.Group();const body=mat(col,{roughness:.7}),skin=mat('#e3bd98',{roughness:.65}),hair=mat(hairCol,{roughness:.9}),woodm=mat('#3e2716',{roughness:.6});
  const seat=new T.Mesh(new T.BoxGeometry(44,4,42),woodm);seat.position.set(0,45,-4);seat.castShadow=true;
  const back=new T.Mesh(new T.BoxGeometry(44,56,4),woodm);back.position.set(0,75,-25);back.castShadow=true;
  [[-19,-21],[19,-21],[-19,14],[19,14]].forEach(([x,z])=>{const l=new T.Mesh(new T.BoxGeometry(3,44,3),woodm);l.position.set(x,22,z);g.add(l)});
  const torso=new T.Mesh(new T.CylinderGeometry(15,17,46,18),body);torso.scale.z=.62;torso.position.set(0,72,-6);torso.castShadow=true;
  const sh=new T.Mesh(new T.SphereGeometry(16.5,20,12),body);sh.scale.set(1.05,.46,.62);sh.position.set(0,94,-6);sh.castShadow=true;
  const hips=new T.Mesh(new T.BoxGeometry(32,12,34),body);hips.position.set(0,52,2);
  const neck=new T.Mesh(new T.CylinderGeometry(4,4.5,8,10),skin);neck.position.set(0,101,-5);
  const head=new T.Group();head.position.set(0,104,-4);
  const hd=new T.Mesh(new T.SphereGeometry(10,24,18),skin);hd.scale.set(.95,1.05,1);hd.position.y=8;hd.castShadow=true;
  const hr=new T.Mesh(new T.SphereGeometry(10.7,24,16,0,Math.PI*2,0,Math.PI*.56),hair);hr.position.y=8.4;hr.rotation.x=-.42;
  const eyeM=mat('#1b1408');[-3.4,3.4].forEach(x=>{const e=new T.Mesh(new T.SphereGeometry(1.1,8,6),eyeM);e.position.set(x,9,9.3);head.add(e)});
  const nose=new T.Mesh(new T.SphereGeometry(1.4,8,6),skin);nose.position.set(0,6.5,10);
  head.add(hd,hr,nose);head.rotation.x=.28;
  const L=[-1,1].map(sx=>{const s=V(sx*16,92,-6),e=V(sx*13,79,10),h=V(sx*5,85,25);return [limb(s,e,3.8,body),limb(e,h,3.3,body),(()=>{const m=new T.Mesh(new T.SphereGeometry(3.4,10,8),skin);m.position.copy(h);return m})()]}).flat();
  const fan=new T.Group();fan.position.set(0,86,26);fan.rotation.set(-0.35,Math.PI,0);
  const ring=new T.Mesh(new T.TorusGeometry(30,1.4,8,48),new T.MeshBasicMaterial({color:new T.Color('#e8b84a').convertSRGBToLinear(),transparent:true,opacity:0}));ring.rotation.x=Math.PI/2;ring.position.y=.6;
  g.add(seat,back,torso,sh,hips,neck,head,...L,fan,ring);
  g.userData={head,fan,ring,torso,fanN:-1};
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});
  return g}
function setFan(av,n){const fan=av.userData.fan;n=Math.min(n,9);if(av.userData.fanN===n)return;av.userData.fanN=n;
  while(fan.children.length)fan.remove(fan.children[0]);
  for(let k=0;k<n;k++){const c=makeCard(null);const a=(k-(n-1)/2)*0.17;const piv=new T.Group();piv.rotation.z=a;c.position.set(0,CARD_H/2,k*.05);piv.add(c);fan.add(piv)}}
const avatars=new Map();let seatKey='';
function seatPos(i){const n=S.seats.length,v=viewSeat();const r=(i-v+n)%n;const phi=r*2*Math.PI/n;return {phi,x:Math.sin(phi)*SEAT_D,z:Math.cos(phi)*SEAT_D}}
function buildSeats(){const key=S.seats.length+':'+viewSeat()+':'+S.seats.map(p=>p.uid).join(',');if(key===seatKey)return;seatKey=key;
  for(const [,a] of avatars)scene.remove(a);avatars.clear();
  S.seats.forEach((p,i)=>{if(i===viewSeat())return;const a=buildAvatar(SEATCOL[i%5],HAIRS[i%5]);const sp=seatPos(i);a.position.set(sp.x,0,sp.z);a.lookAt(0,0,0);
    a.traverse(o=>{if(o.isMesh)setPick(o,{kind:'seat',i})});a.userData.at='main';scene.add(a);avatars.set(i,a)})}

/* ================= 넓은 홀: 방 꾸미기 ================= */
const HALL=900;   // 벽까지 거리
function plankTex(){return ctex('plank',512,512,(g,w,h)=>{g.fillStyle='#3a2a1c';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=32){const off=(y/32%2)*130;for(let x=-off;x<w;x+=260){const l=40+((x*7+y*3)%25);g.fillStyle=`rgb(${l+18},${l},${Math.round(l*.62)})`;g.fillRect(x+2,y+2,256,28)}}
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=2;for(let y=0;y<h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}})}
function wallTex(){return ctex('wall',256,512,(g,w,h)=>{g.fillStyle='#2b201a';g.fillRect(0,0,w,h);for(let x=0;x<w;x+=32){g.fillStyle=(x/32)%2?'#2f231c':'#281d17';g.fillRect(x,0,32,h*.62)}
  g.fillStyle='#4a3020';g.fillRect(0,h*.62,w,h*.38);g.fillStyle='#5b3b23';g.fillRect(0,h*.62,w,10);for(let x=8;x<w;x+=64){g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=3;g.strokeRect(x,h*.68,48,h*.26)}})}
function buildHall(){
  scene.fog=new T.Fog(new T.Color('#14110e').convertSRGBToLinear(),700,2100);
  const ft=plankTex();ft.wrapS=ft.wrapT=T.RepeatWrapping;ft.repeat.set(9,9);
  const floor=new T.Mesh(new T.PlaneGeometry(HALL*2,HALL*2),new T.MeshStandardMaterial({map:ft,roughness:.75}));floor.rotation.x=-Math.PI/2;floor.position.y=.05;floor.receiveShadow=true;scene.add(floor);
  const wt=wallTex();wt.wrapS=T.RepeatWrapping;wt.repeat.set(10,1);const wm=new T.MeshStandardMaterial({map:wt,roughness:.9});
  for(let k=0;k<4;k++){const w=new T.Mesh(new T.PlaneGeometry(HALL*2,420),wm);const a=k*Math.PI/2;w.position.set(Math.sin(a)*HALL,210,Math.cos(a)*HALL);w.rotation.y=a+Math.PI;scene.add(w)}
  const ceil=new T.Mesh(new T.PlaneGeometry(HALL*2,HALL*2),mat('#1a1410',{roughness:1}));ceil.rotation.x=Math.PI/2;ceil.position.y=420;scene.add(ceil);
  for(let k=-2;k<=2;k++){const b=new T.Mesh(new T.BoxGeometry(HALL*2,22,26),mat('#3a2716'));b.position.set(0,408,k*360);scene.add(b)}
  // 창문(달빛)과 커튼
  const win=new T.MeshBasicMaterial({map:ctex('win',128,192,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#1d3a5c');gr.addColorStop(1,'#0e1a2a');g.fillStyle=gr;g.fillRect(0,0,w,h);g.fillStyle='rgba(255,255,255,.5)';for(let s=0;s<14;s++)g.fillRect((s*53)%w,(s*37)%(h*.6),2,2);g.fillStyle='#3a2716';g.fillRect(w/2-3,0,6,h);g.fillRect(0,h*.45,w,6);g.strokeStyle='#3a2716';g.lineWidth=10;g.strokeRect(0,0,w,h)})});
  [[-1,0],[1,0],[0,-1]].forEach(([sx,sz])=>{for(const o of [-300,300]){const m=new T.Mesh(new T.PlaneGeometry(120,180),win);
    if(sx){m.position.set(sx*(HALL-1),220,o);m.rotation.y=-sx*Math.PI/2}else{m.position.set(o,220,sz*(HALL-1))}scene.add(m);
    const cur=mat('#5a1f1c',{roughness:1});for(const cs of [-1,1]){const c=new T.Mesh(new T.BoxGeometry(34,230,8),cur);if(sx){c.position.set(sx*(HALL-6),205,o+cs*76)}else{c.position.set(o+cs*76,205,sz*(HALL-6))}scene.add(c)}}});
  // 책장
  const shelfM=mat('#3e2716',{roughness:.7});const bookCols=['#7a2e2e','#2f4f6f','#6b5a2a','#2e5a3e','#5a3a6b','#8a5a2a'];
  for(const x of [-560,-300,300,560]){const sh=new T.Group();const frame=new T.Mesh(new T.BoxGeometry(180,240,40),shelfM);frame.position.y=120;sh.add(frame);
    for(let r=0;r<4;r++){let bx=-80;let q=0;while(bx<78){const bw=5+((q*7+r*3)%6);const bh=34+((q*11+r)%14);const bk=new T.Mesh(new T.BoxGeometry(bw,bh,30),mat(bookCols[(q+r)%6],{roughness:.8}));bk.position.set(bx+bw/2,24+r*56+bh/2,4);sh.add(bk);bx+=bw+1;q++}}
    sh.position.set(x,0,HALL-24);sh.rotation.y=Math.PI;scene.add(sh)}
  // 화분
  const pot=mat('#6b4a32'),leaf=mat('#2f5a34',{roughness:.9});
  [[-800,-800],[800,-800],[-800,800],[800,800],[-820,0],[820,0]].forEach(([x,z])=>{const g=new T.Group();const p=new T.Mesh(new T.CylinderGeometry(22,16,40,16),pot);p.position.y=20;g.add(p);
    for(let k=0;k<7;k++){const s=new T.Mesh(new T.SphereGeometry(26-k*2,12,10),leaf);s.position.set(Math.sin(k*2.3)*14,60+k*16,Math.cos(k*2.3)*14);g.add(s)}g.position.set(x,0,z);scene.add(g)});
  // 등: 가운데 테이블 위 큰 등 + 구석의 따뜻한 빛
  pendant(0,0,1.25);
  [[-600,-600],[600,600],[600,-600],[-600,600]].forEach(([x,z])=>{const l=new T.PointLight('#ffb36b',.35,900,2);l.position.set(x,300,z);scene.add(l)});
}
function pendant(x,z,s=1,col='#e8b84a'){const g=new T.Group();const cord=new T.Mesh(new T.CylinderGeometry(.6,.6,150,6),mat('#111'));cord.position.y=345;g.add(cord);
  const shade=new T.Mesh(new T.ConeGeometry(30*s,24*s,32,1,true),new T.MeshStandardMaterial({color:new T.Color('#2e3a2c').convertSRGBToLinear(),side:T.DoubleSide,roughness:.5,metalness:.3}));shade.position.y=270;g.add(shade);
  const bulb=new T.Mesh(new T.SphereGeometry(7*s,16,12),new T.MeshBasicMaterial({color:new T.Color('#ffe2a8').convertSRGBToLinear()}));bulb.position.y=262;g.add(bulb);
  const ring=new T.Mesh(new T.TorusGeometry(30*s,1.2,6,32),new T.MeshBasicMaterial({color:new T.Color(col).convertSRGBToLinear()}));ring.rotation.x=Math.PI/2;ring.position.y=258;g.add(ring);
  g.position.set(x,0,z);scene.add(g);return g}

/* ================= 미니게임 테이블 (게임마다 따로) ================= */
const ST_IDS=['balloon','vault','race','count','hold','bomb','auction','rps'];
const ST_R=500;
const STYLE={balloon:{felt:'#7a3b22',wood:'#c99a6a',shape:'round'},vault:{felt:'#30363f',wood:'#1f2329',shape:'square'},race:{felt:'#2c5a3c',wood:'#5b3b23',shape:'long'},count:{felt:'#23405e',wood:'#3a2a1c',shape:'round'},
  hold:{felt:'#5a2626',wood:'#2a1a12',shape:'octa'},bomb:{felt:'#3a1414',wood:'#1a1a1a',shape:'round'},auction:{felt:'#4a3a12',wood:'#6b4a2a',shape:'square'},rps:{felt:'#2e2e5a',wood:'#c9c2b4',shape:'round'}};
const stations=new Map();
function stFrame(id){const k=ST_IDS.indexOf(id);const a=k*2*Math.PI/ST_IDS.length+Math.PI/ST_IDS.length;const x=Math.sin(a)*ST_R,z=Math.cos(a)*ST_R;return {x,z,ry:Math.atan2(-x,-z)}}
function stLocal(id,lx,ly,lz){const f=stFrame(id);const c=Math.cos(f.ry),s=Math.sin(f.ry);return V(f.x+lx*c+lz*s,ly,f.z-lx*s+lz*c)}
function buildStations(){ST_IDS.forEach(id=>{const f=stFrame(id),st=STYLE[id];const g=new T.Group();g.position.set(f.x,0,f.z);g.rotation.y=f.ry;
  const wood=mat(st.wood,{roughness:.5}),felt=mat(st.felt,{roughness:.95});
  let top,fl;
  if(st.shape==='round'||st.shape==='octa'){const seg=st.shape==='octa'?8:56;top=new T.Mesh(new T.CylinderGeometry(52,51,4,seg),wood);fl=new T.Mesh(new T.CylinderGeometry(47,47,.4,seg),felt)}
  else if(st.shape==='square'){top=new T.Mesh(new T.BoxGeometry(104,4,104),wood);fl=new T.Mesh(new T.BoxGeometry(94,.4,94),felt)}
  else{top=new T.Mesh(new T.BoxGeometry(150,4,96),wood);fl=new T.Mesh(new T.BoxGeometry(140,.4,86),felt)}
  top.position.y=TY-2;fl.position.y=TY+.1;top.castShadow=fl.receiveShadow=top.receiveShadow=true;
  const leg=new T.Mesh(new T.CylinderGeometry(7,10,TY-4,16),wood);leg.position.y=(TY-4)/2;
  const rug=new T.Mesh(new T.CircleGeometry(120,48),mat(st.felt,{roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.y=.3;rug.receiveShadow=true;
  const props=new T.Group();
  // 미니게임 이름 간판(테이블 뒤 받침대)
  const look=mgLook(id);const sign=new T.Mesh(new T.PlaneGeometry(70,18),new T.MeshBasicMaterial({map:ctex('sign'+id,512,132,(gg,w,h)=>{gg.fillStyle=look[1];rr(gg,0,0,w,h,30);gg.fill();gg.fillStyle='#fbf8f0';gg.font=`76px ${FONT_D}`;gg.textAlign='center';gg.textBaseline='middle';gg.fillText(MG[id]?MG[id].name:id,w/2,h/2+4)}),transparent:true}));
  sign.position.set(0,172,96);sign.rotation.y=Math.PI;
  const post=new T.Mesh(new T.CylinderGeometry(1.2,1.2,120,8),mat('#222'));post.position.set(0,145,82);
  g.add(rug,top,fl,leg,props,sign);scene.add(g);stations.set(id,{g,props,parts:{}});
  pendant(f.x,f.z,.8,look[0])})}
let mgSpot;
function stationSeat(id,i){const n=S.seats.length,v=viewSeat();const r=(i-v+n)%n;const phi=Math.PI+r*2*Math.PI/n;const d=78;const lx=Math.sin(phi)*d,lz=Math.cos(phi)*d;return stLocal(id,lx,0,lz)}
function stationShot(id){SHOTS.station={p:stLocal(id,0,168,-178),l:stLocal(id,0,TY-4,18),fov:50};
  if(W/H<1.1)SHOTS.station.p=stLocal(id,0,215,-220);
  mgSpot.position.copy(stLocal(id,0,320,-40));mgSpot.target.position.copy(stLocal(id,0,TY,0));mgSpot.intensity=1.1}

/* --- 미니게임 소품: 상태(S.mg)를 그대로 그린다 --- */
function hsl(h,s,l){return new T.Color().setHSL(h/360,s,l).convertSRGBToLinear()}
function propCard(st,key,c,lx,ly,lz,yaw=0,sc=1,pick,down=false){const id=st.id;const p=stLocal(id,lx,TY+.6+ly,lz);const f=stFrame(id);const w=f.ry+Math.PI+yaw;
  return want('m:'+key,()=>makeCard(c),p,down?[Math.PI/2,0,-w]:[-Math.PI/2,0,w],sc,{lift:6,pick,from:stLocal(id,0,TY+30,0)})}
function layoutMG(){if(!S||S.phase!=='mg'||!S.mg)return;const m=S.mg,id=m.id;if(!stations.has(id))return;const st={id};const f=stFrame(id);const st0=stations.get(id);const P=st0.parts;
  
  if(id==='balloon'){if(!P.bal){const b=new T.Mesh(new T.SphereGeometry(10,32,24),new T.MeshStandardMaterial({color:'#e8853a',roughness:.35}));b.castShadow=true;const knot=new T.Mesh(new T.ConeGeometry(1.6,3,12),b.material);knot.position.y=-10.5;knot.rotation.x=Math.PI;b.add(knot);
      const str=new T.Mesh(new T.CylinderGeometry(.15,.15,40,4),mat('#d8cfc0'));st0.props.add(b,str);P.bal=b;P.str=str}
    const r=Math.min(1,m.total/BLIMIT);const s=.8+r*2.1;P.bal.userData.ts=s;P.bal.material.color.copy(hsl(130-130*r,.7,.52));
    P.bal.position.set(0,TY+40+s*10,0);P.str.position.set(0,TY+20+s*2,0);P.str.scale.y=(s*10)/40+.3;
    m.pile.slice(-6).forEach((c,k)=>propCard(st,'bp'+c,c,(k-2.5)*2.2,k*.03,-14+((k*13)%5),((k*37)%11-5)*.08))}
  if(id==='hold'){if(!P.tray){const tr=new T.Mesh(new T.BoxGeometry(40,3,28),mat('#1d3a2a'));tr.position.y=TY+1.5;const rim=new T.Mesh(new T.BoxGeometry(42,5,30),mat('#2a1a12'));rim.position.y=TY+1;st0.props.add(rim,tr);
      const d1=makeDie();d1.scale.setScalar(2.4);const d2=makeDie();d2.scale.setScalar(2.4);st0.props.add(d1,d2);P.d1=d1;P.d2=d2}
    const L=m.last;P.d1.position.set(L&&L.b!=null?-7:0,TY+6.2,0);P.d1.rotation.set(...dieEuler(L?L.a:1));P.d2.visible=!!(L&&L.b!=null);if(L&&L.b!=null){P.d2.position.set(7,TY+6.2,0);P.d2.rotation.set(...dieEuler(L.b))}}
  if(id==='bomb'){const alive=m.alive.length;m.lay.forEach((c,k)=>{if(!c)return;const n=m.lay.length;const a=(k-(n-1)/2)*.32;propCard(st,'bl'+k+'_'+c,null,Math.sin(a)*26,0,-Math.cos(a)*6+10,a,1.3,{kind:'bomb',k},true)});
    Object.keys(m.flip).forEach(j=>{const sp=stationSeat(id,+j);const v=sp.clone().sub(stLocal(id,0,0,0)).multiplyScalar(.55);const p=stLocal(id,0,0,0).add(v);want('m:bf'+m.flip[j].c,()=>makeCard(m.flip[j].c),V(p.x,TY+.6,p.z),[-Math.PI/2,0,Math.atan2(v.x,v.z)+Math.PI],1.4,{lift:8})})}
  if(id==='auction'){m.pot.forEach((p,k)=>propCard(st,'ap'+p.c,p.c,(k-(m.pot.length-1)/2)*9,0,0,0,1.5));
    m.prizes.forEach((p,k)=>{if(!p)return;propCard(st,'aq'+p.c,p.up?p.c:null,(k-2)*8.5,0,26,0,1.1,null,!p.up)});
    Object.keys(m.won).forEach(j=>m.won[j].forEach((c,k)=>{const sp=stationSeat(id,+j);const v=sp.clone().sub(stLocal(id,0,0,0)).multiplyScalar(.6);const p=stLocal(id,0,0,0).add(v);want('m:aw'+c,()=>makeCard(c),V(p.x+k*1.5,TY+.6+k*.05,p.z),[-Math.PI/2,0,Math.atan2(v.x,v.z)+Math.PI],.9,{lift:8})}))}
  if(id==='vault'){if(!P.doors){P.doors=[1,2,3].map(z=>{const g=new T.Group();const bx=new T.Mesh(new T.BoxGeometry(22,30,16),mat('#4a5260',{roughness:.35,metalness:.6}));bx.position.y=15;bx.castShadow=true;
      const face=new T.Mesh(new T.PlaneGeometry(18,26),new T.MeshStandardMaterial({map:ctex('vd'+z,128,180,(gg,w,h)=>{gg.fillStyle='#6b7584';gg.fillRect(0,0,w,h);gg.strokeStyle='#2a2f37';gg.lineWidth=6;gg.strokeRect(8,8,w-16,h-16);gg.beginPath();gg.arc(w/2,h*.62,30,0,7);gg.stroke();gg.fillStyle='#e8b84a';gg.font=`64px ${FONT_D}`;gg.textAlign='center';gg.fillText(z,w/2,64)}),roughness:.4,metalness:.4}));
      face.position.set(0,15,-8.1);face.rotation.y=Math.PI;const lamp=new T.Mesh(new T.SphereGeometry(2.2,12,8),new T.MeshBasicMaterial({color:'#3a1010'}));lamp.position.set(0,33,-2);g.add(bx,face,lamp);g.userData.lamp=lamp;g.position.set((2-z)*30,TY,8);st0.props.add(g);setPick(bx,{kind:'door',z});return g})}
    const hit=m.last?m.last.zones:[];P.doors.forEach((d,k)=>{d.userData.lamp.material.color.set(hit.includes(k+1)?'#ff4d4d':'#3a1010')})}
  if(id==='count'){if(!P.stand){const s=new T.Group();const bk=new T.Mesh(new T.BoxGeometry(24,32,2),mat('#2a1a12'));bk.position.y=TY+18;const c=makeCard(null);c.scale.setScalar(3);c.position.set(0,TY+18,-1.2);c.rotation.y=Math.PI;s.add(bk,c);st0.props.add(s);P.stand=s;P.card=c}}
  if(id==='race'){if(!P.board){const bd=new T.Mesh(new T.PlaneGeometry(120,70),new T.MeshStandardMaterial({map:ctex('raceboard',640,380,(gg,w,h)=>{gg.fillStyle='#f3ecdc';gg.fillRect(0,0,w,h);const lw=(w-120)/5;
        ['밖','1','2','3','결승'].forEach((t,c)=>{gg.fillStyle=c===4?'#f2d27a':c===0?'#ddd3c0':'#e8dfcc';gg.fillRect(100+c*lw,12,lw-6,h-24);gg.fillStyle='#8a7f6a';gg.font=`28px ${FONT_D}`;gg.textAlign='center';gg.fillText(t,100+c*lw+lw/2,h-24)});
        SUITS.forEach((s,k)=>{gg.fillStyle=INKC[s];gg.font=`56px ${FONT_D}`;gg.textAlign='center';gg.textBaseline='middle';gg.fillText(SYM[s],50,40+k*80)})}),roughness:.8}));
      bd.rotation.x=-Math.PI/2;bd.rotation.z=Math.PI;bd.position.y=TY+.4;st0.props.add(bd);P.board=bd;P.horse={};SUITS.forEach(s=>{const h=new T.Mesh(new T.CylinderGeometry(3.4,3.8,6,20),mat(SUITCOL[s],{roughness:.4}));h.castShadow=true;st0.props.add(h);P.horse[s]=h})}
    SUITS.forEach((s,k)=>{const h=P.horse[s];h.userData.tp=V(-((100+m.pos[s]*104+52)*.1875-60),TY+3.4,35-(40+k*80)*70/380)});
    m.pile.slice(-1).forEach(c=>propCard(st,'rp'+c,c,-66,0,-22,0,1.3))}
}
function tickMG(dt,t){if(!S||S.phase!=='mg'||!S.mg)return;const m=S.mg,st0=stations.get(m.id);if(!st0)return;const P=st0.parts;const a=1-Math.exp(-dt*6);
  if(P.bal){const s=P.bal.scale.x+((P.bal.userData.ts||1)-P.bal.scale.x)*a;P.bal.scale.set(s,s*1.12,s);P.bal.position.x=Math.sin(t*1.3)*.8;P.bal.rotation.z=Math.sin(t*1.1)*.05}
  if(P.horse)for(const s of SUITS){const h=P.horse[s];if(h.userData.tp){h.position.lerp(h.userData.tp,a);h.position.y=h.userData.tp.y+Math.max(0,Math.sin(t*6+SUITS.indexOf(s)))*.6}}
  if(P.card&&m.id==='count'){const now=Date.now();let c=null;if(now>=m.t0){const k=Math.floor((now-m.t0)/CFLIP);c=now>=countOpenAt(m)?m.dec:m.seq[Math.min(k,m.seq.length-1)]}
    if(P.card.userData.cur!==c){P.card.userData.cur=c;const f=P.card.children[0];f.material=new T.MeshStandardMaterial({map:c?faceTex(c):backTex(),roughness:.6});P.card.rotation.y=Math.PI+.6}
    P.card.rotation.y+=(Math.PI-P.card.rotation.y)*Math.min(1,dt*10)}}
function clearMG(){for(const [,st] of stations){while(st.props.children.length)st.props.remove(st.props.children[0]);for(const k in st.parts)delete st.parts[k]}}

/* ---------------- 모니터 (플로피 드라이브 일체형) ---------------- */
let monitor,screenTex,screenCtx,screenState={mode:'off'};
function buildMonitor(){monitor=new T.Group();const shell=mat('#e6dcc7',{roughness:.55}),dark=mat('#c9bea7',{roughness:.6});
  const body=new T.Mesh(new T.BoxGeometry(36,40,30),shell);body.position.y=20;body.castShadow=true;body.receiveShadow=true;
  const bez=new T.Mesh(new T.BoxGeometry(31,23,1),dark);bez.position.set(0,26,15.2);
  const c=document.createElement('canvas');c.width=1024;c.height=742;screenCtx=c.getContext('2d');screenTex=new T.CanvasTexture(c);screenTex.encoding=T.sRGBEncoding;
  const scr=new T.Mesh(new T.PlaneGeometry(29,21),new T.MeshBasicMaterial({map:screenTex}));scr.position.set(0,26,15.8);
  const slotPlate=new T.Mesh(new T.BoxGeometry(13,2.6,.6),dark);slotPlate.position.set(4,9.5,15.2);
  const slot=new T.Mesh(new T.BoxGeometry(11,.6,.8),mat('#120f0c'));slot.position.set(4,9.8,15.3);
  const led1=new T.Mesh(new T.SphereGeometry(.45,8,6),new T.MeshBasicMaterial({color:'#5bd47a'}));led1.position.set(-13,9.6,15.4);
  const led2=led1.clone();led2.material=new T.MeshBasicMaterial({color:'#e8b84a'});led2.position.x=-11.6;
  const logo=new T.Mesh(new T.PlaneGeometry(10,1.6),new T.MeshBasicMaterial({map:ctex('logo',256,40,(g,w,h)=>{g.fillStyle='#e6dcc7';g.fillRect(0,0,w,h);g.fillStyle='#8a7f6a';g.font=`34px ${FONT_M}`;g.textBaseline='middle';g.fillText('CUBIC·VISION',4,22)})}));logo.position.set(-9,12.4,15.55);
  const foot=new T.Mesh(new T.BoxGeometry(30,2,26),dark);foot.position.y=1;
  monitor.add(body,bez,scr,slotPlate,slot,led1,led2,logo,foot);monitor.position.set(MON.x,TY-46,MON.z);monitor.visible=false;scene.add(monitor);
  monitor.userData={ty:TY-46};drawScreen();}
function monitorUp(up){monitor.userData.ty=up?TY:TY-46;if(up)monitor.visible=true}
const SLOT_W=()=>V(MON.x+4,TY+9.8,MON.z+15.6);
function drawScreen(){const g=screenCtx,w=1024,h=742,st=screenState;
  const bg=g.createRadialGradient(w/2,h*.42,40,w/2,h*.45,w*.7);bg.addColorStop(0,'#1d3550');bg.addColorStop(1,'#0c1622');g.fillStyle=bg;g.fillRect(0,0,w,h);
  g.textAlign='center';g.textBaseline='middle';
  if(st.mode==='off'){g.fillStyle='#05080c';g.fillRect(0,0,w,h)}
  if(st.mode==='insert'){g.fillStyle='#7fe3ff';g.shadowColor='rgba(127,227,255,.8)';g.shadowBlur=18;g.font=`120px ${FONT_M}`;g.fillText('INSERT DISK',w/2,h*.43);g.shadowBlur=0;g.fillStyle='rgba(200,235,255,.75)';g.font=`44px ${FONT_B}`;g.fillText('디스크를 넣어 주세요',w/2,h*.62)}
  if(st.mode==='loading'){g.fillStyle='#7fe3ff';g.shadowColor='rgba(127,227,255,.8)';g.shadowBlur=16;g.font=`86px ${FONT_M}`;g.fillText('NOW LOADING',w/2,h*.22);
    g.shadowColor='rgba(255,179,92,.8)';g.shadowBlur=30;g.fillStyle='#fff';const nm=st.name||'';g.font=`${nm.length>5?130:160}px ${FONT_D}`;g.fillText(nm,w/2,h*.5);g.shadowBlur=0;
    g.strokeStyle='rgba(127,227,255,.6)';g.lineWidth=5;rr(g,w/2-300,h*.74,600,34,17);g.stroke();g.fillStyle='#7fe3ff';rr(g,w/2-300,h*.74,600*Math.min(1,st.p||0),34,17);g.fill()}
  if(st.mode==='alert'){g.strokeStyle='#ff4d4d';g.lineWidth=22;g.shadowColor='rgba(255,77,77,.8)';g.shadowBlur=30;rr(g,140,110,w-280,h-220,70);g.stroke();
    const cx=w/2,cy=h/2;g.lineWidth=18;g.beginPath();g.moveTo(cx-110,cy-120);g.lineTo(cx+80,cy-120);g.lineTo(cx+110,cy-90);g.lineTo(cx+110,cy+120);g.lineTo(cx-110,cy+120);g.closePath();g.stroke();
    g.strokeRect(cx-60,cy-120,110,70);g.strokeRect(cx-75,cy+5,150,95);g.lineWidth=34;g.lineCap='round';g.beginPath();g.moveTo(cx-150,cy-150);g.lineTo(cx+150,cy+150);g.moveTo(cx+150,cy-150);g.lineTo(cx-150,cy+150);g.stroke();g.shadowBlur=0}
  if(st.mode==='title'){g.shadowColor='rgba(255,179,92,.8)';g.shadowBlur=30;g.fillStyle='#fff';g.font=`150px ${FONT_D}`;g.fillText(st.name||'',w/2,h*.48);g.shadowBlur=0}
  for(let y=0;y<h;y+=5){g.fillStyle='rgba(255,255,255,.03)';g.fillRect(0,y,w,2)}
  screenTex.needsUpdate=true}
function setScreen(s){screenState=s;drawScreen()}

/* ---------------- 디스크 상자 ---------------- */
let dbox;
function buildBox(){dbox=new T.Group();const pl=mat('#2a2f37',{roughness:.4});
  const base=new T.Mesh(new T.BoxGeometry(14,7,22),pl);base.position.y=3.5;base.castShadow=true;
  const front=new T.Mesh(new T.PlaneGeometry(13.6,6),new T.MeshBasicMaterial({map:ctex('boxlbl',256,112,(g,w,h)=>{g.fillStyle='#2a2f37';g.fillRect(0,0,w,h);g.fillStyle='#9fb0c4';g.font=`40px ${FONT_M}`;g.textAlign='center';g.textBaseline='middle';g.fillText('MINIGAME',w/2,38);g.fillText('DISKS',w/2,78)})}));
  front.position.set(7.05,3.5,0);front.rotation.y=Math.PI/2;
  const lid=new T.Mesh(new T.BoxGeometry(14,.4,22),new T.MeshStandardMaterial({color:new T.Color('#bcd4ee').convertSRGBToLinear(),transparent:true,opacity:.22,roughness:.1}));lid.position.set(-7,13,0);lid.rotation.z=1.25;
  const ids=Object.keys(MG);for(let k=0;k<12;k++){const id=ids[k%ids.length];const f=new T.Mesh(new T.BoxGeometry(9,9.4,.34),mat(mgLook(id)[1]));f.rotation.y=Math.PI/2;f.position.set(0,7+((k*7)%3)*.4,-9+k*1.6);dbox.add(f)}
  dbox.add(base,front,lid);dbox.position.set(BOX.x,TY-30,BOX.z);dbox.rotation.y=-0.35;dbox.visible=false;dbox.userData={ty:TY-30};scene.add(dbox)}
function boxUp(up){dbox.userData.ty=up?TY:TY-30;if(up)dbox.visible=true}

/* ---------------- 미니게임 주사위 ---------------- */
let die,dieState={v:1,spin:0,shown:false};
function buildDie(){die=makeDie();die.position.set(DIE.x,TY-10,DIE.z);die.visible=false;scene.add(die);setPick(die,{kind:'die'})}

/* ---------------- 카메라 ---------------- */
const SHOTS={
  seat:{p:V(0,150,128),l:V(0,66,-24),fov:52},
  top:{p:V(0,250,34),l:V(0,TY,6),fov:40},
  monitor:{p:V(MON.x,TY+30,MON.z+70),l:V(MON.x,TY+22,MON.z+14),fov:42},
  zoom:{p:V(MON.x,TY+26,MON.z+30),l:V(MON.x,TY+26,MON.z+15.8),fov:42},
  reward:{p:V(0,150,82),l:V(0,TY,8),fov:48},
};
const camS={p:V(0,150,128),l:V(0,66,-24),fov:52,shot:'seat',speed:2.6};
let yaw=0,pitch=0;
/* 마우스가 있는 웹: 시선이 커서를 따라간다(끌 필요 없음). 터치 기기는 끌어서 둘러보기 */
const MOUSE_LOOK=!!(window.matchMedia&&matchMedia('(hover: hover) and (pointer: fine)').matches);
let lookT={yaw:0,pitch:0};
function cursorLook(x,y){const nx=x/W*2-1,ny=y/H*2-1;const dz=(v,e)=>Math.sign(v)*Math.max(0,Math.abs(v)-e)/(1-e);
  lookT.yaw=dz(nx,.72)*0.75;lookT.pitch=ny<0?-dz(ny,.75)*0.3:0}
/* FPS 시점: 남의 차례(메인 턴)에만 마우스를 잠근다 */
let locked=false,fpsOK=false,lockFailed=false;
function canLock(){return MOUSE_LOOK&&!lockFailed&&!!canvas.requestPointerLock}
function setFps(ok){fpsOK=ok&&canLock();if(!fpsOK&&locked){locked=false;try{document.exitPointerLock()}catch(e){}}UI.fpsHint(fpsOK,locked)}
function tryLock(){if(!fpsOK||locked)return;try{const r=canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{lockFailed=true;setFps(false)})}catch(e){lockFailed=true;setFps(false)}}
function shot(name,speed=2.6){camS.shot=name;camS.speed=speed}
function stepCam(dt){const s=SHOTS[camS.shot];const a=window.__fast?1:1-Math.exp(-dt*camS.speed);
  let look=s.l.clone();
  if(MOUSE_LOOK&&camS.shot==='seat'&&!locked){const k=1-Math.exp(-dt*4);yaw+=(lookT.yaw-yaw)*k;pitch+=(lookT.pitch-pitch)*k}
  if(camS.shot==='seat'&&(yaw||pitch)){const d=s.l.clone().sub(s.p);const r=d.length();let th=Math.atan2(d.x,-d.z)+yaw;let ph=Math.asin(d.y/r)+pitch;ph=Math.max(-1.25,Math.min(.55,ph));
    look=s.p.clone().add(V(Math.sin(th)*Math.cos(ph)*r,Math.sin(ph)*r,-Math.cos(th)*Math.cos(ph)*r))}
  camS.p.lerp(s.p,a);camS.l.lerp(look,a);camS.fov+=(s.fov-camS.fov)*a;
  camera.position.copy(camS.p);camera.lookAt(camS.l);if(Math.abs(camera.fov-camS.fov)>.01){camera.fov=camS.fov;camera.updateProjectionMatrix()}}

/* ---------------- 입력: 끌어서 둘러보기, 눌러서 고르기 ---------------- */
let down=null,hover=null;const ray=new T.Raycaster(),mv=new T.Vector2();
function pickAt(x,y){const r=canvas.getBoundingClientRect();mv.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(mv,camera);
  const hits=ray.intersectObjects([...picks],true);for(const h of hits){let o=h.object;while(o&&!o.userData.pick)o=o.parent;if(o&&o.visible!==false&&Main.canPick(o.userData.pick))return o}return null}
function bindInput(){
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,yaw,pitch,moved:false};canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(down){const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>6)down.moved=true;
      if(down.moved&&camS.shot==='seat'&&!MOUSE_LOOK){yaw=down.yaw+dx*0.004;pitch=down.pitch-dy*0.003;yaw=Math.max(-1.6,Math.min(1.6,yaw));pitch=Math.max(-.5,Math.min(.6,pitch))}return}
    const o=pickAt(e.clientX,e.clientY);if(o!==hover){setHover(o)}});
  canvas.addEventListener('pointerup',e=>{const d=down;down=null;if(!d||d.moved)return;
    if(locked){const o=pickAt(W/2,H/2);if(o)Main.pick(o.userData.pick);return}
    if(fpsOK){tryLock();return}
    const o=pickAt(e.clientX,e.clientY);if(o)Main.pick(o.userData.pick)});
  document.addEventListener('pointerlockchange',()=>{const was=locked;locked=document.pointerLockElement===canvas;
    if(locked){yaw=yaw;}else if(was&&!fpsOK){resetLook()}UI.fpsHint(fpsOK,locked)});
  document.addEventListener('pointerlockerror',()=>{lockFailed=true;setFps(false)});
  document.addEventListener('mousemove',e=>{if(!locked)return;yaw+=e.movementX*0.0024;pitch-=e.movementY*0.002;
    if(yaw>Math.PI)yaw-=2*Math.PI;if(yaw<-Math.PI)yaw+=2*Math.PI;pitch=Math.max(-.9,Math.min(.6,pitch))});
  canvas.addEventListener('pointerleave',()=>setHover(null));
  if(MOUSE_LOOK){window.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!locked)cursorLook(e.clientX,e.clientY)});
    document.addEventListener('mouseleave',()=>{lookT.yaw=0;lookT.pitch=0});window.addEventListener('blur',()=>{lookT.yaw=0;lookT.pitch=0})}
  canvas.addEventListener('dblclick',()=>resetLook());
}
function setHover(o){if(hover)glow(hover,false);hover=o;if(o)glow(o,true);canvas.style.cursor=o?'pointer':(MOUSE_LOOK?'default':'grab')}
function glow(o,on){o.traverse(m=>{if(m.isMesh&&m.material&&!Array.isArray(m.material)&&m.material.emissive){if(on){m.userData.em=m.material.emissive.getHex();m.material=m.material.clone();m.material.emissive.set('#5a4612')}else if(m.userData.em!=null){m.material.emissive.setHex(m.userData.em)}}})}
function resetLook(){yaw=0;pitch=0;lookT.yaw=0;lookT.pitch=0}

/* ---------------- 배치 (상태 → 목표) ---------------- */
const yHat=V(0,1,0);
function onTable(x,z,h=0){return V(x,TY+.1+h,z)}
let flop={round:null,ids:[],mode:{},chosen:null,introDone:false};
function layout(){if(!S||!S.seats)return;
  const phase=S.phase;const n=S.seats.length;const vs=viewSeat();
  if(phase==='lobby'){sweep();return}
  // 덱
  const dn=S.deck?S.deck.length:0;
  want('deck',()=>{const g=new T.Group();const box=new T.Mesh(new T.BoxGeometry(CARD_W,1,CARD_H),[mat('#e8dfcf'),mat('#e8dfcf'),new T.MeshStandardMaterial({map:backTex()}),mat('#e8dfcf'),mat('#e8dfcf'),mat('#e8dfcf')]);box.castShadow=true;g.add(box);g.userData.box=box;return g},
    onTable(-38,-14),[0,.3,0],1,{pick:{kind:'deck'}});
  const de=pool.get('deck');const hgt=Math.max(.2,dn*.035);de.obj.userData.box.scale.y=hgt;de.obj.userData.box.position.y=hgt/2;
  // 버림 줄
  const gather=['roll','clubs','mg','reward'].includes(phase);
  const row=S.row||[];const sp=Math.min(7.2,92/Math.max(1,row.length));
  row.forEach((c,k)=>{const key='c:'+c;const from=lastSeatPos();
    const pos=gather?onTable(40,-16,k*.04):onTable((k-(row.length-1)/2)*sp,2,k*.02);const yawr=gather?.15+((k*37)%9-4)*.02:0;
    want(key,()=>makeCard(c),pos,[-Math.PI/2,0,yawr],1,{from:from&&V(from.x*.6,TY+30,from.z*.6),lift:8,pick:!gather?{kind:'row',c}:null})});
  // 자리별 토큰과 앞에 놓인 아이템
  S.seats.forEach((p,i)=>{const sp_=seatPos(i);const ux=Math.sin(sp_.phi),uz=Math.cos(sp_.phi),tx=Math.cos(sp_.phi),tz=-Math.sin(sp_.phi);
    (p.tokens||[]).forEach((t,k)=>{const o=(k-(p.tokens.length-1)/2)*3.2;want(`t:${i}:${k}`,()=>makeCube(t),onTable(ux*52+tx*o,uz*52+tz*o,1.1),[0,sp_.phi,0],1,{from:onTable(0,0,40),lift:10})});
    (p.front||[]).forEach((c,k)=>{const o=(k-(p.front.length-1)/2)*7+ (i===vs?-18:0);const r=i===vs?40:42;
      want('c:'+c,()=>makeCard(c),onTable(ux*r+tx*o,uz*r+tz*o,.05+k*.02),[-Math.PI/2,0,sp_.phi+Math.PI],0.85,{from:onTable(ux*80,uz*80,30),lift:6})});
    const av=avatars.get(i);if(av){setFan(av,(p.hand||[]).length);const inMG=phase==='mg'&&S.mg&&stations.has(S.mg.id);const key=inMG?S.mg.id:'main';if(av.userData.at!==key){av.userData.at=key;av.userData.hop=inMG?{p:stationSeat(S.mg.id,i),l:stLocal(S.mg.id,0,0,0)}:{p:V(sp_.x,0,sp_.z),l:V(0,0,0)};av.userData.hopT=0}const act=whoActs()===i&&phase!=='lobby';av.userData.ring.material.opacity=act?.85:0;}
  });
  // 보상 진열
  const disp=phase==='reward'?(S.reward?S.reward.disp:[]):(['roll','clubs','mg'].includes(phase)?(S.rewardDisp||[]):[]);
  const rsp=Math.min(7.4,104/Math.max(1,disp.length));
  disp.forEach((c,k)=>{const show=phase!=='roll'||flop.introDone;if(!show)return;
    want('c:'+c,()=>makeCard(c),onTable((k-(disp.length-1)/2)*rsp,phase==='mg'?-26:18,.05),[-Math.PI/2,0,0],phase==='mg'?.7:1,{from:onTable(-38,-14,1),lift:12,pick:phase==='reward'?{kind:'reward',c}:null})});
  // 미니게임 디스크
  layoutFloppies();
  if(phase==='mg')layoutMG();else if(lastMG){clearMG();lastMG=null}
  if(phase==='mg'&&S.mg)lastMG=S.mg.id;
  // 상자·모니터·주사위
  const drawPhase=phase==='roll'||phase==='clubs';
  boxUp(drawPhase&&!flop.boxGone);monitorUp(drawPhase);
  die.visible=drawPhase;
  // 테이블 위 가운데 해치
  hatch.scale.setScalar(drawPhase?1:.001);
  sweep();
}
let lastActorSeat=null,lastMG=null;function lastSeatPos(){if(lastActorSeat==null||!S.seats[lastActorSeat])return null;return seatPos(lastActorSeat)}
const SLOTX=k=>-27.5+k*11;
function layoutFloppies(){if(!S.board||!['roll','clubs'].includes(S.phase)){flop.round=null;return}
  if(flop.round!==S.round+'|'+S.board.join(',')){flop={round:S.round+'|'+S.board.join(','),ids:S.board.slice(),mode:{},chosen:null,introDone:false,boxGone:false};S.board.forEach((_,k)=>flop.mode[k]='box')}
  const bx=V(BOX.x,TY+6,BOX.z);
  flop.ids.forEach((id,k)=>{const m=flop.mode[k];let pos,eu=[0,0,0],sc=1,opt={speed:7};
    if(m==='box'){pos=bx.clone().add(V(0,0,-6+k*2));eu=[Math.PI/2,-0.35+Math.PI/2,0];sc=.001}
    else if(m==='pop'){pos=V(BOX.x+6,TY+26,BOX.z-6);eu=[-1.1,0,.4];sc=1.2;opt.speed=9}
    else if(m==='slot'){pos=onTable(SLOTX(k),-4,.2);eu=[0,0,((k*53)%7-3)*.03]}
    else if(m==='lift'){pos=onTable(SLOTX(k),-2,16);eu=[-.85,0,0];sc=1.35;opt.speed=6}
    else if(m==='away'){const sg=k<flop.chosen?-1:1;pos=onTable(sg*(78+Math.abs(k-flop.chosen)*7),-10+k*3,-6);eu=[0,(k%2?1:-1)*1.2,sg*.6];sc=.001;opt.speed=3.2}
    else if(m==='fly'){pos=SLOT_W().add(V(0,0,6));eu=[0,0,0];sc=.95;opt.speed=5}
    else if(m==='in'){pos=SLOT_W().add(V(0,0,-4));eu=[0,0,0];sc=.001;opt.speed=6}
    want('fl:'+k,()=>makeFloppy(id),pos,eu,sc,Object.assign(opt,{from:bx.clone().add(V(0,2,0)),fromScale:.2,pick:S.phase==='clubs'&&ui.mode==='clubK'&&m!=='in'?{kind:'slot',k:k+1}:null}))
    want('sn:'+k,()=>{const m_=new T.Mesh(new T.CircleGeometry(1.9,24),new T.MeshBasicMaterial({map:numTex(k+1)}));return m_},onTable(SLOTX(k),5.5,.06),[-Math.PI/2,0,0],flop.introDone?1:.001)});
}

/* ---------------- 연출 순서 (비동기, 새 상태가 오면 끊긴다) ---------------- */
let gen=0;const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function step(g,ms){await wait(ms);if(g!==gen)throw 'cut'}
function cut(){gen++}
async function playIntro(){const g=++gen;try{
  flop.introDone=false;setScreen({mode:'insert'});shot('top',1.8);layout();await step(g,700);
  flop.boxGone=false;layout();await step(g,500);
  for(let k=0;k<flop.ids.length;k++){flop.mode[k]='pop';layout();await step(g,260);flop.mode[k]='slot';layout();await step(g,180)}
  flop.introDone=true;layout();await step(g,400);flop.boxGone=true;layout();
}catch(e){if(e!=='cut')console.error(e)}}
function settleLined(){flop.introDone=true;flop.boxGone=true;flop.ids.forEach((_,k)=>flop.mode[k]='slot');layout()}
async function rollDie(v,g){die.visible=true;const e=dieEuler(v);
  const sp={t:0};die.position.set(DIE.x-14,TY+22,DIE.z+16);
  const t0=performance.now();while(performance.now()-t0<900){const t=(performance.now()-t0)/900;die.rotation.set(t*14,t*9,t*6);die.position.set(DIE.x-14+14*t,TY+22-20*t+Math.abs(Math.sin(t*9))*6*(1-t),DIE.z+16-16*t);await step(g,16)}
  die.position.set(DIE.x,TY+1.3,DIE.z);die.rotation.set(...e)}
async function playChoose(v,opt={}){const g=++gen;try{
  const k=v-1;if(!flop.ids.length)return;
  if(opt.restore){flop.ids.forEach((_,j)=>flop.mode[j]='slot');flop.chosen=null;layout()}
  shot('top',2);await step(g,opt.restore?900:300);
  if(opt.roll)await rollDie(v,g);await step(g,250);
  flop.chosen=k;flop.mode[k]='lift';flop.ids.forEach((_,j)=>{if(j!==k)flop.mode[j]='away'});layout();await step(g,1100);
  setScreen({mode:'insert'});shot('monitor',1.6);await step(g,700);
  flop.mode[k]='fly';layout();await step(g,700);flop.mode[k]='in';layout();await step(g,350);
  const name=MG[flop.ids[k]].name;for(let p=0;p<=1.001;p+=.2){setScreen({mode:'loading',name,p});await step(g,110)}
  shot('zoom',2.2);await step(g,900);
  Main.rulesReady();
}catch(e){if(e!=='cut')console.error(e)}}
function jumpChosen(v){const k=v-1;flop.chosen=k;flop.ids.forEach((_,j)=>flop.mode[j]=j===k?'in':'away');settleLined.call;flop.introDone=true;flop.boxGone=true;
  setScreen({mode:'loading',name:MG[flop.ids[k]].name,p:1});const e=dieEuler(v);die.position.set(DIE.x,TY+1.3,DIE.z);die.rotation.set(...e);layout()}
function alertScreen(){setScreen({mode:'alert'})}

/* ---------------- 이름표 위치 ---------------- */
function anchors(){const out=[];for(const [i,a] of avatars){const p=a.localToWorld(V(0,64,30));const q=p.clone().project(camera);
  out.push({i,x:(q.x*.5+.5)*W,y:(-q.y*.5+.5)*H,vis:q.z<1&&q.z>-1})}return out}
function worldToScreen(v){const q=v.clone().project(camera);return {x:(q.x*.5+.5)*W,y:(-q.y*.5+.5)*H}}
function deckScreen(){return worldToScreen(onTable(-38,-14,2))}

/* ---------------- 루프 ---------------- */
function resize(){W=window.innerWidth;H=window.innerHeight;dpr=Math.min(2,window.devicePixelRatio||1);renderer.setPixelRatio(dpr);renderer.setSize(W,H,false);camera.aspect=W/H;
  // 좁은 화면: 조금 더 물러나 테이블이 들어오게
  const narrow=W/H<1.1;SHOTS.seat.p.set(0,narrow?190:150,narrow?170:128);SHOTS.top.p.set(0,narrow?330:250,narrow?44:34);SHOTS.reward.p.set(0,narrow?190:150,narrow?110:82);
  camera.updateProjectionMatrix()}
function frame(){const now=performance.now();const dt=Math.min(.12,(now-lastT)/1000);lastT=now;const t=(now-clockT0)/1000;
  stepPool(dt);stepCam(dt);tickMG(dt,t);
  for(const [,a] of avatars){const h=a.userData.hop;if(!h)continue;a.userData.hopT+=dt;const T_=a.userData.hopT;
    if(T_<.3)a.scale.setScalar(Math.max(.01,1-T_/.3));else{if(!h.done){h.done=true;a.position.copy(h.p);a.lookAt(h.l.x,0,h.l.z)}a.scale.setScalar(Math.min(1,(T_-.3)/.35));if(T_>.65){a.scale.setScalar(1);a.userData.hop=null}}}
  for(const [i,a] of avatars){const h=a.userData.head;h.rotation.y=Math.sin(t*.6+i)*.12;h.position.y=104+Math.sin(t*1.4+i*2)*.4;a.userData.torso.scale.x=1+Math.sin(t*1.4+i*2)*.01;
    const r=a.userData.ring;if(r.material.opacity>0)r.scale.setScalar(1+Math.sin(t*3)*.04)}
  for(const o of [monitor,dbox]){if(!o)continue;o.position.y+=(o.userData.ty-o.position.y)*(1-Math.exp(-dt*4));if(o.position.y<o.userData.ty+0.01&&o.userData.ty<TY-1&&Math.abs(o.position.y-o.userData.ty)<.5)o.visible=false}
  if(die.visible&&S&&S.phase==='roll'){die.position.y=TY+1.3+Math.abs(Math.sin(t*2.4))*1.5;die.rotation.y=t*.8}
  renderer.render(scene,camera);UI.placePlates();requestAnimationFrame(frame)}

function init(cv){canvas=cv;
  renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputEncoding=T.sRGBEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  scene=new T.Scene();camera=new T.PerspectiveCamera(50,1,1,4000);
  buildRoom();buildHall();buildStations();buildMonitor();buildBox();buildDie();
  mgSpot=new T.SpotLight('#ffe4bf',0,0,.6,.5,1);scene.add(mgSpot,mgSpot.target);bindInput();resize();window.addEventListener('resize',resize);
  requestAnimationFrame(frame)}

function sync(){if(!S)return;if(S.seats&&S.phase!=='lobby')buildSeats();else{for(const [,a] of avatars)scene.remove(a);avatars.clear();seatKey=''}
  if(S.phase==='main'&&S.turn)lastActorSeat=S.turn.seat;layout()}

function goStation(id){if(!stations.has(id))return false;stationShot(id);shot('station',1.4);return true}
function lightsMain(){if(mgSpot)mgSpot.intensity=0}
function seatAt(x,y){const r=canvas.getBoundingClientRect();mv.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(mv,camera);
  for(const h of ray.intersectObjects([...avatars.values()],true)){let o=h.object;while(o&&!(o.userData.pick&&o.userData.pick.kind==='seat'))o=o.parent;if(o)return o.userData.pick.i}return null}
return {seatAt,setFps,isLocked:()=>locked,init,sync,shot,goStation,lightsMain,resetLook,playIntro,playChoose,settleLined,jumpChosen,alertScreen,setScreen,anchors,worldToScreen,deckScreen,cut,flop:()=>flop,get camShot(){return camS.shot}};
})();

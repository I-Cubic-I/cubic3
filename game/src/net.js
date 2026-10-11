/* ================= 공유 상태 연결 (artifact db) ================= */
let db=null,user=null,me=null,REF=null,S=null,names={};
let ctl=null;                 // 지금 조작하는 자리
const sel=new Set();          // 고른 손패
let ui={};                    // 임시 화면 상태
let busy=false,lastKey='';
const TAB=Math.random().toString(36).slice(2,9);
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const clone=o=>JSON.parse(JSON.stringify(o));
const SEATCOL=['#2f5fc8','#d3302f','#e0b100','#2e9450','#8a5cc8'];
const SUITCOL={S:'#2f5fc8',H:'#d3302f',D:'#e0b100',C:'#2e9450'};

function seatName(i){const p=S&&S.seats[i];if(!p)return '';const nm=(names[p.uid]&&names[p.uid].name)||'';
  const dup=S.seats.filter(q=>q.uid===p.uid).length>1;return `${nm||'플레이어'}${dup||!nm?` ${i+1}`:''}`}
const mine=i=>!!(S&&S.seats[i]&&S.seats[i].uid===me);
const mySeats=()=>S?(S.seats||[]).map((_,i)=>i).filter(mine):[];

async function act(fn){
  if(busy)return;busy=true;
  try{
    let ok=false;
    for(let t=0;t<15&&!ok;t++){const r=await REF.acquire({holder:me+':'+TAB,ttlMs:1500});
      if(r.acquired)ok=true;else await new Promise(z=>setTimeout(z,150+Math.random()*200))}
    if(!ok){flash('다른 사람이 처리 중이에요. 잠시 뒤 다시 눌러 주세요.');return}
    const snap=await REF.get();const st=snap.exists?clone(snap.data()):newLobby();
    const res=fn(st);if(res===false)return;
    st.v=(st.v||0)+1;await REF.set(st);
  }catch(e){console.error(e);flash(e&&e.code==='invalid_argument'?'이 테이블을 바꿀 권한이 없어요. 공유 메뉴에서 편집자로 초대받아야 해요.':'저장하지 못했어요. 다시 시도해 주세요.')}
  finally{busy=false}
}
let flashMsg='';function flash(m){flashMsg=m;UI.render();setTimeout(()=>{if(flashMsg===m){flashMsg='';UI.render()}},4000)}

function whoActs(){
  if(!S||!S.phase)return null;
  if(S.phase==='roll')return S.first;
  if(S.phase==='clubs'){const need=S.seats.map((_,k)=>k).filter(k=>!(S.ready||{})[k]);return need.find(mine)??need[0]??null}
  if(S.phase==='main')return S.turn&&S.turn.seat;
  if(S.phase==='defense')return S.pending.target;
  if(S.phase==='reward')return S.reward.order[S.reward.pi];
  if(S.phase==='mg'){const m=S.mg;const pickOne=need=>need.find(mine)??need[0]??null;
    if(m.id==='hold')return m.ord[m.ci];
    if(m.id==='bomb')return m.alive[m.ci];
    if(m.id==='auction')return pickOne(S.seats.map((_,i)=>i).filter(i=>m.step==='pre'?!m.ready[i]:!(i in m.bids)));
    if(m.id==='balloon')return m.alive[m.ci];
    if(m.id==='rps'||m.id==='vault'){if(m.step==='save')return pickOne(m.saveq);if(m.step==='guard')return m.lead;
      return pickOne((m.id==='rps'?[m.lead,...m.alive]:m.alive).filter(j=>!m.picks[j]))}
    if(m.id==='count'){if(Date.now()<countOpenAt(m))return null;return pickOne(Object.keys(m.hits).map(Number).filter(k=>!(k in m.ans)))}
    if(m.id==='race')return m.step==='bet'?m.order[m.pi]:S.first}
  return null;
}
function autoCtl(){
  const ms=mySeats();if(!ms.length){ctl=null;return}
  const a=whoActs();
  if(a!=null&&mine(a))ctl=a;else if(ctl==null||!mine(ctl))ctl=ms[0];
}
/* 화면 기준 자리: 내가 앉은 첫 자리(관전이면 0) */
function viewSeat(){const ms=mySeats();if(!ms.length)return 0;return ctl!=null&&ms.includes(ctl)?ctl:ms[0]}

let P2PMODE=false,myDisplayName='';
async function boot(){
  if(!(window.claude&&claude.use)){return bootP2P()}
  try{[db,user]=await Promise.all([claude.use('db'),claude.use('user')])}catch(e){}
  if(!db||!user){UI.fatal('공유 테이블에 연결할 수 없어요. claude.ai에 로그인한 상태에서 이 페이지를 열어 주세요.');return}
  me=await user.id();
  if(!me){UI.fatal('로그인 정보를 확인할 수 없어 자리에 앉을 수 없어요.');return}
  REF=db.doc('games/table');listen()}
async function bootP2P(){P2PMODE=true;
  try{const c=await P2P.connect();REF=c.REF;me=c.me;myDisplayName=c.name;UI.room(c)}catch(e){UI.fatal(e.message||'연결하지 못했어요.');return}
  listen()}
function listen(){
  REF.onSnapshot(async snap=>{
    S=snap.exists?snap.data():newLobby();
    const ids=[...new Set((S.seats||[]).map(p=>p.uid))];
    if(P2PMODE)names=Object.fromEntries(Object.entries(S.names||{}).map(([k,v])=>[k,{name:v}]));else{try{names=await user.profiles(ids)}catch(e){}}
    const key=S.phase+'|'+(S.turn?S.turn.seat+':'+S.ti:'')+'|'+(S.mg?S.mg.id+(S.mg.ci||0)+(S.mg.step||'')+(S.mg.round||'')+(S.mg.pan||''):'')+'|'+S.round;
    if(key!==lastKey){sel.clear();ui={};lastKey=key}
    autoCtl();Main.onState();
  },e=>UI.fatal('연결이 끊겼어요. 새로고침해 주세요.'));
  setInterval(()=>{if(!S)return;
    const dl=S.phase==='clubs'?S.deadline:S.phase==='defense'&&S.pending?S.pending.deadline:null;
    const counting=S.phase==='mg'&&S.mg&&S.mg.id==='count'&&Date.now()<countOpenAt(S.mg)+400;
    if(dl||counting){autoCtl();UI.render()}
    if(dl&&Date.now()>=dl+300&&S.seats.some(p=>p.uid===me)&&!busy)act(st=>advanceTimers(st)?undefined:false)
  },250);
}

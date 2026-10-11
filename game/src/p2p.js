/* ================= P2P 방 (GitHub Pages판) =================
   방을 만든 사람(방장)의 브라우저가 테이블 상태를 들고 있고, 다른 사람은 방장에게 직접 연결한다.
   기존 공유 저장소와 같은 모양(acquire/get/set/onSnapshot)을 흉내 내서, 게임 코드는 그대로 쓴다.
   연결 중개: PeerJS 공개 서버. 같은 브라우저 시험용으로 ?local=1 이면 BroadcastChannel을 쓴다. */
const P2P=(()=>{
const PREFIX='cubicparty-v1-';
const LS={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
const rid=n=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<n;i++)s+=a[Math.floor(Math.random()*a.length)];return s};
let localUid=null;
function myId(){if(new URLSearchParams(location.search).get('local')==='1')return localUid||(localUid='p_'+rid(12));let u=LS.get('cp-uid');if(!u){u='p_'+rid(12);LS.set('cp-uid',u)}return u}
function myName(){return LS.get('cp-name')||''}

/* ---------- 연결 계층 ---------- */
// host: start(code, {onJoin(cid), onMsg(cid,msg), onLeave(cid)}) → {send(cid,msg), broadcast(msg)}
// client: join(code, {onMsg(msg), onClose()}) → {send(msg)}
const LocalNet={
  host(code,h){const ch=new BroadcastChannel('cp-'+code);const peers=new Set();
    ch.onmessage=e=>{const m=e.data;if(m.to!=='host')return;if(m.hello){peers.add(m.from);h.onJoin(m.from);return}h.onMsg(m.from,m.msg)};
    return Promise.resolve({send:(cid,msg)=>ch.postMessage({to:cid,msg}),broadcast:msg=>peers.forEach(cid=>ch.postMessage({to:cid,msg}))})},
  join(code,h){const ch=new BroadcastChannel('cp-'+code);const me='c_'+rid(8);
    ch.onmessage=e=>{const m=e.data;if(m.to===me)h.onMsg(m.msg)};ch.postMessage({to:'host',from:me,hello:1});
    return Promise.resolve({send:msg=>ch.postMessage({to:'host',from:me,msg})})}};
const PeerNet={
  host(code,h){return new Promise((res,rej)=>{const peer=new Peer(PREFIX+code);const conns=new Map();
    peer.on('open',()=>res({send:(cid,msg)=>{const c=conns.get(cid);if(c&&c.open)c.send(msg)},broadcast:msg=>conns.forEach(c=>{if(c.open)c.send(msg)})}));
    peer.on('error',e=>rej(e));
    peer.on('connection',c=>{c.on('open',()=>{conns.set(c.peer,c);h.onJoin(c.peer)});c.on('data',m=>h.onMsg(c.peer,m));c.on('close',()=>{conns.delete(c.peer);h.onLeave&&h.onLeave(c.peer)})});
    peer.on('disconnected',()=>{try{peer.reconnect()}catch(e){}})})},
  join(code,h){return new Promise((res,rej)=>{const peer=new Peer();let done=false;
    peer.on('error',e=>{if(!done)rej(e);else h.onClose&&h.onClose(e)});
    peer.on('open',()=>{const c=peer.connect(PREFIX+code,{reliable:true});
      const to=setTimeout(()=>{if(!done)rej({type:'timeout'})},12000);
      c.on('open',()=>{done=true;clearTimeout(to);res({send:m=>{if(c.open)c.send(m)}})});c.on('data',m=>h.onMsg(m));c.on('close',()=>h.onClose&&h.onClose())})})}};

/* ---------- 방장: 테이블 상태와 잠금 ---------- */
function makeHost(code,net,H){let state=null,lock=null;const subs=[];
  const saved=LS.get('cp-host-'+code);if(saved){try{state=JSON.parse(saved)}catch(e){}}
  const snap=()=>({exists:!!state,data:()=>JSON.parse(JSON.stringify(state))});
  const free=holder=>!lock||lock.until<Date.now()||lock.holder===holder;
  const handle=(m,reply)=>{
    if(m.t==='acq'){const ok=free(m.holder);if(ok)lock={holder:m.holder,until:Date.now()+(m.ttl||1500)};reply({t:'r',id:m.id,ok})}
    else if(m.t==='get')reply({t:'r',id:m.id,data:state});
    else if(m.t==='set'){if(lock&&lock.holder!==m.holder&&lock.until>Date.now()){reply({t:'r',id:m.id,err:'locked'});return}
      state=m.data;lock=null;LS.set('cp-host-'+code,JSON.stringify(state));reply({t:'r',id:m.id,ok:true});push()}
    else if(m.t==='time')reply({t:'r',id:m.id,now:Date.now()})};
  const push=()=>{subs.forEach(f=>setTimeout(()=>f(snap()),0));net.broadcast({t:'snap',data:state})};
  H.onJoin=cid=>net.send(cid,{t:'snap',data:state});
  H.onMsg=(cid,m)=>handle(m,r=>net.send(cid,r));
  return {acquire:async o=>({acquired:free(o.holder)&&(lock={holder:o.holder,until:Date.now()+(o.ttlMs||1500)},true)}),
    get:async()=>snap(),set:async d=>{state=JSON.parse(JSON.stringify(d));lock=null;LS.set('cp-host-'+code,JSON.stringify(state));push()},
    onSnapshot:(f)=>{subs.push(f);setTimeout(()=>f(snap()),0)}}}

/* ---------- 참가자: 방장에게 물어본다 ---------- */
function makeClient(conn){let seq=0;const wait=new Map();const subs=[];let last=null,got=false;
  const ask=m=>new Promise((res,rej)=>{const id=++seq;m.id=id;wait.set(id,{res,rej});conn.send(m);setTimeout(()=>{if(wait.has(id)){wait.delete(id);rej({code:'timeout'})}},6000)});
  const onMsg=m=>{if(m.t==='snap'){last=m.data;got=true;subs.forEach(f=>f({exists:!!m.data,data:()=>JSON.parse(JSON.stringify(m.data))}))}
    else if(m.t==='r'&&wait.has(m.id)){const w=wait.get(m.id);wait.delete(m.id);w.res(m)}};
  return {onMsg,ref:{acquire:async o=>{const r=await ask({t:'acq',holder:o.holder,ttl:o.ttlMs});return {acquired:!!r.ok}},
    get:async()=>{const r=await ask({t:'get'});return {exists:!!r.data,data:()=>JSON.parse(JSON.stringify(r.data))}},
    set:async d=>{const r=await ask({t:'set',data:d,holder:me+':'+TAB});if(r.err)throw {code:'locked'}},
    onSnapshot:f=>{subs.push(f);if(got)setTimeout(()=>f({exists:!!last,data:()=>JSON.parse(JSON.stringify(last))}),0)}},
    timeSync:async()=>{const t0=Date.now();const r=await ask({t:'time'});const t1=Date.now();return r.now+(t1-t0)/2-t1}}}

/* ---------- 시작 화면 ---------- */
function screen(html){let el=document.getElementById('p2pstart');if(!el){el=document.createElement('div');el.id='p2pstart';el.className='p2pstart';document.body.appendChild(el)}el.innerHTML=html;return el}
function closeScreen(){const el=document.getElementById('p2pstart');if(el)el.remove()}
function startUI(msg0){return new Promise(resolve=>{
  const q=new URLSearchParams(location.search);const code=(q.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const draw=(msg)=>{const el=screen(`<div class="panel lobby"><h1>Cubic³</h1>
    <p>방을 만들면 링크가 생겨요. 친구에게 링크를 보내면 같은 테이블에 앉을 수 있어요.</p>
    <label class="fld"><span>내 이름</span><input id="p2pname" maxlength="12" value="${esc(myName())}" placeholder="이름" autocomplete="nickname"></label>
    ${msg?`<div class="notice" style="position:static;transform:none;margin:8px 0">${esc(msg)}</div>`:''}
    <div class="btnrow" style="margin-top:12px">${code?`<button class="btn primary" data-p="join">${esc(code)} 방 들어가기</button><button class="btn" data-p="new">새 방 만들기</button>`:`<button class="btn primary" data-p="new">방 만들기</button>`}</div>
    ${code?'':`<div class="btnrow" style="margin-top:10px"><input id="p2pcode" maxlength="6" placeholder="방 코드" style="width:120px;text-transform:uppercase"><button class="btn" data-p="joincode">들어가기</button></div>`}
    <p style="margin-top:14px;font-size:12px">방을 만든 사람의 브라우저가 테이블을 들고 있어요. 방장이 창을 닫으면 게임이 멈추고, 다시 열면 이어서 할 수 있어요.</p></div>`);
    el.onclick=e=>{const b=e.target.closest('[data-p]');if(!b)return;const nm=(document.getElementById('p2pname').value||'').trim();
      if(!nm){draw('이름을 적어 주세요');return}LS.set('cp-name',nm);
      if(b.dataset.p==='new')resolve({host:true,code:rid(5)});
      if(b.dataset.p==='join')resolve({host:!!LS.get('cp-host-'+code)&&LS.get('cp-hosting')===code,code});
      if(b.dataset.p==='joincode'){const c=(document.getElementById('p2pcode').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!c){draw('방 코드를 적어 주세요');return}resolve({host:false,code:c})}}};
  draw(msg0)})}

/* ---------- 연결해서 REF·me·이름 돌려주기 ---------- */
async function connect(){const useLocal=new URLSearchParams(location.search).get('local')==='1';const NET=useLocal?LocalNet:PeerNet;
  if(!useLocal&&typeof Peer==='undefined')throw new Error('연결 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  let msg='';for(;;){const pick=await startUI(msg);msg='';screen(`<div class="panel lobby"><h1>Cubic³</h1><p>${pick.host?'방을 여는 중…':'방에 연결하는 중…'}</p></div>`);
    try{let REF_,role;
      if(pick.host){const H={};const net=await NET.host(pick.code,{onJoin:c=>H.onJoin&&H.onJoin(c),onMsg:(c,m)=>H.onMsg&&H.onMsg(c,m),onLeave:()=>{}});
        REF_=makeHost(pick.code,net,H);role='host';LS.set('cp-hosting',pick.code)}
      else{let cl;const conn=await NET.join(pick.code,{onMsg:m=>cl&&cl.onMsg(m),onClose:()=>UI.fatal('방장과 연결이 끊겼어요. 방장이 창을 닫았을 수 있어요. 새로고침해서 다시 들어와 주세요.')});
        cl=makeClient(conn);REF_=cl.ref;role='client';try{const off=await cl.timeSync();if(Math.abs(off)>50){const _now=Date.now.bind(Date);Date.now=()=>_now()+off}}catch(e){}}
      const u=new URL(location.href);u.searchParams.set('room',pick.code);history.replaceState(null,'',u);
      closeScreen();return {REF:REF_,me:myId(),role,code:pick.code,name:myName()}}
    catch(e){console.error(e);const t=e&&e.type;
      const m_=t==='unavailable-id'?'그 방 코드는 이미 쓰이고 있어요. 새 방을 만들어 주세요.':t==='peer-unavailable'||t==='timeout'?'방을 찾지 못했어요. 코드를 확인하거나, 방장이 창을 열어 두었는지 확인해 주세요.':t==='network'||t==='server-error'||t==='socket-error'?'연결 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.':'연결하지 못했어요. 다시 시도해 주세요.';
      if(pick.host)LS.set('cp-hosting','');msg=m_}}}
return {connect,myName};
})();

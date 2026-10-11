/* ================= 화면 위 UI와 흐름 연출 ================= */
const $=s=>document.querySelector(s);
const ICON={
  list:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
  top:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  eye:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/></svg>',
};
const SUITN={S:'♠',H:'♥',D:'♦',C:'♣'};
const mc=(c,o={})=>c?`<div class="mcard ${U(c)}${o.cls?' '+o.cls:''}" ${o.attr||''} ${/data-[ch]=/.test(o.attr||'')?'':`data-c="${c}"`} title="${isItem(c)?'':cname(c)}">${RL(R(c))}<small>${SYM[U(c)]}</small></div>`:`<div class="mcard back${o.cls?' '+o.cls:''}" ${o.attr||''}>?</div>`;
const nm=i=>esc(seatName(i));
const handSort=h=>h.slice().sort((a,b)=>(U(a)>U(b)?1:U(a)<U(b)?-1:R(a)-R(b)));
const selArr=()=>[...sel];

/* 아이템 효과 (RULES.md 능력표) */
const ITEM_FX={
 S11:['♠ 약탈','남의 손패에서 무작위 1장 뺏기','상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
 S12:['♠ 약탈','문양 하나를 지목해, 상대가 그 문양 숫자 카드를 가졌으면 1장 받기','상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
 S13:['♠ 약탈','남의 토큰 1개 뺏기 (내가 가진 색은 불가)','상대에게 끌어 놓기 · ♥J·♥K로 막힐 수 있음'],
 H11:['♥ 수호','♠ 공격 1회 막기','남의 턴, 내가 공격받을 때 써요'],
 H12:['♥ 수호','버림 줄에서 숫자 카드 2장 골라 가져오기','테이블로 끌어 놓기'],
 H13:['♥ 수호','♠ 공격을 막고 공격한 사람에게 그대로 되돌리기','남의 턴, 내가 공격받을 때 써요 · 되돌린 공격은 못 막아요'],
 D11:['♦ 거래','덱 위 3장을 보고 1장 갖기, 나머지 2장은 버림','테이블로 끌어 놓기'],
 D12:['♦ 거래','지금 비용만큼의 같은 문양 숫자 카드로 원하는 색 토큰 만들기','토큰 칸에 먼저 놓고, 숫자 카드를 이어서 놓기'],
 D13:['♦ 거래','이번 토큰 만들기 비용을 3장으로 (첫 토큰·연장전엔 효과 없음)','토큰 칸에 먼저 놓고, 숫자 카드를 이어서 놓기'],
 C11:['♣ 흐름','미니게임 주사위 다시 굴리기','규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
 C12:['♣ 흐름','미니게임 주사위 눈 ±1','규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
 C13:['♣ 흐름','미니게임 직접 고르기','규칙 설명 시간에 써요 · 이번 라운드에 아이템을 쓴 사람은 못 써요'],
};
function itemTip(c){const base=c.replace(/b$/,'');const f=ITEM_FX[base];if(!f)return null;
  let mgLine='';if(S&&S.phase==='mg'&&S.mg&&MG[S.mg.id]){const l=MG[S.mg.id].text.split('\n').find(x=>x.startsWith('아이템'));if(l)mgLine=l.slice(l.indexOf(':')+1).trim()}
  return `<div class="tt-h"><span class="tt-c ${U(base)}">${cname(base)}</span><span class="tt-k">${f[0]}</span></div>`+
   (mgLine?`<div class="tt-mg"><b>이번 미니게임</b> ${esc(mgLine)}</div><div class="tt-sub">메인 턴 효과: ${esc(f[1])}</div>`:`<div class="tt-b">${esc(f[1])}</div><div class="tt-sub">${esc(f[2])}</div>`)}
const UI=(()=>{
let hud,platesEl,mainEl,screenEl,cutEl,fxEl,toastEl;
let fatalMsg=null;
function init(){hud=$('#hud');hud.innerHTML=`<div id="plates"></div><div id="mainui"></div><div id="screen" class="screen" aria-live="polite"></div><div id="cutin" class="cutin"></div><div id="fxl"></div><div id="toast" class="toast" role="status"></div>`;
  platesEl=$('#plates');mainEl=$('#mainui');screenEl=$('#screen');cutEl=$('#cutin');fxEl=$('#fxl');toastEl=$('#toast');
  hud.addEventListener('click',onClick);hud.addEventListener('pointerdown',dragStart);window.addEventListener('pointermove',dragMove,{passive:false});window.addEventListener('pointerup',dragEnd);hud.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.hcard,.mcard.click')){e.preventDefault();e.target.click()}})}
function fatal(m){fatalMsg=m;mainEl.innerHTML=`<div class="panel lobby"><h1>큐빅 파티</h1><p>${esc(m)}</p></div>`}

/* ---------- 이름표 ---------- */
let plateHTMLKey='';
function renderPlates(){if(!S||S.phase==='lobby'){platesEl.innerHTML='';plateHTMLKey='';return}
  const actor=whoActs();const vs=viewSeat();const tgt=ui.mode==='target';
  const html=S.seats.map((p,i)=>{if(i===vs)return '';const out=S.mg&&S.mg.out&&S.mg.out.flat().includes(i);
    return `<div class="plate${actor===i?' turn':''}${out?' out':''}${tgt?' target':''}" data-plate="${i}" ${tgt?`data-a="tgt" data-t="${i}"`:''}><span class="dot" style="background:${SEATCOL[i%5]}"></span><strong>${nm(i)}</strong>${i===S.first?'<span style="color:var(--brass)">선</span>':''}<span style="color:var(--muted)">${p.hand.length}장</span><span class="toks">${(p.tokens||[]).map(t=>`<span class="tok ${t}"></span>`).join('')}</span></div>`}).join('');
  if(html!==plateHTMLKey){platesEl.innerHTML=html;plateHTMLKey=html}}
function placePlates(){if(!platesEl||!S||S.phase==='lobby')return;for(const a of SC.anchors()){const el=platesEl.querySelector(`[data-plate="${a.i}"]`);if(!el)continue;
  el.style.left=Math.max(70,Math.min(window.innerWidth-70,a.x))+'px';el.style.top=Math.max(60,a.y)+'px';el.style.display=a.vis?'flex':'none'}}

/* ---------- 손패 ---------- */
let seenHand=new Set();
function renderHand(i,tuck){if(i==null)return '';const h=handSort(S.seats[i].hand);const n=h.length;if(tuck)return '';
  const w=Math.min(860,window.innerWidth);const cw=window.innerWidth<=720?84:118;const step=n>1?Math.min(cw*.82,(w-cw-40)/(n-1)):0;
  const out=h.map((c,k)=>{const f=k-(n-1)/2;const isNew=!seenHand.has(c);const s=sel.has(c);
    return `<div class="hcard ${U(c)}${isItem(c)?' item':''}${s?' sel':''}${isNew?' new':''}" data-h="${c}" tabindex="0" role="button" aria-pressed="${s}" aria-label="${cname(c)}" style="left:${w/2-cw/2+f*step}px;transform:translateY(${(s?-26:0)+Math.abs(f)*5}px) rotate(${f*(n>7?3.5:5)}deg);z-index:${k+1}"><span class="rk">${RL(R(c))}</span><span class="su">${SYM[U(c)]}</span>${isItem(c)?'<span class="tg">아이템</span>':''}</div>`}).join('');
  seenHand=new Set(h);return `<div class="hand" aria-label="내 손패">${out}</div>`}

/* ---------- 메인 턴 조작 ---------- */
function turnActs(i){const t=S.turn,p=S.seats[i];const s=selArr();
  if(t.peek)return {pill:'♦J: 덱 위 카드 중 1장을 고르세요',center:`<div class="panel center-panel"><div class="line" style="text-align:center;margin-bottom:12px">나머지는 버림 줄로 갑니다</div><div class="mini-cards">${t.peek.map(c=>mc(c,{cls:'click',attr:`data-a="dj" data-c="${c}" tabindex="0" role="button"`})).join('')}</div></div>`};
  if(t.mustDiscard)return {pill:`${cname(t.justTook)}을 주웠어요 · 버릴 카드를 테이블로 끌어 놓으세요`,acts:s.length===1?`<button class="btn sm" data-a="pdisc">고른 카드 버리기</button>`:''};
  if(t.trim){const over=p.hand.length-6;return {pill:`손패가 6장을 넘어요 · ${over}장을 테이블로 끌어 버리세요`,acts:`<button class="btn primary" data-a="trim" ${s.length===over?'':'disabled'}>${s.length}/${over}장 버리고 턴 끝</button>`}}
  if(ui.mode==='target'){const it=ui.card;const others=S.seats.map((_,k)=>k).filter(k=>k!==i&&(ui.only==null||k===ui.only));let a='';
    if(R(it)===12)a+=`<div class="group">${SUITS.map(su=>`<button class="btn sm ${ui.suit===su?'primary':''}" data-a="tsuit" data-s="${su}">${SYM[su]} ${SNAME[su]}</button>`).join('')}</div>`;
    a+=`<div class="group">${others.map(k=>R(it)===13?S.seats[k].tokens.filter(c=>!p.tokens.includes(c)).map(c=>`<button class="btn sm" data-a="atk" data-t="${k}" data-s="${c}">${nm(k)} <span class="tok ${c}"></span></button>`).join(''):`<button class="btn sm" data-a="atk" data-t="${k}" ${R(it)===12&&!ui.suit?'disabled':''}>${nm(k)}</button>`).join('')}<button class="btn sm" data-a="cancel">취소</button></div>`;
    return {pill:`${cname(it)} · 공격할 사람을 고르세요${R(it)===12?' (받을 문양도)':''}`,acts:a}}
  if(ui.mode==='HQ')return {pill:'♥Q: 버림 줄에서 숫자 카드를 2장까지 누르세요',acts:`<button class="btn primary" data-a="hq">${[...(ui.hq||[])].length}장 가져오기</button><button class="btn" data-a="cancel">취소</button>`};
  if(ui.mode==='DQ')return {pill:'♦Q: 만들 토큰 색을 고르세요',acts:`<div class="group">${SUITS.filter(c=>S.supply[c]>0&&!p.tokens.includes(c)).map(c=>`<button class="btn sm" data-a="dqcol" data-s="${c}"><span class="tok ${c}"></span> ${SNAME[c]}</button>`).join('')}<button class="btn sm" data-a="cancel">취소</button></div>`};
  const tokErr=s.length?canMakeToken(S,i,s):'카드를 고르세요.';const one=s.length===1&&isItem(s[0])?s[0]:null;
  let a='';let note='';
  if(!t.picked)a+=`<button class="btn primary" data-a="pdeck">덱에서 줍기</button>`;
  if(!t.token){const cost=costFor(S,i);for(const su of SUITS){const nums=p.hand.filter(c=>U(c)===su&&!isItem(c)).sort((x,y)=>R(x)-R(y));
    if(nums.length>=cost&&!canMakeToken(S,i,nums.slice(0,cost)))a+=`<button class="btn" data-a="qtoken" data-s="${su}" style="border-color:${SUITCOL[su]}"><span class="tok ${su}"></span> ${SNAME[su]} 토큰 만들기 · ${cost}장</button>`}}
  if(s.length&&!one)a+=`<button class="btn" data-a="token" ${tokErr?'disabled':''}>고른 카드로 토큰</button>`;
  if(one&&!t.item){const su=U(one),r=R(one);
    if(su==='S'||(su==='H'&&r===12)||(su==='D'&&r===11))a+=`<button class="btn" data-a="item">${cname(one)} 쓰기</button>`;
    else note=`${cname(one)}: ${su==='H'?'남의 공격을 막을 때 써요.':su==='C'?'미니게임을 정할 때 써요.':'토큰 만들 카드와 함께 고르세요.'}`}
  if(s.length&&tokErr&&!one)note=tokErr;
  a+=`<button class="btn ${t.picked?'primary':''}" data-a="end" ${t.picked?'':'disabled'}>턴 끝내기</button>`;
  return {pill:t.picked?'카드를 끌어 토큰 칸에 놓으면 토큰, 상대에게 놓으면 공격':'테이블의 덱이나 버림 줄 카드를 눌러 주우세요',sub:[[t.picked?'줍기 완료':'줍기','pick',!t.picked],[`아이템 ${t.item?1:0}/1`,'',false],[`토큰 ${t.token?1:0}/1 · 다음 ${costFor(S,i)}장`,'',false]],acts:a,note:note||''}}

/* ---------- 미니게임 HUD ---------- */
function mgPanel(){const m=S.mg,def=MG[m.id];const i=ctl;let body='';const s=selArr();const selItem=s.length===1&&isItem(s[0])?s[0]:null;
  const itemHint=selItem?` (${cname(selItem)})`:'';
  if(m.id==='hold'){const who=m.ord[m.ci];
    body=`<div class="line">${m.pan}/3판 · <strong>${nm(who)}</strong> 차례 · 이번 판 <strong>${m.s}점</strong> · 다음 굴림 <strong>${m.k+1} 이하</strong>면 잃음</div>
     <div class="chips">${m.ord.map(k=>`<span class="chip ${k===who?'on':''}">${nm(k)} ${m.tot[k]}점</span>`).join('')}</div>
     ${who===i?`<div class="bigbtns"><button class="btn primary" data-a="hroll">굴리기</button><button class="btn" data-a="hroll2" ${selItem?'':'disabled'}>아이템 내고 굴리기${itemHint}</button><button class="btn" data-a="hstop" ${m.k?'':'disabled'}>멈추기</button></div>`:''}`}
  if(m.id==='bomb'){const who=m.alive[m.ci];
    body=`<div class="line"><strong>${nm(who)}</strong> 차례 · 가장 높은 카드를 뒤집은 사람이 탈락</div>
     ${who===i?'<div class="line">테이블의 카드 1장을 눌러 뒤집으세요</div>':''}
     <div class="chips">${m.alive.map(k=>`<span class="chip ${k===who?'on':''}">${nm(k)}${m.alive.length===2?` 폭탄 ${(m.hits&&m.hits[k])||0}/2`:''}</span>`).join('')}${m.out.flat().map(k=>`<span class="chip out">${nm(k)}</span>`).join('')}</div>
     ${who===i&&!m.arm[i]?`<div class="bigbtns"><button class="btn" data-a="barm" ${selItem?'':'disabled'}>아이템 내기 (-3)${itemHint}</button></div>`:''}`}
  if(m.id==='auction'){const sc=Object.keys(m.won).map(k=>`<span class="chip">${nm(+k)} ${m.won[k].reduce((a,c)=>a+R(c),0)}점</span>`).join('');
    let me_='';if(i!=null&&m.hands[i]){
      if(m.step==='pre')me_=m.ready[i]?'<div class="line">다른 사람을 기다리는 중</div>':`<div class="bigbtns"><button class="btn" data-a="aitem" ${selItem?'':'disabled'}>아이템: 다음 상품도 걸기${itemHint}</button><button class="btn primary" data-a="aready">입찰하기</button></div>`;
      else me_=(i in m.bids)?'<div class="line">입찰 완료 · 기다리는 중</div>':'<div class="line"><strong>입찰할 카드를 누르세요</strong></div>';
      me_+=`<div class="mini-cards">${m.hands[i].map(c=>mc(c,{cls:m.step==='bid'&&!(i in m.bids)?'click':'',attr:`data-a="abid" data-c="${c}" tabindex="0" role="button"`})).join('')}</div>`}
    body=`<div class="line">이번 상품 <strong>${m.pot.map(p=>cname(p.c)).join(' + ')}</strong> · 테이블 가운데</div>
     <div class="chips">${sc}</div>${me_}`}
  if(m.id==='balloon'){const who=m.alive[m.ci];const ratio=Math.min(1,m.total/BLIMIT);const size=110+Math.round(ratio*110);const hue=Math.round(130-130*ratio);
    const myB=i!=null&&m.hands[i]&&m.alive.includes(i)?`<div class="mini-cards">${m.hands[i].map(c=>{const nx=m.total+R(c);return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">${mc(c,{cls:who===i?'click':'',attr:`data-a="blp" data-c="${c}" tabindex="0" role="button"`})}<small style="color:${nx>BLIMIT?'#ff8080':nx>40?'#ffb35c':'var(--muted)'}">→ ${ui.bsub?Math.max(0,m.total-R(c)):nx}</small></div>`}).join('')}</div>
      ${who===i?`<div class="bigbtns"><button class="btn ${ui.bsub?'primary':''}" data-a="bsub" ${S.seats[i].hand.some(isItem)?'':'disabled'}>${ui.bsub?'빼기 모드: 아이템을 고르고 카드를 내세요':'아이템으로 빼기'}</button></div>`:''}`:'';
    body=`
     <div class="line">합 <strong>${m.total}</strong> / ${BLIMIT} · <strong>${nm(who)}</strong> 차례${m.last?` · 방금 ${nm(m.last.i)} ${cname(m.last.c)}${m.last.sub?' 빼기':''}`:''}</div>
     <div class="chips">${m.alive.map(k=>`<span class="chip ${k===who?'on':''}">${nm(k)} · ${m.hands[k].length}장</span>`).join('')}${m.out.flat().map(k=>`<span class="chip out">${nm(k)}</span>`).join('')}</div>${myB}`}
  if(m.id==='rps'||m.id==='vault'){const L=m.lead;const amLead=i===L;const isR=m.id==='rps';let me_='';
    if(m.step==='save')me_=m.saveq.includes(i)?`<div class="line"><strong>${isR?'졌어요!':'잡혔어요!'}</strong> 아이템을 내면 이번엔 버텨요</div><div class="bigbtns"><button class="btn primary" data-a="osave" ${selItem?'':'disabled'}>아이템 내고 버티기${itemHint}</button><button class="btn" data-a="onosave">탈락 받아들이기</button></div>`:'<div class="line">아이템 사용을 기다리는 중</div>';
    else if(isR){const can=(amLead||m.alive.includes(i))&&!m.picks[i];
      me_=can?`<div class="bigbtns">${['S','R','P'].map(h=>`<button class="handbtnbig" data-a="rps" data-hand="${h}"><span>${{S:'✌️',R:'✊',P:'✋'}[h]}</span>${RPSN[h]}</button>`).join('')}</div>${amLead&&!m.armL?`<div class="bigbtns"><button class="btn" data-a="rarm" ${selItem?'':'disabled'}>아이템: 비긴 사람도 탈락${itemHint}</button></div>`:''}`:
        `<div class="line">${m.picks[i]?`${RPSN[m.picks[i]]}을 냈어요 · 기다리는 중`:'구경 중'}</div>`;if(m.armL)me_=`<div class="line"><strong>이번 판: 비겨도 탈락</strong></div>`+me_}
    else{if(m.step==='hide')me_=m.alive.includes(i)&&!m.picks[i]?`<div class="line">숨을 금고를 고르세요 · 테이블의 금고를 눌러도 돼요</div><div class="doors">${[1,2,3].map(z=>`<button class="door" data-a="vhide" data-z="${z}">${z}</button>`).join('')}</div>`:
        amLead?`<div class="line">도둑들이 숨는 중… 눈을 감으세요</div>${!m.armL?`<div class="bigbtns"><button class="btn" data-a="varm" ${selItem?'':'disabled'}>아이템: 2곳 수색${itemHint}</button></div>`:''}`:`<div class="line">${m.picks[i]?`${m.picks[i]}번 금고에 숨었어요. 쉿.`:'구경 중'}</div>`;
      if(m.step==='guard'){const need=m.armL?2:1;const zs=ui.vz||[];me_=amLead?`<div class="line">뒤질 금고를 ${need}곳 고르세요</div><div class="doors">${[1,2,3].map(z=>`<button class="door ${zs.includes(z)?'on':''}" data-a="vz" data-z="${z}">${z}</button>`).join('')}</div><div class="bigbtns"><button class="btn primary" data-a="vgo" ${zs.length===need?'':'disabled'}>수색!</button>${!m.armL?`<button class="btn" data-a="varm" ${selItem?'':'disabled'}>아이템: 2곳${itemHint}</button>`:''}</div>`:`<div class="line">경비원이 고르는 중…</div>`}}
    body=`<div class="line">${m.round}/${m.max}판 · ${isR?'선':'경비원'} <strong>${nm(L)}</strong></div>
     <div class="chips"><span class="chip lead">${nm(L)} · ${isR?'선':'경비원'}</span>${m.alive.map(k=>`<span class="chip">${nm(k)}${m.step!=='save'&&m.picks[k]&&isR?' ✓':''}</span>`).join('')}${m.out.flat().map(k=>`<span class="chip out">${nm(k)}</span>`).join('')}</div>${me_}`}
  if(m.id==='count'){const now=Date.now();const k=Math.floor((now-m.t0)/CFLIP);const open=now>=countOpenAt(m);let st;
    if(now<m.t0)st=`<div class="line">${Math.ceil((m.t0-now)/1000)}초 뒤에 넘겨요. 문양별로 세어 두세요!</div>`;
    else if(!open){st=`<div class="line">테이블의 카드를 보세요 · ${k+1} / ${m.seq.length}</div>`}
    else{const su=U(m.dec||'S1');st=`<div class="line">정답 문양 <strong style="color:${SUITCOL[su]};font-size:22px">${SYM[su]}</strong> · 몇 장이었을까요?</div>`}
    let me_='';if(open&&i!=null&&(i in m.hits)){me_=(i in m.ans)?`<div class="line">${m.ans[i]}장이라고 답했어요</div>`:`<div class="nums">${[0,1,2,3,4,5,6].map(a=>`<button class="num" data-a="cans" data-n="${a}">${a}${a===6?'+':''}</button>`).join('')}</div>${!m.arm[i]?`<div class="bigbtns"><button class="btn" data-a="carm" ${selItem?'':'disabled'}>아이템: ±1도 정답${itemHint}</button></div>`:'<div class="line"><strong>±1 적용</strong></div>'}`}
    body=`<div class="line">${m.pan}/3판</div><div class="chips">${Object.keys(m.hits).map(k=>`<span class="chip">${nm(+k)} ${m.hits[k]}점</span>`).join('')}</div>${st}${me_}`}
  if(m.id==='race'){const lanes=SUITS.map(su=>{const riders=Object.keys(m.bet).filter(k=>m.bet[k]===su).map(k=>nm(+k)).join(', ');
      return `<div class="lane"><span class="ln" style="color:${SUITCOL[su]}">${SYM[su]}</span>${[0,1,2,3,4].map(c=>`<div class="cell${c===RGOAL?' goal':''}">${m.pos[su]===c?`<span class="horse" style="background:${SUITCOL[su]}">${SYM[su]}</span>`:['밖','1','2','3','결승'][c]}</div>`).join('')}<span class="riders">${riders}</span></div>`}).join('');
    let me_='';if(m.step==='bet'){const who=m.order[m.pi];me_=who===i?`<div class="line">우승할 문양을 고르세요 (겹쳐도 돼요)</div><div class="bigbtns">${SUITS.map(su=>`<button class="btn" data-a="rbet" data-s="${su}" style="border-color:${SUITCOL[su]};font-size:22px">${SYM[su]}</button>`).join('')}</div>`:`<div class="line">${nm(who)}이 고르는 중</div>`}
    else me_=(i===S.first?`<div class="bigbtns"><button class="btn primary" data-a="rflip">카드 뒤집기</button></div>`:`<div class="line">선(${nm(S.first)})이 카드를 뒤집어요</div>`)+(i!=null&&(i in m.bet)?`<div class="bigbtns">${SUITS.filter(su=>su!==m.bet[i]).map(su=>`<button class="btn sm" data-a="rswap" data-s="${su}" ${selItem?'':'disabled'}>아이템: ${SYM[su]}로 갈아타기</button>`).join('')}</div>`:'');
    body=`<div class="line">뒤집은 카드 ${m.pile.length}/${RLIMIT}${m.last?` · 방금 ${cname(m.last.c)} ${SYM[m.last.s]} ${m.last.fw?'앞으로!':'뒤로…'}`:''}</div>${me_}`}
  return `<div class="panel mg"><div class="head"><span class="disp">${esc(def.name)}</span><button class="btn sm" data-a="rulesagain">규칙 다시 보기</button></div><div class="stage">${body}</div>${ui.rulesAgain?`<div class="line" style="margin-top:10px;text-align:left;white-space:pre-line;font-size:13px;color:var(--muted)">${esc(def.text)}</div>`:''}</div>`}

/* ---------- 규칙 화면 (모니터 화면이 페이지 전체가 된다) ---------- */
function rulesHTML(){const id=S.board[S.die-1],def=MG[id];const rd=S.ready||{};const [fld,body]=SC_LOOK(id);
  const lines=def.text.split('\n').map(l=>{const k=l.indexOf(':');if(k<0)return '';const h=l.slice(0,k).replace(/\(.*\)/,'');return `<div class="rrow${h==='아이템'?' it':''}"><b>${esc(h)}</b><span>${esc(l.slice(k+1).trim())}</span></div>`}).join('');
  const mineLeft=S.seats.map((_,k)=>k).filter(k=>mine(k)&&!rd[k]);
  const i=ctl;const p=i!=null?S.seats[i]:null;const clubs=p&&!p.front.length?p.hand.filter(c=>U(c)==='C'&&isItem(c)):[];
  const clubBtns=clubs.map(c=>R(c)===11?`<button class="btn sm" data-a="club" data-c="${c}">♣J 다시 굴리기</button>`:R(c)===12?`<button class="btn sm" data-a="club" data-c="${c}" data-x="1">♣Q 눈 +1</button><button class="btn sm" data-a="club" data-c="${c}" data-x="-1">♣Q 눈 -1</button>`:`<button class="btn sm" data-a="clubK" data-c="${c}">♣K 직접 고르기</button>`).join('');
  const kPick=ui.mode==='clubK'?`<div class="clubbtns">${S.board.map((b,k)=>`<button class="btn sm" data-a="clubKgo" data-k="${k+1}">${k+1} · ${esc(MG[b].name)}</button>`).join('')}<button class="btn sm" data-a="cancel">취소</button></div>`:'';
  const clubTxt=p&&p.front.length?'이번 라운드에 아이템을 써서 ♣는 못 써요':clubs.length?'규칙 설명 중 언제든. 쓰면 디스크를 다시 골라요.':'♣ 아이템이 있으면 여기서 미니게임을 바꿀 수 있어요';
  return `<div class="crt"><div class="scr-top"><span class="mono">MINIGAME ▸ 규칙 설명</span><span class="scr-chip">${S.round}라운드 · 모두 준비되면 시작</span></div>
   <div class="scr-body"><div class="scr-art" style="background:linear-gradient(170deg,${fld},${body})"><div class="ttl">${esc(def.name)}</div><div class="tags"><span>${esc(def.icon.replace(/🂠|🎲|✊/g,'').trim()||'카드 없음')}</span><span>${def.min}~${def.max}인</span></div></div><div class="scr-rules">${lines}</div></div>
   <div class="scr-foot"><div class="scr-box clubbox">${mc('C11')}<div class="txt"><strong>♣ · 미니게임 바꾸기</strong>${clubTxt}${clubBtns?`<div class="clubbtns">${clubBtns}</div>`:''}${kPick}</div></div>
    <div class="scr-box"><span class="lbl">준비 상태</span><div class="readys">${S.seats.map((_,k)=>`<span class="ready${rd[k]?' ok':''}"><i style="background:${SEATCOL[k%5]}"></i>${nm(k)} · ${rd[k]?'준비 완료':'읽는 중'}</span>`).join('')}</div></div>
    <div class="scr-box" style="padding:10px"><div class="rewardrow"><span style="font-size:12px;color:var(--cyan-dim)">보상</span>${(S.rewardDisp||[]).map(c=>mc(c)).join('')}</div>${mineLeft.length?`<button class="readybtn" data-a="ready">준비 완료${mineLeft.length>1?` (내 자리 ${mineLeft.length}개)`:''}</button>`:`<div style="text-align:center;color:var(--cyan-dim)">다른 사람을 기다리는 중…</div>`}</div></div></div>
   <div class="alert" aria-hidden="true"><div class="frame"><svg viewBox="0 0 200 200" fill="none" stroke="#ff4d4d" stroke-width="10" stroke-linejoin="round"><path d="M40 30h100l20 20v120H40z"/><path d="M70 30v42h56V30"/><rect x="62" y="104" width="76" height="66" rx="6"/><path d="M106 40v22"/><path d="M28 28l144 144M172 28L28 172" stroke-width="16" stroke-linecap="round"/></svg></div></div>`}
let SC_LOOK=id=>({hold:['#f0b48f','#cf6f48'],bomb:['#f7a3a3','#c94242'],auction:['#f2d27a','#c79a1c'],balloon:['#ffb35c','#e8853a'],rps:['#a9bdff','#6a7fe0'],vault:['#b9c3d6','#6f7d99'],count:['#9cc3ea','#4f86c6'],race:['#8fd0a4','#3f9a63']}[id]||['#cfd4dc','#7b8494']);

/* ---------- 전체 그리기 ---------- */
function render(){if(fatalMsg||!S)return;renderPlates();if(tipFor&&tipFor!=="3d"&&!document.body.contains(tipFor)){const c=tipFor.dataset.h||tipFor.dataset.c;const pinned=tipPinned;hideTip(true);setTimeout(()=>{const el=document.querySelector(`.hcard[data-h="${c}"],.itemtray .mcard[data-h="${c}"]`);if(el&&pinned)showTip(el,true)},0)}
  if(S.phase==='lobby'){screenEl.classList.remove('show');mainEl.innerHTML=lobbyHTML();return}
  const i=ctl;const actor=whoActs();const ph=S.phase;
  let pill='',pillWait=false,sub=null,acts='',note='',center='',extra='';
  const topl=`<div class="topl"><span class="logo">큐빅 파티</span><span class="chip">${S.round}라운드</span><span class="chip">${S.ot?'연장전 · 4색':'목표 3색'}</span>${mySeats().length>1?mySeats().map(k=>`<button class="chip ${k===ctl?'on':''}" data-a="ctl" data-i="${k}">자리 ${k+1}</button>`).join(''):''}</div>`;
  const topr=`<div class="topr"><button class="iconbtn" data-a="log" aria-label="기록 보기">${ICON.list}</button><button class="iconbtn" data-a="viewtop" aria-label="위에서 보기">${ICON.top}</button><button class="iconbtn" data-a="viewseat" aria-label="기본 시점">${ICON.eye}</button></div>`;
  let handTuck=false,itemTray='';
  if(ph==='main'){if(i!=null&&S.turn.seat===i){const r=turnActs(i);pill=r.pill;sub=r.sub;acts=r.acts||'';note=r.note||'';center=r.center||''}else{pill=`${nm(S.turn.seat)}의 차례`;pillWait=true}}
  else if(ph==='defense'){const P=S.pending;const left=Math.max(0,Math.ceil((P.deadline-Date.now())/1000));
    if(i===P.target){const hs=S.seats[i].hand.filter(c=>U(c)==='H'&&(R(c)===11||R(c)===13));pill=`${nm(P.attacker)}의 ${cname(P.card)} 공격! · ${left}초`;acts=`<div class="group">${hs.map(c=>`<button class="btn primary" data-a="defend" data-c="${c}">${R(c)===11?'♥J로 막기':'♥K로 되돌리기'}</button>`).join('')}<button class="btn" data-a="nodef">막지 않기</button></div>`}
    else{pill=`${nm(P.attacker)} → ${nm(P.target)} · ${cname(P.card)} 공격 · ${left}초`;pillWait=true}}
  else if(ph==='roll'){if(i===S.first){pill='미니게임 주사위를 굴리세요';acts=`<button class="btn primary" data-a="roll">주사위 굴리기</button>`;note='테이블의 주사위를 눌러도 돼요'}else{pill=`${nm(S.first)}이 미니게임 주사위를 굴려요`;pillWait=true}handTuck=true}
  else if(ph==='clubs'){pill='규칙을 읽고 준비 완료를 누르세요';handTuck=true}
  else if(ph==='mg'){handTuck=!ui.showHand;center=mgPanel();const a=actor;pill=a!=null&&mine(a)?'내 차례':a!=null?`${nm(a)} 차례`:MG[S.mg.id].name;pillWait=!(a!=null&&mine(a));
    if(i!=null){const its=S.seats[i].hand.filter(isItem);itemTray=`<div class="itemtray"><span class="lbl">아이템 ${its.length}장 · 눌러서 고르기</span><div class="row">${its.length?its.map(c=>mc(c,{cls:'click'+(sel.has(c)?' sel':''),attr:`data-h="${c}" tabindex="0" role="button"`})).join(''):'<span style="font-size:13px;color:var(--dim)">없음</span>'}</div></div>`}
    acts=`<button class="btn sm" data-a="togglehand" style="margin-bottom:${window.innerWidth<=720?0:0}px">${ui.showHand?'손패 접기':`손패 ${i!=null?S.seats[i].hand.length:0}장 · 미니게임 중엔 접혀 있어요`}</button>`}
  else if(ph==='reward'){const Rw=S.reward;const who=Rw.order[Rw.pi];pill=i===who?'보상 1장을 고르세요 · 테이블의 카드를 누르세요':`${nm(who)}이 보상을 고르는 중`;pillWait=i!==who;
    extra=`<div class="panel" style="position:absolute;left:20px;top:74px;width:260px;pointer-events:auto"><div style="font-size:13px;letter-spacing:1px;color:var(--brass);margin-bottom:8px">미니게임 결과</div>${(S.lastRank||[]).map((g,k)=>`<div style="display:grid;grid-template-columns:44px 1fr;gap:8px;align-items:center;margin:4px 0"><span class="disp" style="font-size:${k?18:24}px;color:${k?'var(--muted)':'var(--brass)'}">${k+1}위</span><span>${g.map(nm).join(' · ')}</span></div>`).join('')}</div>
     <div style="position:absolute;left:50%;top:${window.innerWidth<=720?120:96}px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;padding:8px 12px;border-radius:999px;background:var(--glass-strong);border:1px solid var(--line);max-width:94vw;pointer-events:auto"><span style="font-size:13px;color:var(--muted)">고르는 순서</span>${Rw.order.map((k,j)=>`<span class="chip" style="font-size:12px;${j===Rw.pi?'background:var(--brass);color:var(--brass-ink);border-color:var(--brass)':j<Rw.pi?'opacity:.4':''}">${nm(k)}</span>`).join('')}</div>`;handTuck=false}
  else if(ph==='ended'){center=`<div class="panel center-panel" style="text-align:center"><div class="disp" style="font-size:20px;color:var(--brass)">우승</div><div class="disp" style="font-size:52px;margin:6px 0 16px">${S.winners.map(nm).join(' · ')}</div><div class="btnrow"><button class="btn primary" data-a="restart">같은 자리로 새 게임</button><button class="btn" data-a="tolobby">로비로</button></div></div>`}
  const tray=i!=null&&!['mg','clubs'].includes(ph)?`<div class="tray dz" data-dz="tray"><span class="lbl">내 토큰 · ${nm(i)} · 카드를 끌어 놓으면 토큰</span><div class="row">${[0,1,2].concat(S.ot?[3]:[]).map(k=>{const t=S.seats[i].tokens[k];return `<span class="cube ${t||'empty'}"></span>`}).join('')}</div></div>`:'';
  const prompt=`<div class="prompt"><div class="pill${pillWait?' wait':''}">${esc(pill)}</div>${sub?`<div class="subchips">${sub.map(([t,_,on])=>`<span class="chip${on?' on':''}">${esc(t)}</span>`).join('')}</div>`:''}</div>`;
  const actsEl=acts||note?`<div class="acts">${note?`<div class="note">${esc(note)}</div>`:''}<div class="group">${acts}</div></div>`:'';
  const notice=flashMsg?`<div class="notice" role="alert">${esc(flashMsg)}</div>`:'';
  const drawer=ui.log?`<div class="panel drawer">${S.log.slice(0,60).map(l=>`<div>${esc(l)}</div>`).join('')}<div style="margin-top:10px"><button class="btn sm danger" data-a="${ui.confirmReset?'reset2':'reset1'}">${ui.confirmReset?'정말 테이블을 비울까요? 한 번 더':'테이블 비우기'}</button></div></div>`:'';
  const dz=ph==='main'&&i!=null&&S.turn.seat===i&&S.turn.picked?`<div class="dz" data-dz="table"><span>테이블에 놓기</span></div>`:'';
  mainEl.innerHTML=dz+topl+topr+(ph==='clubs'?'':prompt)+notice+extra+tray+itemTray+(i!=null?renderHand(i,handTuck):'')+actsEl+center+drawer;
  // 규칙 화면
  if(ph==='clubs'&&Main.rulesShown()&&!Main.clubPlaying()){screenEl.innerHTML=rulesHTML();screenEl.classList.add('show')}
  else if(!Main.clubPlaying()){screenEl.classList.remove('show','alerting')}
}
function lobbyHTML(){const sitting=S.seats.some(p=>p.uid===me);
  const intro=P2PMODE?`<p>방 코드 <strong style="color:var(--brass);font-size:18px">${esc(roomInfo?roomInfo.code:'')}</strong>${roomInfo&&roomInfo.role==='host'?' · 내가 방장':''} · 개인전 2~5인. 친구에게 링크를 보내면 같은 테이블에 앉을 수 있어요.</p><div class="btnrow" style="margin-bottom:6px"><button class="btn sm" data-a="copylink">링크 복사</button></div>`:`<p>개인전 2~5인. 친구는 이 페이지에 편집자로 초대받아 들어오면 자리에 앉을 수 있어요. 혼자 시험할 때는 "내 자리 하나 더"로 여러 자리를 한 기기에서 조종하세요.</p>`;
  return `<div class="panel lobby"><h1>큐빅 파티</h1>${intro}
   ${flashMsg?`<div class="notice" style="position:static;transform:none;margin:8px 0">${esc(flashMsg)}</div>`:''}
   <div class="seatlist">${S.seats.map((p,k)=>`<div class="seatrow"><span class="who"><span class="cube" style="width:18px;height:18px;background:${SEATCOL[k%5]}"></span>${nm(k)}</span>${mine(k)?`<button class="btn sm" data-a="leave" data-i="${k}">일어나기</button>`:''}</div>`).join('')||'<div class="seatrow" style="justify-content:center;color:var(--muted)">아직 아무도 앉지 않았어요</div>'}</div>
   <div class="btnrow">${!sitting?`<button class="btn primary" data-a="sit">자리에 앉기</button>`:''}${sitting&&S.seats.length<5?`<button class="btn" data-a="sit">내 자리 하나 더</button>`:''}<button class="btn primary" data-a="start" ${S.seats.length>=2&&S.seats.length<=5&&sitting?'':'disabled'}>게임 시작 (${S.seats.length}명)</button></div>
   <p style="margin-top:14px;font-size:12px">끌어서 둘러보고, 테이블의 물건은 눌러서 고를 수 있어요.</p></div>`}

/* ---------- 연출 오버레이 ---------- */
let fxq=[],fxBusy=false;
function queueFx(f){fxq.push(f);while(fxq.length>4)fxq.shift();if(!fxBusy)nextFx()}
function nextFx(){const f=fxq.shift();if(!f){fxBusy=false;return}fxBusy=true;playFx(f,nextFx)}
function shake(){const c=$('#gl');c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake')}
function playFx(f,done){const el=document.createElement('div');el.className='fx '+(f.tone||'');let dur=1300;
  const who=f.seats&&f.seats.length?`<div class="s">${f.seats.map(nm).join(' · ')}</div>`:'';
  if(f.t==='dice'){dur=1300;el.innerHTML=`<div class="k">${f.bust?'와르르':'굴림'}</div><div class="b">${f.both?`${f.both[0]} · ${f.both[1]} → ${f.v}`:f.v}</div>${f.bust?`<div class="s">기준 ${f.th} 이하!</div>`:''}${who}`;if(f.bust){el.classList.add('bad');shake()}}
  else if(f.t==='title'){dur=1600;el.innerHTML=`<div class="k">미니게임 시작</div><div class="b">${esc(MG[f.mg].name)}</div>`}
  else if(f.t==='pop'){dur=f.small?1100:1400;el.classList.add('bad');el.innerHTML=`<div class="b">${f.bomb?'펑!':'빵!'}</div>${who}<div class="s">${f.small?'폭탄 1개':'탈락'}</div>`;shake()}
  else if(f.t==='rps'){dur=2200;el.innerHTML=`<div class="k">하나 둘 셋!</div><div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center">${[f.lead,...Object.keys(f.picks).map(Number).filter(k=>k!==f.lead)].map(k=>`<div style="display:flex;flex-direction:column;align-items:center;gap:4px;${f.losers.includes(k)?'opacity:.5':''}"><span style="font-size:44px">${{S:'✌️',R:'✊',P:'✋'}[f.picks[k]]}</span><small>${nm(k)}${k===f.lead?' (선)':''}</small></div>`).join('')}</div><div class="s">${f.losers.length?f.losers.map(nm).join(' · ')+' 걸림!':'아무도 안 걸렸다'}</div>`;if(f.losers.length)setTimeout(shake,500)}
  else if(f.t==='vault'){dur=2300;el.innerHTML=`<div class="k">수색!</div><div class="doors">${[1,2,3].map(z=>`<div class="door ${f.zones.includes(z)?'on':''}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:30px">${z}<small style="font-family:'IBM Plex Sans KR';font-size:11px">${Object.keys(f.picks).filter(k=>f.picks[k]===z).map(k=>nm(+k)).join('<br>')}</small></div>`).join('')}</div><div class="s">${f.losers.length?f.losers.map(nm).join(' · ')+' 잡혔다!':'헛탕!'}</div>`;if(f.losers.length)setTimeout(shake,600)}
  else if(f.t==='count'){dur=2000;el.innerHTML=`<div class="k">정답</div><div class="b" style="color:${SUITCOL[f.suit]}">${SYM[f.suit]} ${f.cnt}장</div><div class="s">${Object.keys(f.ans).map(k=>`${nm(+k)} ${f.ans[k]}${f.hit.includes(+k)?' ⭕':' ❌'}`).join(' · ')}</div>`}
  else if(f.t==='bids'){dur=1800;el.innerHTML=`<div class="k">공개!</div><div class="mini-cards">${Object.keys(f.bids).map(k=>`<div style="display:flex;flex-direction:column;align-items:center;gap:4px">${mc(f.bids[k])}<small>${nm(+k)}</small></div>`).join('')}</div><div class="s">${f.win!=null?nm(f.win)+' 낙찰!':'모두 지워졌다'}</div>`}
  else if(f.t==='token'){dur=1300;el.classList.add('good');el.innerHTML=`<span class="cube ${f.col}" style="width:56px;height:56px;border-radius:12px"></span><div class="b">토큰 ${f.n}개째!</div>${who}`}
  else if(f.t==='attack'){dur=1300;el.classList.add('bad');el.innerHTML=`<div class="b">${cname(f.card)} 공격!</div><div class="s">${nm(f.seats[0])} → ${nm(f.seats[1])}</div>`;shake()}
  else if(f.t==='rank'){dur=1900;el.innerHTML=`<div class="k">미니게임 결과</div>${f.groups.map((g,k)=>`<div class="rk"><b>${k+1}위</b>${g.map(nm).join(' · ')}</div>`).join('')}`}
  else if(f.t==='win'){dur=3200;el.classList.add('win');el.innerHTML=`<div class="k">우승</div><div class="b">${f.seats.map(nm).join(' · ')}</div>`}
  else {el.innerHTML=`<div class="b">${esc(f.text||'')}</div>${who}`}
  fxEl.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>{el.remove();done()},260)},dur)}
let toastT=0;function toast(m){toastEl.textContent=m;toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),1800)}
/* ♣: 모니터가 빨간 X → 모니터와 별개인 컷신 */
async function clubShow(f){screenEl.classList.add('show','alerting');if(!screenEl.querySelector('.alert'))screenEl.innerHTML=rulesHTML();
  await new Promise(r=>setTimeout(r,900));
  const c=f.club;const eff={11:'미니게임 다시 굴리기',12:`주사위 눈 ${''}±1`,13:'미니게임 직접 고르기'}[R(c)];const i=f.seats[0];
  cutEl.innerHTML=`<div class="shade"></div><div class="band"></div><div class="who"><span class="av" style="background:${SEATCOL[i%5]}"></span><span class="nm">${nm(i)}</span></div><div class="card" style="color:${SUITCOL.C}"><span class="rk">${RL(R(c))}</span><span class="s1">♣</span><span class="s2">♣</span></div><div class="eff">${cname(c)} · ${eff}</div>`;
  cutEl.classList.add('show');await new Promise(r=>setTimeout(r,1900));cutEl.classList.remove('show');screenEl.classList.remove('show','alerting')}

/* ---------- 입력 ---------- */
/* ---------- 손패 끌기: 테이블로 버리기, 토큰 칸으로 토큰, 상대에게 공격 ---------- */
let drag=null,swallow=false;
function dragStart(e){const h=e.target.closest('.hcard');if(!h||e.button>0)return;drag={c:h.dataset.h,el:h,x:e.clientX,y:e.clientY,on:false}}
function dragMove(e){if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.on){if(Math.hypot(dx,dy)<10)return;drag.on=true;hideTip(true);const g=drag.el.cloneNode(true);g.classList.add('ghost');g.classList.remove('new','sel');document.body.appendChild(g);drag.g=g;drag.el.style.opacity='.25';document.body.classList.add('dragging');Main.dragHint(drag.c,true)}
  drag.g.style.left=(e.clientX-59)+'px';drag.g.style.top=(e.clientY-83)+'px';
  const z=dropZone(e.clientX,e.clientY);document.querySelectorAll('.dz').forEach(x=>x.classList.toggle('hot',x.dataset.dz===z.kind));
  drag.g.classList.toggle('over',z.kind!=='hand');e.preventDefault()}
function dragEnd(e){const d=drag;drag=null;if(!d)return;if(!d.on)return;swallow=true;setTimeout(()=>swallow=false,0);
  d.g.remove();d.el.style.opacity='';document.body.classList.remove('dragging');Main.dragHint(d.c,false);
  Main.dropCard(d.c,dropZone(e.clientX,e.clientY))}
function dropZone(x,y){const el=document.elementFromPoint(x,y);
  if(el){const tr=el.closest('.tray');if(tr)return {kind:'tray'};const pl=el.closest('[data-plate]');if(pl)return {kind:'seat',i:+pl.dataset.plate}}
  const si=SC.seatAt(x,y);if(si!=null)return {kind:'seat',i:si};
  if(y>window.innerHeight-170)return {kind:'hand'};return {kind:'table'}}
/* 아이템 툴팁: 올리면 보이고, 누르면 고정 */
let tipEl=null,tipFor=null,tipPinned=false;
function showTip(el,pin){const c=el.dataset.h||el.dataset.c;if(!c||!isItem(c))return;const html=itemTip(c);if(!html)return;
  if(!tipEl){tipEl=document.createElement('div');tipEl.className='tip';tipEl.setAttribute('role','tooltip');document.body.appendChild(tipEl)}
  tipEl.innerHTML=html;tipEl.dataset.c='';tipFor=el;tipPinned=!!pin;tipEl.classList.add('show');
  const r=el.getBoundingClientRect();const w=Math.min(300,window.innerWidth-24);tipEl.style.width=w+'px';
  let x=r.left+r.width/2-w/2;x=Math.max(12,Math.min(window.innerWidth-w-12,x));tipEl.style.left=x+'px';
  const th=tipEl.offsetHeight;const top=el.classList.contains("hcard")?Math.min(r.top,window.innerHeight-200):r.top;let y=top-th-14;if(y<12)y=r.bottom+12;tipEl.style.top=y+"px"}
function tip3d(c,x,y){if(tipPinned&&tipFor)return;
  if(!c){if(tipFor==='3d')hideTip(true);return}
  const html=itemTip(c);if(!html)return;
  if(!tipEl){tipEl=document.createElement('div');tipEl.className='tip';tipEl.setAttribute('role','tooltip');document.body.appendChild(tipEl)}
  if(tipEl.dataset.c!==c){tipEl.innerHTML=html;tipEl.dataset.c=c}tipFor='3d';tipEl.classList.add('show');
  const w=Math.min(300,window.innerWidth-24);tipEl.style.width=w+'px';const th=tipEl.offsetHeight;
  let lx=Math.max(12,Math.min(window.innerWidth-w-12,x+18));let ly=y-th-18;if(ly<12)ly=y+24;tipEl.style.left=lx+'px';tipEl.style.top=ly+'px'}
function hideTip(force){if(!tipEl)return;if(tipPinned&&!force)return;tipEl.classList.remove('show');tipFor=null;tipPinned=false}
document.addEventListener('pointerover',e=>{if(drag&&drag.on){hideTip(true);return}const el=e.target.closest&&e.target.closest('.hcard,.mcard');if(el&&isItem(el.dataset.h||el.dataset.c||'')){if(!tipPinned||tipFor!==el)showTip(el,false)}});
document.addEventListener('pointerout',e=>{const el=e.target.closest&&e.target.closest('.hcard,.mcard');if(el&&el===tipFor&&!tipPinned)hideTip()});
document.addEventListener('pointerdown',e=>{if(tipPinned&&!(e.target.closest&&e.target.closest('.hcard,.mcard')))hideTip(true)});
document.addEventListener('focusin',e=>{const el=e.target.closest&&e.target.closest('.hcard,.mcard');if(el)showTip(el,false)});
document.addEventListener('focusout',()=>hideTip());
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip(true)});
function onClick(e){if(swallow){swallow=false;return}
  {const it=e.target.closest('.hcard,.mcard');const c=it&&(it.dataset.h||it.dataset.c);if(c&&isItem(c)){if(tipPinned&&tipFor&&(tipFor.dataset.h||tipFor.dataset.c)===c)hideTip(true);else showTip(it,true)}}
  const h=e.target.closest('[data-h]');if(h){const c=h.dataset.h;sel.has(c)?sel.delete(c):sel.add(c);render();return}
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;Main.action(b.dataset.a,b.dataset,b)}

let fpsEl=null;
function fpsHint(ok,locked){if(!fpsEl){fpsEl=document.createElement('div');fpsEl.id='fpshint';hud.appendChild(fpsEl)}
  fpsEl.className=locked?'fps on':ok?'fps':'fps off';
  fpsEl.innerHTML=locked?'<div class="xh" aria-hidden="true"></div><div class="fpstip">Esc · 커서 꺼내기</div>':ok?'<div class="fpstip">화면을 클릭하면 1인칭 시점 (마우스로 둘러보기)</div>':''}
let roomInfo=null;function room(c){roomInfo=c}
return {room,tip3d,dropZone,fpsHint,init,render,fatal,placePlates,queueFx,toast,clubShow,shake};
})();

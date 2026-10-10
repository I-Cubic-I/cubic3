/* ================= 흐름: 상태·연출 이벤트 → 3D 연출과 화면 ================= */
const Main=(()=>{
let lastFx=null,shown=false,choosing=false,clubBusy=false,prevPhase=null,introKey='',lastActor=null,clubQ=[];
function rulesReady(){choosing=false;shown=true;UI.render()}
async function runClub(f){clubBusy=true;try{await UI.clubShow(f);shown=false;UI.render();
  choosing=true;await SC.playChoose(f.v,{restore:true,roll:R(f.club)===11})}finally{clubBusy=false}
  if(clubQ.length)runClub(clubQ.shift())}
function pumpFx(){const list=S.fx||[];if(lastFx===null){lastFx=S.fxn||0;return []}
  const nw=list.filter(f=>f.id>lastFx);if(nw.length)lastFx=nw[nw.length-1].id;return nw}
function onState(){SC.sync();const ph=S.phase;const nw=pumpFx();
  // 장면 전환
  if(ph!==prevPhase){
    if(ph==='main'||ph==='defense'){if(prevPhase!=='main'&&prevPhase!=='defense'){SC.cut();SC.shot('seat',2)}shown=false;choosing=false}
    if(ph==='mg'){SC.cut();if(!SC.goStation(S.mg.id))SC.shot('seat',2);shown=false;choosing=false;ui.showHand=false}
    if(ph!=='mg'&&prevPhase==='mg')SC.lightsMain();
    if(ph==='reward'){SC.shot('reward',2)}
    if(ph==='ended'){SC.shot('seat',1.5)}
    if(ph==='lobby'){SC.shot('seat')}
  }
  if(ph==='roll'){const k='r'+S.round+S.board.join();if(introKey!==k){introKey=k;shown=false;
    if(prevPhase==='main'||prevPhase==='defense')SC.playIntro();else{SC.settleLined();SC.shot('top')}}}
  // 연출 이벤트
  for(const f of nw){
    if(f.club){if(clubBusy)clubQ.push(f);else runClub(f);continue}
    if(f.t==='dice'&&f.mg){choosing=true;shown=false;SC.playChoose(f.v,{roll:true});continue}
    UI.queueFx(f)}
  // 다시 들어왔거나 연출을 놓친 경우 바로 규칙 화면
  if(ph==='clubs'&&!shown&&!choosing&&!clubBusy){SC.settleLined();SC.jumpChosen(S.die);SC.shot('zoom',8);shown=true}
  // 내 차례 알림
  const a=whoActs();const key=a+'|'+ph+'|'+(S.mg?S.mg.id:'');if(key!==lastActor){lastActor=key;if(a!=null&&mine(a)&&!['lobby','clubs','ended'].includes(ph))UI.toast(mySeats().length>1?`${seatName(a)} 차례!`:'내 차례!')}
  // FPS: 메인 턴에서 내 차례가 아닐 때만(내가 막아야 하는 공격도 제외)
  const myAct=a!=null&&mine(a);const fps=(ph==='main'||ph==='defense')&&mySeats().length>0&&!myAct;
  if(!fps&&SC.isLocked())SC.resetLook();SC.setFps(fps);
  prevPhase=ph;UI.render()}
function canPick(p){if(!S)return false;const i=ctl;
  if(p.kind==='deck')return S.phase==='main'&&S.turn&&S.turn.seat===i&&!S.turn.picked&&!ui.mode;
  if(p.kind==='row')return S.phase==='main'&&S.turn&&S.turn.seat===i&&((!S.turn.picked&&!ui.mode)||(ui.mode==='HQ'&&!isItem(p.c)));
  if(p.kind==='reward')return S.phase==='reward'&&S.reward.order[S.reward.pi]===i;
  if(p.kind==='die')return S.phase==='roll'&&S.first===i;
  if(p.kind==='seat')return ui.mode==='target'&&p.i!==i;
  if(p.kind==='bomb')return S.phase==='mg'&&S.mg.id==='bomb'&&S.mg.alive[S.mg.ci]===i;
  if(p.kind==='door'){const m=S.mg;return S.phase==='mg'&&m.id==='vault'&&((m.step==='hide'&&m.alive.includes(i)&&!m.picks[i])||(m.step==='guard'&&m.lead===i))}
  return false}
function pick(p){if(!canPick(p))return;
  if(p.kind==='deck')action('pdeck',{});
  if(p.kind==='row'){if(ui.mode==='HQ'){ui.hq=ui.hq||new Set();ui.hq.has(p.c)?ui.hq.delete(p.c):(ui.hq.size<2&&ui.hq.add(p.c));UI.render();return}action('prow',{c:p.c})}
  if(p.kind==='reward')action('rpick',{c:p.c});
  if(p.kind==='die')action('roll',{});
  if(p.kind==='bomb')action('bflip',{k:p.k});
  if(p.kind==='door'){if(S.mg.step==='hide')action('vhide',{z:p.z});else action('vz',{z:p.z})}
  if(p.kind==='seat'){const it=ui.card;if(R(it)===11)action('atk',{t:p.i});else UI.toast('아래 버튼에서 대상을 골라 주세요')}}

/* 손패 카드를 끌어 놓았을 때 */
function dragHint(c,on){}
function dropCard(c,z){const i=ctl;if(i==null||!S)return;const ph=S.phase;
  if(ph!=='main'||!S.turn||S.turn.seat!==i){UI.toast('지금은 내 차례가 아니에요');return}
  const t=S.turn,p=S.seats[i];if(z.kind==='hand')return;
  if(t.peek){UI.toast('먼저 ♦J로 본 카드 중 1장을 고르세요');return}
  if(!t.picked){UI.toast('먼저 덱이나 버림 줄에서 1장을 주우세요');return}
  if(t.mustDiscard){if(z.kind!=='table'){UI.toast('버릴 카드는 테이블에 놓으세요');return}
    act(st=>{if(st.phase!=='main'||st.turn.seat!==i||!st.turn.mustDiscard||!st.seats[i].hand.includes(c))return false;pickupDiscard(st,i,c)});return}
  if(t.trim){if(z.kind!=='table')return;act(st=>{const P=st.seats[i];if(st.phase!=='main'||st.turn.seat!==i||!P.hand.includes(c))return false;
      P.hand.splice(P.hand.indexOf(c),1);discardCard(st,i,c);log(st,`자리 ${i+1}: 손패 정리 ${cname(c)}.`);if(P.hand.length<=6)endTurn(st)});return}
  if(z.kind==='tray'){if(isItem(c)&&!(U(c)==='D'&&R(c)>=12)){UI.toast('토큰 칸에는 숫자 카드(또는 ♦Q·♦K)를 놓으세요');return}
    if(isItem(c)){sel.clear();sel.add(c);UI.toast(`${cname(c)}를 골랐어요 · 같은 문양 숫자 카드를 토큰 칸에 놓으세요`);UI.render();return}
    if(t.token){UI.toast('이번 턴에 이미 토큰을 만들었어요');return}
    const su=U(c),cost=costFor(S,i);const it=[...sel].find(x=>isItem(x)&&U(x)==='D');
    if(it){const nums=p.hand.filter(x=>U(x)===su&&!isItem(x)).sort((a,b)=>R(a)-R(b));const need=R(it)===13?3:cost;const pickN=[c,...nums.filter(x=>x!==c)].slice(0,need);const cards=[...pickN,it];
      const err=canMakeToken(S,i,cards);if(err){UI.toast(err);return}sel.clear();if(R(it)===12){ui={mode:'DQ',cards};UI.render();return}
      act(st=>{if(st.phase!=='main'||canMakeToken(st,i,cards))return false;makeToken(st,i,cards)});return}
    action('qtoken',{s:su});const nums=p.hand.filter(x=>U(x)===su&&!isItem(x));if(nums.length<cost)UI.toast(`${SNAME[su]} 숫자 카드가 ${cost}장 필요해요 (지금 ${nums.length}장)`);else{const e=canMakeToken(S,i,nums.sort((a,b)=>R(a)-R(b)).slice(0,cost));if(e)UI.toast(e)}return}
  if(!isItem(c)){UI.toast('숫자 카드는 토큰 칸에 놓아 토큰을 만들어요');return}
  if(t.item){UI.toast('이번 턴에 이미 아이템을 썼어요');return}
  const su=U(c),r=R(c);
  if(su==='S'){if(z.kind!=='seat'){UI.toast('♠ 공격 카드는 공격할 상대에게 끌어 놓으세요');return}
    if(z.i===i)return;if(r===11){ui={mode:'target',card:c};action('atk',{t:z.i});return}
    ui={mode:'target',card:c,only:z.i};sel.clear();sel.add(c);UI.render();UI.toast(r===12?'받을 문양을 고르세요':'뺏을 토큰을 고르세요');return}
  if(su==='H'&&r===12){ui={mode:'HQ',card:c,hq:new Set()};sel.clear();UI.render();return}
  if(su==='D'&&r===11){act(st=>{if(st.phase!=='main'||st.turn.seat!==i||st.turn.item)return false;useDJ(st,i,c)});return}
  if(su==='D'){sel.clear();sel.add(c);UI.toast(`${cname(c)}는 토큰 칸에 숫자 카드와 함께 써요`);UI.render();return}
  UI.toast(su==='H'?'♥J·♥K는 남의 공격을 막을 때 써요':'♣는 미니게임을 정할 때 써요')}
function action(a,d){const i=ctl,s=selArr();const guard=(st,ph)=>st.phase===ph;
  switch(a){
    case 'sit':act(st=>{if(st.phase!=='lobby'||st.seats.length>=5)return false;st.seats.push({uid:me});log(st,'자리에 한 명 앉았다.')});break;
    case 'leave':{const k=+d.i;act(st=>{if(st.phase!=='lobby'||!st.seats[k]||st.seats[k].uid!==me)return false;st.seats.splice(k,1)})}break;
    case 'start':act(st=>{if(st.phase!=='lobby'||st.seats.length<2)return false;startGame(st)});break;
    case 'restart':act(st=>{if(st.phase!=='ended')return false;startGame(st)});break;
    case 'tolobby':act(st=>{const seats=st.seats.map(p=>({uid:p.uid}));for(const k of Object.keys(st))delete st[k];Object.assign(st,newLobby());st.seats=seats});break;
    case 'reset1':ui.confirmReset=true;UI.render();break;
    case 'reset2':ui.log=false;act(st=>{for(const k of Object.keys(st))delete st[k];Object.assign(st,newLobby())});break;
    case 'log':ui.log=!ui.log;UI.render();break;
    case 'viewtop':SC.shot(SC.camShot==='top'?'seat':'top');break;
    case 'viewseat':SC.resetLook();SC.shot(S.phase==='reward'?'reward':'seat');break;
    case 'ctl':ctl=+d.i;sel.clear();ui={};UI.render();break;
    case 'togglehand':ui.showHand=!ui.showHand;UI.render();break;
    case 'rulesagain':ui.rulesAgain=!ui.rulesAgain;UI.render();break;
    case 'roll':act(st=>{if(!guard(st,'roll')||st.first!==i)return false;rollBoard(st)});break;
    case 'ready':act(st=>{if(!guard(st,'clubs'))return false;let any=false;for(let k=0;k<st.seats.length;k++){if(st.phase!=='clubs')break;if(st.seats[k].uid===me&&!(st.ready||{})[k]){any=true;readyUp(st,k)}}if(!any)return false});break;
    case 'club':{const c=d.c,x=+d.x||0;act(st=>{if(!guard(st,'clubs')||!st.seats[i].hand.includes(c)||st.seats[i].front.length)return false;useClub(st,i,c,x)})}break;
    case 'clubK':ui={mode:'clubK',card:d.c};UI.render();break;
    case 'clubKgo':{const k=+d.k,c=ui.card;ui={};act(st=>{if(st.phase!=='clubs'||st.seats[i].front.length||!st.seats[i].hand.includes(c))return false;useClub(st,i,c,k)})}break;
    case 'defend':{const c=d.c;act(st=>{if(!guard(st,'defense')||st.pending.target!==i)return false;defend(st,i,c)})}break;
    case 'nodef':act(st=>{if(!guard(st,'defense')||st.pending.target!==i)return false;resolveAttack(st)});break;
    case 'pdeck':case 'prow':{const want=d.c;act(st=>{if(!guard(st,'main')||st.turn.seat!==i||st.turn.picked)return false;if(pickup(st,i,a==='prow',want)==='none')return false})}break;
    case 'pdisc':act(st=>{if(!guard(st,'main')||st.turn.seat!==i||!st.turn.mustDiscard||!st.seats[i].hand.includes(s[0]))return false;pickupDiscard(st,i,s[0])});break;
    case 'token':{const it=s.find(isItem);if(it&&R(it)===12){ui={mode:'DQ',cards:s};UI.render();break}
      act(st=>{if(!guard(st,'main')||st.turn.seat!==i||canMakeToken(st,i,s))return false;makeToken(st,i,s)})}break;
    case 'qtoken':{const su=d.s;act(st=>{if(!guard(st,'main')||st.turn.seat!==i)return false;const cost=costFor(st,i);
      const nums=st.seats[i].hand.filter(c=>U(c)===su&&!isItem(c)).sort((x,y)=>R(x)-R(y)).slice(0,cost);if(canMakeToken(st,i,nums))return false;makeToken(st,i,nums)})}break;
    case 'dqcol':{const cards=ui.cards,col=d.s;ui={};act(st=>{if(!guard(st,'main')||st.turn.seat!==i||canMakeToken(st,i,cards))return false;makeToken(st,i,cards,col)})}break;
    case 'item':{const c=s[0];const su=U(c),r=R(c);
      if(su==='S'){ui={mode:'target',card:c};UI.render()}
      else if(su==='H'&&r===12){ui={mode:'HQ',card:c,hq:new Set()};sel.clear();UI.render()}
      else if(su==='D'&&r===11)act(st=>{if(!guard(st,'main')||st.turn.seat!==i||st.turn.item)return false;useDJ(st,i,c)})}break;
    case 'tsuit':ui.suit=d.s;UI.render();break;
    case 'tgt':{const t=+d.t;if(ui.mode==='target'&&R(ui.card)===11)action('atk',{t});}break;
    case 'atk':{const c=ui.card,tg=+d.t,arg=R(c)===12?ui.suit:R(c)===13?d.s:null;if(R(c)===12&&!arg)return;ui={};
      act(st=>{if(!guard(st,'main')||st.turn.seat!==i||st.turn.item||!st.seats[i].hand.includes(c))return false;startAttack(st,i,c,tg,arg)})}break;
    case 'hq':{const c=ui.card,picks=[...(ui.hq||[])];ui={};act(st=>{if(!guard(st,'main')||st.turn.seat!==i||st.turn.item)return false;useHQ(st,i,c,picks.filter(x=>st.row.includes(x)))})}break;
    case 'dj':{const c=d.c;act(st=>{if(!guard(st,'main')||st.turn.seat!==i||!st.turn.peek)return false;pickDJ(st,i,c)})}break;
    case 'cancel':ui={};sel.clear();UI.render();break;
    case 'end':act(st=>{if(!guard(st,'main')||st.turn.seat!==i||!st.turn.picked||st.turn.mustDiscard)return false;if(st.seats[i].hand.length>6){st.turn.trim=true;return}endTurn(st)});break;
    case 'trim':act(st=>{if(!guard(st,'main')||st.turn.seat!==i)return false;const p=st.seats[i];if(p.hand.length-6!==s.length)return false;
      s.forEach(c=>{p.hand.splice(p.hand.indexOf(c),1);discardCard(st,i,c)});log(st,`자리 ${i+1}: 손패 정리 ${s.length}장.`);endTurn(st)});break;
    case 'hroll':case 'hroll2':{const it=a==='hroll2'?s[0]:null;act(st=>{if(!guard(st,'mg')||st.mg.id!=='hold'||st.mg.ord[st.mg.ci]!==i)return false;if(it&&!st.seats[i].hand.includes(it))return false;holdRoll(st,i,it)})}break;
    case 'hstop':act(st=>{if(!guard(st,'mg')||st.mg.id!=='hold'||st.mg.ord[st.mg.ci]!==i||!st.mg.k)return false;holdStop(st,i)});break;
    case 'barm':{const it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='bomb'||st.mg.alive[st.mg.ci]!==i||st.mg.arm[i]||!st.seats[i].hand.includes(it))return false;bombArm(st,i,it)})}break;
    case 'bflip':{const k=+d.k;act(st=>{if(!guard(st,'mg')||st.mg.id!=='bomb'||st.mg.alive[st.mg.ci]!==i)return false;bombFlip(st,i,k)})}break;
    case 'aitem':{const it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='auction'||st.mg.step!=='pre'||!st.seats[i].hand.includes(it))return false;if(auctionItem(st,i,it)==='no')return false})}break;
    case 'aready':act(st=>{if(!guard(st,'mg')||st.mg.id!=='auction'||st.mg.step!=='pre')return false;auctionReady(st,i)});break;
    case 'abid':{const c=d.c;act(st=>{const m=st.mg;if(!guard(st,'mg')||m.id!=='auction'||m.step!=='bid'||(i in m.bids)||!m.hands[i].includes(c))return false;auctionBid(st,i,c)})}break;
    case 'rpick':{const c=d.c;act(st=>{if(!guard(st,'reward')||st.reward.order[st.reward.pi]!==i)return false;rewardPick(st,i,c)})}break;
    case 'rps':{const h=d.hand;act(st=>{if(!guard(st,'mg')||st.mg.id!=='rps')return false;return rpsPick(st,i,h)})}break;
    case 'blp':{const c=d.c,it=ui.bsub?s.find(isItem):null;if(ui.bsub&&!it){flash('빼기 모드: 왼쪽 아래 아이템 J·Q·K를 먼저 고르세요.');break}ui.bsub=false;act(st=>{if(!guard(st,'mg')||st.mg.id!=='balloon')return false;return balloonPlay(st,i,c,it)})}break;
    case 'bsub':ui.bsub=!ui.bsub;UI.render();break;
    case 'osave':{const it=s[0];act(st=>{if(!guard(st,'mg')||!(st.mg.id==='rps'||st.mg.id==='vault'))return false;return ovnSave(st,i,it)})}break;
    case 'onosave':act(st=>{if(!guard(st,'mg')||!(st.mg.id==='rps'||st.mg.id==='vault'))return false;return ovnSave(st,i,null)});break;
    case 'rarm':{const it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='rps')return false;return rpsArm(st,i,it)})}break;
    case 'vhide':{const z=+d.z;act(st=>{if(!guard(st,'mg')||st.mg.id!=='vault')return false;return vaultHide(st,i,z)})}break;
    case 'varm':{const it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='vault')return false;return vaultArm(st,i,it)})}break;
    case 'vz':{const z=+d.z;const need=S.mg.armL?2:1;let zs=(ui.vz||[]).slice();zs=zs.includes(z)?zs.filter(x=>x!==z):[...zs,z].slice(-need);ui.vz=zs;UI.render()}break;
    case 'vgo':{const zs=(ui.vz||[]).slice();ui.vz=[];act(st=>{if(!guard(st,'mg')||st.mg.id!=='vault')return false;return vaultGuard(st,i,zs)})}break;
    case 'cans':{const n=+d.n;act(st=>{if(!guard(st,'mg')||st.mg.id!=='count')return false;return countAnswer(st,i,n)})}break;
    case 'carm':{const it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='count')return false;return countArm(st,i,it)})}break;
    case 'rbet':{const su=d.s;act(st=>{if(!guard(st,'mg')||st.mg.id!=='race')return false;return raceBet(st,i,su)})}break;
    case 'rswap':{const su=d.s,it=s[0];act(st=>{if(!guard(st,'mg')||st.mg.id!=='race')return false;return raceSwap(st,i,it,su)})}break;
    case 'rflip':act(st=>{if(!guard(st,'mg')||st.mg.id!=='race')return false;return raceFlip(st,i)});break;
  }}
return {dragHint,dropCard,onState,canPick,pick,action,rulesReady,rulesShown:()=>shown,clubPlaying:()=>clubBusy};
})();
window.addEventListener('DOMContentLoaded',()=>{UI.init();SC.init(document.getElementById('gl'));boot()});

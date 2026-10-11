#!/usr/bin/env node
/* 3D 디지털판 화면 시험 (Playwright + 내장 Chromium).
   사용: node tools/test/play.js [flow|auto|p2p|minigames] [출력폴더]
     flow       메인 턴 → 미니게임 뽑기 → 규칙 화면 → ♣ 컷신 → 미니게임까지 스크린샷
     auto       한 판을 자동으로 끝까지 진행 (단계별 첫 화면 스크린샷, 오류 수집)
     p2p        같은 브라우저 두 탭으로 P2P(?local=1) 방 만들기·들어가기·턴 주고받기
     minigames  미니게임 8종 테이블을 하나씩 열어 스크린샷
   three.js: 환경변수 THREE_JS 경로 → tools/test/.cache/three.min.js → 없으면 CDN.
   결과: 출력폴더(기본 tools/test/out)에 png와 errors.txt */
const fs=require('fs'),path=require('path'),http=require('http'),{execSync}=require('child_process');
let pw;try{pw=require('playwright')}catch(e){try{pw=require(execSync('npm root -g').toString().trim()+'/playwright')}catch(e2){console.error('playwright가 필요해요: npm i -g playwright');process.exit(1)}}
const ROOT=path.resolve(__dirname,'../..'),MODE=process.argv[2]||'flow',OUT=path.resolve(process.argv[3]||path.join(__dirname,'out'));
fs.mkdirSync(OUT,{recursive:true});
const three=process.env.THREE_JS||(fs.existsSync(path.join(__dirname,'.cache/three.min.js'))?path.join(__dirname,'.cache/three.min.js'):null);
execSync('python3 tools/buildgame.py'+(MODE==='p2p'?' --pages':''),{cwd:ROOT,stdio:'ignore'});
let html=fs.readFileSync(path.join(ROOT,MODE==='p2p'?'game/dist/pages/index.html':'game/dist/index.html'),'utf8');
if(three)html=html.replace(/<script src="[^"]*three\.min\.js"><\/script>/,'<script src="/three.min.js"></script>');
if(MODE!=='p2p')html=html.replace('<head>','<head><script>'+fs.readFileSync(path.join(__dirname,'stub.js'),'utf8')+'</script>');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/three.min.js')&&three){r.writeHead(200,{'content-type':'text/javascript'});r.end(fs.readFileSync(three));return}
  r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html)}).listen(0);
const BASE=`http://localhost:${srv.address().port}/`;
const errs=[];const W=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await pw.chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:1280,height:800}});
 const page=async n=>{const p=await ctx.newPage();p.on('pageerror',e=>errs.push(n+': '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_TUNNEL|net::/.test(m.text()))errs.push(n+' console: '+m.text())});return p};
 const shot=async(p,n)=>{await p.screenshot({path:path.join(OUT,n+'.png'),animations:'disabled',timeout:150000});console.log('shot',n)};
 const A=(p,a,d={})=>p.evaluate(([a,d])=>Main.action(a,d),[a,d]);
 try{
 if(MODE==='p2p'){const H=await page('host'),G=await page('guest');
   await H.goto(BASE+'?local=1');await W(1500);await H.fill('#p2pname','방장');await H.click('[data-p="new"]');await W(1500);
   const code=new URL(H.url()).searchParams.get('room');await G.goto(BASE+'?local=1&room='+code);await W(1500);await G.fill('#p2pname','친구');await G.click('[data-p="join"]');await W(2000);
   await H.click('[data-a="sit"]');await W(800);await G.click('[data-a="sit"]');await W(1200);await H.click('[data-a="start"]');await W(2500);
   for(let k=0;k<2;k++){const P=(await H.evaluate(()=>mine(S.turn.seat)))?H:G;await P.click('[data-a="pdeck"]');await W(900);
     await P.evaluate(()=>{sel.clear();sel.add(S.seats[ctl].hand.find(c=>!isItem(c))||S.seats[ctl].hand[0]);UI.render()});await P.click('[data-a="pdisc"]');await W(900);await P.click('[data-a="end"]');await W(1500)}
   const a=await H.evaluate(()=>S.phase+' v'+S.v),g=await G.evaluate(()=>S.phase+' v'+S.v);console.log('host',a,'| guest',g,a===g?'(같음)':'(다름!)');if(a!==g)errs.push('두 탭 상태가 다름');
   await shot(H,'p2p_host');await shot(G,'p2p_guest')}
 else{const p=await page('game');await p.goto(BASE);await W(1500);
   if(MODE!=='flow')await p.evaluate(()=>window.__fast=1);
   for(const a of ['sit','sit','sit','start']){await A(p,a);await W(600)}await W(1200);
   if(MODE==='flow'){await shot(p,'01_main');
     for(let t=0;t<3;t++){await A(p,'pdeck');await W(500);await p.evaluate(()=>{const h=S.seats[ctl].hand;sel.clear();sel.add(h.find(c=>!isItem(c))||h[0])});await A(p,'pdisc');await W(400);await A(p,'end');await W(700)}
     await W(3500);await shot(p,'02_lined');await A(p,'roll');await W(1200);await shot(p,'03_die');await W(3500);await shot(p,'04_monitor');await W(3000);await shot(p,'05_rules');
     await p.evaluate(()=>act(st=>{st.seats[ctl].hand.push('C11');st.seats[ctl].front=[]}));await W(700);await A(p,'club',{c:'C11'});await W(800);await shot(p,'06_club_alert');await W(1300);await shot(p,'07_cutin');await W(7000);await shot(p,'08_rules_again');
     await A(p,'ready');await W(3000);await shot(p,'09_minigame')}
   if(MODE==='minigames'){for(const id of ['balloon','vault','race','count','hold','bomb','auction','rps']){
       await p.evaluate(id=>act(st=>{st.turn=null;st.phase='main';afterMain(st);st.board=Array(6).fill(id)}),id);await W(800);
       await p.evaluate(()=>{ctl=S.first;Main.action('roll',{})});await W(500);await p.evaluate(()=>act(st=>{st.seats.forEach((_,k)=>{if(st.phase==='clubs')readyUp(st,k)})}));await W(4000);
       await shot(p,'mg_'+id);await p.evaluate(()=>act(st=>{if(st.phase!=='mg')return false;endMinigame(st,[st.seats.map((_,k)=>k)])}));await W(1500);
       await p.evaluate(()=>act(st=>{if(st.phase!=='reward')return false;while(st.reward&&st.reward.disp.length)rewardPick(st,st.reward.order[st.reward.pi],st.reward.disp[0])}));await W(1000)}}
   if(MODE==='auto'){const seen=new Set();
     for(let s=0;s<3000;s++){const info=await p.evaluate(()=>{if(!S||busy)return {wait:1};const ph=S.phase;if(ph==='ended')return {ph};const a=whoActs();if(a==null)return {ph,wait:1};ctl=a;sel.clear();
         const A=(x,d={})=>Main.action(x,d),i=a,P=S.seats[i];
         if(ph==='main'){const t=S.turn;if(t.peek){A('dj',{c:t.peek[0]});return {ph}}if(!t.picked){A('pdeck');return {ph}}
           if(t.mustDiscard){sel.add(P.hand.find(c=>!isItem(c))||P.hand[0]);A('pdisc');return {ph}}if(t.trim){P.hand.slice(0,P.hand.length-6).forEach(c=>sel.add(c));A('trim');return {ph}}
           if(!t.token){const cost=costFor(S,i);for(const su of SUITS){const n=P.hand.filter(c=>U(c)===su&&!isItem(c)).sort((x,y)=>R(x)-R(y));if(n.length>=cost&&!canMakeToken(S,i,n.slice(0,cost))){A('qtoken',{s:su});return {ph}}}}A('end');return {ph}}
         if(ph==='defense'){A('nodef');return {ph}}if(ph==='roll'){A('roll');return {ph}}if(ph==='clubs'){if(!Main.rulesShown())return {ph,wait:1};A('ready');return {ph}}
         if(ph==='reward'){A('rpick',{c:S.reward.disp[0]});return {ph}}
         if(ph==='mg'){const m=S.mg,id=m.id;if(id==='hold'){if(m.k<2)A('hroll');else A('hstop')}if(id==='bomb')A('bflip',{k:m.lay.findIndex(Boolean)});
           if(id==='auction'){if(m.step==='pre')A('aready');else A('abid',{c:m.hands[i][0]})}if(id==='balloon')A('blp',{c:m.hands[i].slice().sort((x,y)=>R(x)-R(y))[0]});
           if(id==='rps'){if(m.step==='save')A('onosave');else A('rps',{hand:'RPS'[Math.floor(Math.random()*3)]})}
           if(id==='vault'){if(m.step==='save')A('onosave');else if(m.step==='hide')A('vhide',{z:1+Math.floor(Math.random()*3)});else{ui.vz=m.armL?[1,2]:[1+Math.floor(Math.random()*3)];A('vgo')}}
           if(id==='count')A('cans',{n:2});if(id==='race'){if(m.step==='bet')A('rbet',{s:'SHDC'[Math.floor(Math.random()*4)]});else A('rflip')}return {ph,id}}return {ph}});
       const key=info.ph==='mg'?'mg_'+info.id:info.ph;if(key&&key!=='ended'&&!seen.has(key)&&!info.wait){seen.add(key);await W(800);await shot(p,'auto_'+key)}
       if(info.ph==='ended'){console.log('끝까지 진행함 (단계',s,')');await W(800);await shot(p,'auto_ended');break}await W(info.wait?300:120)}}}
 }catch(e){errs.push('시험 스크립트: '+e.message)}
 fs.writeFileSync(path.join(OUT,'errors.txt'),errs.join('\n'));console.log('오류',errs.length,'개',errs.slice(0,5));await b.close();srv.close();process.exit(errs.length?1:0)})();

/* claude.ai 공유 저장소·로그인을 흉내 내는 대체 코드 (시험용, 한 브라우저 안에서만).
   테이블 상태는 메모리에만 있고, 로그인한 사람은 늘 같은 가짜 사용자 u0 하나다. */
window.claude={use:async n=>{
  if(n==='user')return {id:async()=>'u0',profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{name:'시험'}]))};
  if(n==='db'){let data=null;const subs=[];
    const snap=()=>({exists:!!data,data:()=>JSON.parse(JSON.stringify(data))});
    return {doc:()=>({onSnapshot:f=>{subs.push(f);setTimeout(()=>f(snap()),0)},get:async()=>snap(),
      set:async d=>{data=JSON.parse(JSON.stringify(d));subs.forEach(f=>setTimeout(()=>f(snap()),0))},acquire:async()=>({acquired:true})})}}
  return null}};

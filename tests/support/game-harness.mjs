import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class El {
  constructor(id='', tag='div'){
    this.id=id; this.tagName=tag.toUpperCase(); this.children=[]; this.style={}; this.dataset={};
    this._html=''; this.textContent=''; this.value=''; this.onclick=null; this.parentNode=null;
    this.classList={ _s:new Set(), add:(...c)=>c.forEach(x=>this.classList._s.add(x)), remove:(...c)=>c.forEach(x=>this.classList._s.delete(x)),
      toggle:(c,f)=>{const has=this.classList._s.has(c); const on=f===undefined?!has:!!f; on?this.classList._s.add(c):this.classList._s.delete(c); return on;},
      contains:(c)=>this.classList._s.has(c) };
    this.clientWidth=800; this.offsetHeight=600; this.scrollTop=0; this.scrollHeight=0;
  }
  set innerHTML(v){ this._html=String(v); } get innerHTML(){ return this._html; }
  appendChild(c){ c.parentNode=this; this.children.push(c); return c; }
  removeChild(c){ const i=this.children.indexOf(c); if(i>=0)this.children.splice(i,1); c.parentNode=null; return c; }
  insertBefore(c){ return this.appendChild(c); }
  remove(){ if(this.parentNode)this.parentNode.removeChild(this); }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  closest(){ return null; }
  addEventListener(){}
  removeEventListener(){}
  setAttribute(){} getAttribute(){ return null; }
  hasAttribute(){ return false; }
  focus(){} blur(){}
  getContext(){ return { fillRect(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fill(){}, arc(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, createLinearGradient(){return {addColorStop(){}};} }; }
}
function makeDoc(){
  const byId=new Map();
  const mk=(id,tag)=>{ const e=new El(id,tag); byId.set(id,e); return e; };
  ['game','status','tabsBar','tabMain','tabMaster','tabBounty','tabMission','tabAuction','tabRiddle','tabEquip','tabBag','tabSkill','tabPet','tabChildren','tabConfidante','tabTower','tabAchieve','event','log','toast','sidePanelBody','bagPanelBody','bagQuick','mainGrid','event-wrap'].forEach(id=>mk(id));
  const body=mk('body','body');
  const head=new El('head','head');
  const de=new El('docEl','html');
  return {
    _byId: byId,
    getElementById:(id)=>{ if(byId.has(id))return byId.get(id); const e=new El(id); byId.set(id,e); return e; },
    createElement:(t)=>new El('',t),
    querySelector:(s)=>null,
    querySelectorAll:(s)=>{ if(s==='.tab'){ return ['tabMain','tabMaster','tabBounty','tabMission','tabAuction','tabRiddle','tabEquip','tabBag','tabSkill','tabPet','tabChildren','tabConfidante','tabTower','tabAchieve'].map(id=>byId.get(id)); } return []; },
    addEventListener(){}, removeEventListener(){},
    body, head, documentElement: de, scripts:[], title:'',
  };
}

export async function makeGame(){
  const store=new Map();
  const localStorage={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k), key:i=>Array.from(store.keys())[i], get length(){return store.size;} };
  const document=makeDoc();
  const sb={
    URL, URLSearchParams, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Float32Array, Promise, Error, Date, Math, JSON, Object, Array, Map, Set, setTimeout, clearTimeout, setInterval:()=>0, clearInterval(){}, console,
    crypto:webcrypto, localStorage, AbortController, document,
    location:{href:'https://game.example/index.html',origin:'https://game.example',protocol:'https:'},
    navigator:{webdriver:false,userAgent:'node'},
    performance:{now:()=>Date.now()},
    MutationObserver:class{observe(){}},
    matchMedia:()=>({matches:false,addListener(){},addEventListener(){}}),
    addEventListener(){}, removeEventListener(){},
    alert(){}, prompt(){return null;}, open(){return null;}, scrollTo(){},
    Image:class{},
    btoa:(s)=>Buffer.from(s,'binary').toString('base64'),
    atob:(s)=>Buffer.from(s,'base64').toString('binary'),
    fetch:async()=>new Response('',{status:404}),
    requestAnimationFrame:(f)=>setTimeout(f,0),
    innerWidth:1280, innerHeight:800,
  };
  sb.window=sb; sb.self=sb; sb.globalThis=sb;
  vm.createContext(sb);
  const core=['niukou-text','niukou-vocabulary','niukou-emotion','niukou-empathy','niukou-dialogue','niukou-vocab-integration','niukou-vocab-usage','niukou-cognition','niukou-neural','niukou-imitation','niukou-learning','niukou-guide','niukou-wordbank','niukou-websearch','niukou-choice'];
  const html=await readFile(path.join(root,'index.html'),'utf8');
  // packs: skip network by faking manifest? pack-loader will fetch; provide minimal
  sb.fetch=async(u)=>{ if(String(u).includes('manifest.json')) return new Response(JSON.stringify({schemaVersion:1,minCoreVersion:'1.0.0',packs:[]}),{status:200}); return new Response('',{status:404}); };
  vm.runInContext(await readFile(path.join(root,'core/pack-loader.js'),'utf8'),sb,{filename:'pack-loader.js'});
  await sb.WulinPackRuntime.ready;
  for(const n of core) vm.runInContext(await readFile(path.join(root,`core/${n}.js`),'utf8'),sb,{filename:n+'.js'});
  const start=html.lastIndexOf('<script>')+8, end=html.lastIndexOf('</script>');
  vm.runInContext(html.slice(start,end),sb,{filename:'index-inline.js'});
  return {sb, document, store};
}

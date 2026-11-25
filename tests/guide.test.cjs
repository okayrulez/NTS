const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let JSDOM;
try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require('../../v2-test-runtime/node_modules/jsdom'));}
const dist=path.join(__dirname,'..','dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const run=(w,name)=>w.eval(fs.readFileSync(path.join(dist,name+'.js'),'utf8'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('normal workspace opens the tour menu only on request',()=>{
  const dom=new JSDOM(html,{url:'http://localhost:8845',runScripts:'outside-only'});
  try{
    const w=dom.window;
    w.matchMedia=()=>({matches:false});
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    run(w,'guide-practice');run(w,'guide');
    assert.equal(w.NTSPractice,undefined);
    const guide=w.document.querySelector('#ntsGuide');
    assert.equal(guide.open,false);
    assert.equal(guide.querySelector('iframe'),null);
    w.document.querySelector('#guideHelp').click();
    assert.equal(guide.open,true);assert.equal(guide.querySelectorAll('[data-route]').length,4);
    assert.equal(guide.querySelector('iframe'),null);
  }finally{dom.window.close();}
});

test('practice uses the normal card and handoff UI with no live API calls or local edits',async()=>{
  const dom=new JSDOM('<iframe data-nts-practice></iframe>',{url:'http://localhost:8845',runScripts:'outside-only'});
  try{
    const frame=dom.window.document.querySelector('iframe'),w=frame.contentWindow,d=w.document;
    frame.ntsExample={name:'Örnek model'};d.open();d.write(html);d.close();
    const persisted=JSON.stringify({edits:[{id:'erp-bc-1042-1',userNote:'Özel not'}]});
    w.localStorage.setItem(('numune-tracker-v2:'+require('../server/period.json').since),persisted);
    const network=[];
    w.structuredClone=structuredClone;w.setInterval=()=>0;w.setTimeout=()=>0;
    w.fetch=async url=>{network.push(url);return{json:async()=>url==='brand-taxonomy.json'?{brands:[]}:{groups:[]}};};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    for(const file of ['webscraping-brands','engine','team','designer','guide-practice','universe','app','guide'])run(w,file);
    await flush();
    const card=()=>d.querySelector('[data-id="erp-bc-1042-1"].card');
    assert.ok(card(),d.querySelector('#toast').textContent);card().click();
    assert.equal(d.querySelector('#detailNote').value,'');
    d.querySelector('#detailNote').value='Alıştırma notu';d.querySelector('#saveDetail').click();await flush();
    w.NTSPractice.scanReturn();await w.NumuneV2Debug.poll();
    assert.equal(card().closest('.column').dataset.stage,'quality');
    card().click();
    assert.equal(d.querySelector('#detailNote').value,'Alıştırma notu');
    d.querySelector('#modal').close();
    const store=await w.NTSPractice.request('/api/state');
    const design=store.models[0],key='erp-model:1042';
    await w.NTSPractice.request('/api/models/link',{id:design.id,erpModelKey:key});
    await w.NTSPractice.request('/api/models/handoff',{id:design.id,erpModelKey:key,note:'Örnek karar'});
    assert.equal((await w.NTSPractice.request('/api/state')).models[0].handoff.note,'Örnek karar');
    await assert.rejects(()=>w.NTSPractice.request('/api/canva/sync',{}));
    assert.deepEqual(network,[]);
    assert.equal(w.localStorage.getItem(('numune-tracker-v2:'+require('../server/period.json').since)),persisted);
    assert.equal(d.querySelector('#ntsGuide'),null);
  }finally{dom.window.close();}
});

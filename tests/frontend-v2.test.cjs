const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch{({JSDOM}=require('../../v2-test-runtime/node_modules/jsdom'));}
const root=path.join(__dirname,'..');
function searchIn(app,value){
 const input=app.d.querySelector('#search');
 input.value=value;
 input.dispatchEvent(new app.w.Event('input'));
}
function row(id,stage='sewing',model=10){return {id,model:'Model '+model,modelKey:'erp-model:'+model,recordType:'barcode',barcode:'00001'+model,version:1,brand:'H&M',brandId:4,department:'Divided White',sampleCode:'SMP-'+model,status:'ERP · '+stage,erpPhoto:'photos/test.jpg',erp:{stage,reason:'Verified',movements:[],milestones:{}}};}
async function setup(config={}){
 const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8'),dom=new JSDOM(html,{url:'http://127.0.0.1:8845',runScripts:'outside-only'}),w=dom.window;
 const shared=config.shared||{};
 if(config.legacy)w.localStorage.setItem(('numune-tracker-v2:'+require('../server/period.json').since),JSON.stringify({edits:config.legacy}));
 let rows=config.rows||[row('erp-bc-1-91'),row('erp-bc-2-92','pattern_done',11)],serial=1,delta={full:true,updated:rows,removed:[]};let collections=config.collections||[],models=config.models||[],groups=[],processSettings=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.setInterval=()=>0;w.setTimeout=()=>0;w.DOCUMENT_THUMBNAILS=new Set();w.fetch=async(url,options)=>{
  let data;if(url==='brand-taxonomy.json')data=config.taxonomy||{brands:[{id:'hm',name:'H&M',erpMarkIds:[4],children:[{id:'divided',name:'Divided',departmentNames:['Divided White'],children:[]}]}]};
  else if(url.startsWith('/api/erp/delta')){data={...delta,revision:String(serial++),connected:true,brands:config.brands||[{id:4,name:'H&M'},{id:333,name:'Ek Marka'}],analysis:{},fetchedAt:'2026-11-16T12:00:00Z'};delta={full:false,updated:[],removed:[]};}
  else if(url==='/api/universe/uff')data=config.uff;
  else if(url==='/api/universe/pending')data=config.queue;
  else if(url.startsWith('/api/universe/production?'))data=config.production;
  else if(url==='/api/universe/recent')data=config.catalog;
  else if(url==='/api/state')data={collections,models,groups,processSettings,jobs:{},followups:JSON.parse(JSON.stringify(shared))};
  else if(url==='/api/followups'||url==='/api/followups/import'){
   const b=JSON.parse(options.body), row=shared[b.id]||{id:b.id,...w.TeamFollowup.defaults,versions:{},history:[],version:0};
   const changes=b.changes||b.values;
   if(b.changes&&Object.keys(changes).some(k=>row[k]!==changes[k]&&(row.versions[k]||0)!==(b.versions[k]||0))){
    return {ok:false,json:async()=>({error:'Çakışma',current:JSON.parse(JSON.stringify(row))})};
   }
   const next={...row,...changes,version:row.version+1,versions:{...row.versions},history:[...row.history,...(b.history||[]),{at:'2026-11-20T10:00:00Z',changes}]};
   for(const key of Object.keys(changes))next.versions[key]=next.version;
   shared[b.id]=next;data=JSON.parse(JSON.stringify(next));
  }
  else if(url==='/api/groups'){const g=JSON.parse(options.body);g.id=g.id||'group-test';groups=[g];data=g;}
  else if(url==='/api/process-settings'){const setting=JSON.parse(options.body);processSettings=[setting];data=setting;}
  else if(url==='/api/collections'){const c=JSON.parse(options.body);c.id=c.id||'test-collection';collections=[c];data=c;}
  else if(url==='/api/models/link'||url==='/api/models/handoff'){
   const change=JSON.parse(options.body);
   models=models.map(model=>model.id===change.id?{...model,erpModelKey:change.erpModelKey,
    ...(url.endsWith('/handoff')?{handoff:{erpModelKey:change.erpModelKey,note:change.note}}:{})}:model);
   data=models.find(model=>model.id===change.id);
  }
  else throw Error('unexpected '+url);return{ok:true,json:async()=>data};
 };
 for(const script of ['webscraping-brands','engine','team','designer','catalog-pending','uff','universe','app'])w.eval(fs.readFileSync(path.join(root,'dist',script+'.js'),'utf8'));
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 return {w,d:w.document,app:w.NumuneV2Debug,setCanva(){models=[{id:'canva-test',modelKey:'canva-test',model:'Canva test',source:'canva',retired:false}];collections=[{id:'canva-collection',name:'Canva collection',brandId:'hm',modelKeys:['canva-test'],status:'auto'}];},update(updated,removed=[]){delta={full:false,updated,removed};},close(){w.close();}};
}
test('unchanged delta preserves card, image and focus nodes',async()=>{const x=await setup();try{const n=x.d.querySelector('[data-id="erp-bc-1-91"]'),image=n.querySelector('img');n.focus();await x.app.poll();assert.equal(x.d.querySelector('[data-id="erp-bc-1-91"]'),n);assert.equal(n.querySelector('img'),image);assert.equal(x.d.activeElement,n);}finally{x.close();}});
test('ERP stage move patches one card, keeps unrelated node and open unsaved note',async()=>{const x=await setup();try{const first=x.d.querySelector('[data-id="erp-bc-1-91"]'),second=x.d.querySelector('[data-id="erp-bc-2-92"]'),photo=second.querySelector('img');first.click();const note=x.d.querySelector('#detailNote');note.value='Taslak korunmalı';x.update([row('erp-bc-1-91','quality')]);await x.app.poll();assert.equal(x.d.querySelector('#detailNote'),note);assert.equal(note.value,'Taslak korunmalı');assert.equal(x.d.querySelector('[data-id="erp-bc-1-91"]'),first);assert.equal(first.closest('.column').dataset.stage,'quality');assert.equal(second.querySelector('img'),photo);x.d.querySelector('#saveDetail').click();await new Promise(resolve=>setImmediate(resolve));const r=x.app.records.find(r=>r.id==='erp-bc-1-91');assert.equal(r.stage,'quality');assert.equal(r.userNote,'Taslak korunmalı');assert.equal(r.override,null);}finally{x.close();}});
test('manual drag-equivalent correction survives changed ERP as conflict and persists reload state',async()=>{const x=await setup();try{await x.app.moveCard('erp-bc-1-91','revise');x.update([row('erp-bc-1-91','quality')]);await x.app.poll();const r=x.app.records.find(r=>r.id==='erp-bc-1-91');assert.equal(r.stage,'revise');assert.equal(r.erpStage,'quality');assert.equal(r.conflict,true);const saved=JSON.parse(x.w.localStorage.getItem(('numune-tracker-v2:'+require('../server/period.json').since)));assert.equal(saved.edits.find(r=>r.id==='erp-bc-1-91').override.conflict,true);assert.equal(x.w.localStorage.getItem('numune-tracker-v1'),null);}finally{x.close();}});
test('added and removed records update keyed DOM without duplicates',async()=>{const x=await setup();try{x.update([row('erp-bc-3-93','quality',12)],['erp-bc-1-91']);await x.app.poll();assert.equal(x.d.querySelector('[data-id="erp-bc-1-91"]'),null);assert.equal(x.d.querySelectorAll('[data-id="erp-bc-3-93"]').length,1);assert.equal(x.app.records.length,2);}finally{x.close();}});
test('collection membership counts one model with all barcode versions',async()=>{const x=await setup();try{x.update([row('erp-bc-3-93','quality',10)]);await x.app.poll();x.d.querySelector('#createBtn').click();x.d.querySelector('#collectionName').value='H&M test';const b=x.d.querySelector('#collectionBrand');b.value='hm';b.dispatchEvent(new x.w.Event('change'));const input=x.d.querySelector('#membership input[value="erp-model:10"]');input.checked=true;input.dispatchEvent(new x.w.Event('change',{bubbles:true}));x.d.querySelector('#collectionForm').dispatchEvent(new x.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:x.d.querySelector('#collectionForm button[type=submit]')}));for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));assert.match(x.d.querySelector('.collection-subtitle').textContent,/1 model · 2 numune/);}finally{x.close();}});

test('unmatched Canva design is not counted as a physical sample',async()=>{const x=await setup();try{x.setCanva();await x.app.poll();x.d.querySelector('[data-mode=collections]').click();assert.match(x.d.querySelector('.collection-subtitle').textContent,/1 model · 0 numune/);}finally{x.close();}});

test('owner, target date and approval survive the next ERP delta',async()=>{const x=await setup();try{x.d.querySelector('[data-id=\"erp-bc-1-91\"]').click();x.d.querySelector('#detailOwner').value='Ekip sorumlusu';x.d.querySelector('#detailDate').value='2026-11-20';x.d.querySelector('#detailApproval').value='revise';x.d.querySelector('#saveDetail').click();await new Promise(resolve=>setImmediate(resolve));await x.app.poll();const r=x.app.records.find(r=>r.id==='erp-bc-1-91');assert.equal(r.userOwner,'Ekip sorumlusu');assert.equal(r.targetDate,'2026-11-20');assert.equal(r.approval,'revise');}finally{x.close();}});

test('new process headers and manual fabric are visible without legacy headings',async()=>{const x=await setup();try{assert.equal(x.d.querySelector('.column[data-stage=returned]'),null);for(const id of ['material','intermediate_review','queue','quality','warehouse','shipping'])assert.ok(x.d.querySelector('.column[data-stage='+id+']'));assert.match(x.d.querySelector('.column[data-stage=quality]').textContent,/Kalitede/);}finally{x.close();}});
test('group definition and original-trial classification survive delta',async()=>{const x=await setup();try{x.d.querySelector('#groupsBtn').click();x.d.querySelector('#groupName').value='Teyitli dikim grubu';x.d.querySelector('#groupManager').value='Elif';x.d.querySelector('#groupForm').dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));assert.match(x.d.querySelector('#modalContent').textContent,/Teyitli dikim grubu/);x.d.querySelector('[data-close]').click();x.d.querySelector('[data-id="erp-bc-1-91"]').click();x.d.querySelector('#detailNature').value='trial';x.d.querySelector('#detailKind').value='production';x.d.querySelector('#detailGroup').value='group-test';x.d.querySelector('#saveDetail').click();await new Promise(resolve=>setImmediate(resolve));await x.app.poll();const r=x.app.records.find(r=>r.id==='erp-bc-1-91');assert.equal(r.sampleNature,'trial');assert.equal(r.sewingGroupId,'group-test');assert.equal(r.workKind,'production');}finally{x.close();}});

test('sidebar uses eight home-page brands and logos with no department branches',async()=>{const x=await setup();try{const nodes=[...x.d.querySelectorAll('.main-brands [data-brand]')];assert.equal(nodes.length,8);assert.equal(nodes[0].querySelector('span').textContent,'ZARA');assert.equal(x.d.querySelectorAll('.main-brands img').length,8);assert.equal(x.d.querySelectorAll('#brandTree [data-branch]').length,0);assert.equal(x.d.querySelector('#otherBrands').open,false);assert.match(x.d.querySelector('.other-brand-list').textContent,/Ek Marka/);nodes[1].click();assert.equal(x.d.querySelector('#resultCount').textContent,'2 numune · 2 model');}finally{x.close();}});
test('other brands expand only by explicit toggle and retain open state across ERP refresh',async()=>{const x=await setup();try{const details=x.d.querySelector('#otherBrands');x.d.querySelector('#brandSearch').value='Ek Marka';x.d.querySelector('#brandSearch').dispatchEvent(new x.w.Event('input'));assert.equal(x.d.querySelector('#otherBrands').open,false);const current=x.d.querySelector('#otherBrands');current.open=true;current.dispatchEvent(new x.w.Event('toggle'));await x.app.poll();assert.equal(x.d.querySelector('#otherBrands').open,true);x.d.querySelector('.other-brand-list [data-brand]').click();assert.match(x.d.querySelector('#contextName').textContent,/Ek Marka/);assert.equal(x.d.querySelector('#otherBrands').open,true);}finally{x.close();}});

test('related stages share a heading but keep separate card lists and drop targets',async()=>{
 const x=await setup({rows:[row('sample-queue','queue',12),row('sample-sewing','sewing',13)]});
 try{
  const groups=[...x.d.querySelectorAll('#board .board-process')];
  assert.deepEqual(groups.map(group=>group.querySelector('h2').textContent),['Kalıp','Kesim','Dikim','Ara işlemler']);
  assert.deepEqual(groups.map(group=>[...group.querySelectorAll('.column')].map(lane=>lane.dataset.stage)),[
   ['pattern','pattern_done'],['cutting_in'],['queue','sewing'],['intermediate_review','external']
  ]);
  const [queue,sewing]=groups[2].querySelectorAll('.cards');
  assert.ok(queue.querySelector('[data-id="sample-queue"]'));
  assert.ok(sewing.querySelector('[data-id="sample-sewing"]'));
  const stageFilter=x.d.querySelector('#stageFilter');
  stageFilter.value='sewing';
  stageFilter.dispatchEvent(new x.w.Event('change'));
  assert.deepEqual(groups.map(group=>group.hidden),[true,true,false,true]);
  assert.equal(queue.closest('.column').hidden,true);
  assert.equal(sewing.closest('.column').hidden,false);
  const start=new x.w.Event('dragstart',{bubbles:true});
  start.dataTransfer={setData(){}};
  sewing.querySelector('.card').dispatchEvent(start);
  assert.deepEqual(groups.map(group=>group.hidden),[false,false,false,false]);
  x.d.querySelector('.column[data-stage="pattern_done"]').dispatchEvent(new x.w.Event('drop',{bubbles:true,cancelable:true}));
  assert.equal(x.d.querySelector('[data-id="sample-sewing"]').closest('.column').dataset.stage,'pattern_done');
 }finally{x.close();}
});

const confirmedTaxonomy=()=>JSON.parse(fs.readFileSync(path.join(root,'dist/brand-taxonomy.json'),'utf8'));
test('a sewing design is visible in production and opens from the slide before ERP matching',async()=>{
 const model={id:'canva-unmatched-test',model:'Tasarım A',productionBrief:{code:'012345678',operation:'Dikim'},slideId:'s1'};
 const deck={id:'deck',name:'Yaz',canvaDesignId:'DTEST01',modelKeys:[model.id],canvaSlides:[{id:'s1',number:1,title:'Yeni ürün'}]};
 const x=await setup({models:[model],collections:[deck],rows:[]});
 try{
  const d=x.d;
  const card=d.querySelector('.column[data-stage=queue] .card');
  assert.match(card.textContent,/012345678/);
  assert.match(card.textContent,/ERP eşleşmesi bekliyor/);
  assert.match(d.querySelector('#resultCount').textContent,/0 numune/);
  d.querySelector('[data-mode=collections]').click();
  d.querySelector('[data-open-deck]').click();
  d.querySelector('[data-design-action=slide]').click();
  d.querySelector('[data-design-action=workshop]').click();
  assert.equal(d.querySelector('#title').textContent,'Üretim');
  assert.equal(card.hidden,false);
 }finally{x.close();}
});
const brandRow=(id,brand,brandId,model)=>({...row(id,'sewing',model),brand,brandId,department:'C&A'});

test('confirmed ERP child brands aggregate duplicate mark IDs and model versions under their parent',async()=>{
 const rows=[brandRow('house','HOUSE',100,10),brandRow('bravado-30','BRAVADO',30,11),brandRow('bravado-48','BRAVADO',48,11),brandRow('difuzed','DIFUZED BV',83,12),brandRow('ny','NY APPAREL',99,13),brandRow('ca','C&A',5,14),brandRow('a-brand','A BRAND',444,15),brandRow('arle','Arle',98,16),brandRow('primark','PRIMARK',10,17),brandRow('pull','PULL&BEAR',66,18)];
 const x=await setup({taxonomy:confirmedTaxonomy(),rows,brands:[{id:444,name:'A BRAND'},{id:777,name:'HOUSE'},{id:888,name:'PULL AND BEAR'}]});try{
  const ca='universe-brand-ca',house='universe-brand-house',arle='universe-brand-arle';
  assert.equal(x.d.querySelectorAll('.main-brands [data-brand]').length,8);
  for(const id of [house,'universe-brand-bravado','universe-brand-difuzedbv','universe-brand-nyapparel','universe-brand-abrand'])assert.equal(x.d.querySelector('[data-brand="'+id+'"]'),null);
  assert.equal(x.d.querySelector('[data-brand="erp-brand-777"]'),null);assert.equal(x.d.querySelector('[data-brand="erp-brand-444"]'),null);assert.equal(x.d.querySelector('[data-brand="erp-brand-888"]'),null);
  x.d.querySelector('[data-brand="'+ca+'"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'6 numune · 5 model');
  assert.equal(x.d.querySelector('[data-brand="'+ca+'"] b').textContent,'5');
  x.d.querySelector('[data-expand-brand="'+ca+'"]').click();assert.equal(x.d.querySelector('#brand-children-'+ca).hidden,false);
  assert.equal(x.d.querySelector('#brand-children-'+ca).querySelectorAll('[data-branch]').length,4);
  x.d.querySelector('[data-branch="universe-brand-bravado"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'2 numune · 1 model');
  x.d.querySelector('[data-branch="'+house+'"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'1 numune · 1 model');
  x.update([brandRow('new-house','HOUSE',777,19)]);await x.app.poll();assert.equal(x.d.querySelector('#resultCount').textContent,'2 numune · 2 model');assert.equal(x.d.querySelector('[data-expand-brand="'+ca+'"]').getAttribute('aria-expanded'),'true');
  const others=x.d.querySelector('#otherBrands');others.open=true;others.dispatchEvent(new x.w.Event('toggle'));
  x.d.querySelector('[data-brand="'+arle+'"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'2 numune · 2 model');
  x.d.querySelector('[data-expand-brand="'+arle+'"]').click();x.d.querySelector('[data-branch="universe-brand-abrand"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'1 numune · 1 model');
  x.d.querySelector('[data-brand="universe-brand-pullbear"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'1 numune · 1 model');
  x.d.querySelector('[data-brand="universe-brand-primark"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'1 numune · 1 model');
 }finally{x.close();}
});

test('legacy child-brand collections and Canva models remain visible and editable under the new parent',async()=>{
 const ca='universe-brand-ca',house='universe-brand-house';const collections=[{id:'legacy-house',name:'Eski HOUSE',brandId:house,branchId:'',modelKeys:['legacy-canva'],status:'auto'},{id:'new-house',name:'Yeni HOUSE',brandId:ca,branchId:house,modelKeys:[],status:'auto'}];
 const x=await setup({taxonomy:confirmedTaxonomy(),collections,models:[{id:'legacy-canva',model:'HOUSE tasarım',retired:false}],rows:[]});try{
  x.d.querySelector('[data-brand="'+ca+'"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'0 numune · 0 model');
  x.d.querySelector('[data-expand-brand="'+ca+'"]').click();x.d.querySelector('[data-branch="'+house+'"]').click();
  x.d.querySelector('[data-mode="collections"]').click();assert.equal(x.d.querySelector('#resultCount').textContent,'2 koleksiyon');assert.equal(x.d.querySelectorAll('.collection-group').length,1);assert.equal(x.d.querySelector('.collection-group h2').textContent,'C&A');
  assert.match(x.d.querySelector('.collection-card[data-id=legacy-house]').textContent,/1 model · 0 numune/);
  x.d.querySelector('[data-edit-collection="legacy-house"]').click();assert.equal(x.d.querySelector('#collectionBrand').value,ca);assert.equal(x.d.querySelector('#collectionBranch').value,house);
  assert.equal(x.d.querySelector('#collectionBrand option[value="'+house+'"]'),null);assert.ok(x.d.querySelector('#collectionBranch option[value="'+house+'"]'));
 }finally{x.close();}
});

test('both collection links open a single workspace for manual collections and Canva decks',async()=>{
 const collections=[
  {id:'manual',name:'Bahar',designer:'Ece',status:'auto',modelKeys:[]},
  {id:'deck',name:'Yaz',designer:'Ece',status:'auto',modelKeys:[],canvaDesignId:'DTEST123',canvaSlides:[{id:'s',number:1,title:'Renk paleti'}]},
  {id:'other',name:'Kış',designer:'Ada',status:'auto',modelKeys:[]}
 ];
 const x=await setup({collections});
 try{
  const d=x.d;
  assert.deepEqual([...d.querySelectorAll('nav [data-mode]')].map(b=>b.textContent),['Koleksiyon','Üretim','Üni-verse']);
  for(const hash of ['#tasarimcilar','#koleksiyon']){
   d.querySelector('[data-mode=workshop]').click();
   x.w.location.hash=hash;
   x.w.dispatchEvent(new x.w.Event('hashchange'));
   assert.equal(d.body.dataset.workspace,'collections');
  }
  d.querySelector('[data-design-action=owner][data-key=Ece]').click();
  assert.equal(d.querySelector('#resultCount').textContent,'2 koleksiyon');
  assert.deepEqual([...d.querySelectorAll('.collection-head h3')].map(h=>h.textContent),['Bahar','Yaz']);
  assert.equal(d.querySelectorAll('[data-open-deck]').length,1);
  searchIn(x,'Renk paleti');
  assert.equal(d.querySelector('#resultCount').textContent,'1 koleksiyon');
  assert.equal(d.querySelector('.collection-head h3').textContent,'Yaz');
  d.querySelector('[data-open-deck]').click();
  assert.equal(d.querySelector('#collectionsView').hidden,true);
  d.querySelector('[data-design-action=slide][data-key=s]').click();
  assert.equal(d.querySelector('.design-slide-head h2').textContent,'Renk paleti');
  d.querySelector('[data-design-action=owner][data-key=Ece]').click();
  assert.equal(d.querySelector('#collectionsView').hidden,false);
  assert.equal(d.querySelector('#resultCount').textContent,'2 koleksiyon');
  d.querySelector('[data-design-action=home]').click();
  assert.equal(d.querySelector('#resultCount').textContent,'3 koleksiyon');
 }finally{x.close();}
});

test('designer opens slide 120, lists product data, links the chosen ERP model and hands it to Modelhane',async()=>{
 const canvaSlides=Array.from({length:120},(_,i)=>({id:'page-'+(i+1),title:'Moodboard '+(i+1),number:i+1,photo:'canva-images/slide.jpg'}));
 const model={id:'canva-style-a',modelKey:'canva-style-a',model:'Oversize tee',slideId:'page-120',productLine:'Jersey Essentials'};
 const collection={id:'collection-demo',name:'Bahar',designer:'Tasarım ekibi',canvaDesignId:'DTEST123',canvaSlides,modelKeys:[model.id],status:'auto'};
 const x=await setup({collections:[collection],models:[model]});
 const click=sel=>x.d.querySelector(sel).click();
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
 try{
  assert.equal(x.d.querySelector('#board [data-id="canva-style-a"]'),null);
  click('[data-mode=collections]');click('[data-design-action=owner][data-key]');click('[data-open-deck]');
  assert.equal(x.d.querySelectorAll('[data-design-action=slide]').length,120);
  click('[data-design-action=slide][data-key=page-120]');
  assert.equal(x.d.querySelectorAll('.filmstrip-tile').length,120);
  assert.equal(x.d.querySelector('.filmstrip-tile[aria-current=page]').dataset.key,'page-120');
  click('[data-view=list]');
  assert.match(x.d.querySelector('.design-product-list').textContent,/Jersey Essentials/);
  click('[data-design-action=link]');x.d.querySelector('#linkModel').value='erp-model:10';
  x.d.querySelector('#linkModel').dispatchEvent(new x.w.Event('change'));click('#saveLink');await flush();
  assert.match(x.d.querySelector('.design-product-list').textContent,/Dikimde/);
  click('[data-design-action=handoff]');x.d.querySelector('#handoffNote').value='Yaka revizesi uygulanacak';
  click('#sendHandoff');await flush();
  assert.equal(x.d.body.dataset.workspace,'workshop');
  assert.match(x.d.querySelector('#designHandoffBanner').textContent,/Yaka revizesi/);
  assert.equal(x.d.querySelector('#resultCount').textContent,'1 numune · 1 model');
  click('[data-mode=collections]');click('[data-open-deck]');click('[data-design-action=slide][data-key=page-120]');assert.ok(x.d.querySelector('[data-design-action=workshop]'));
  click('[data-mode=collections]');assert.equal(x.d.body.dataset.workspace,'collections');
 }finally{x.close();}
});

test('attention counts respect filters, manual deadlines and subsequent ERP moves',async()=>{
 const x=await setup({rows:[row('late','sewing',14),row('check','intermediate_review',15)]});
 try{
  const d=x.d, pick=key=>d.querySelector('[data-attention="'+key+'"]');
  d.querySelector('#board [data-id="late"]').click();
  d.querySelector('#detailDate').value='2020-01-01';
  d.querySelector('#detailOwner').value='Takip ekibi';
  d.querySelector('#detailApproval').value='revise';
  d.querySelector('#saveDetail').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pick('overdue').querySelector('b').textContent,'1');
  assert.equal(pick('revision').querySelector('b').textContent,'1');
  assert.equal(pick('review').querySelector('b').textContent,'1');
  pick('overdue').click();
  assert.match(d.querySelector('#resultCount').textContent,/1 numune/);
  d.querySelector('[data-view="list"]').click();
  assert.match(d.querySelector('#listBody [data-id="late"]').textContent,/Takip ekibi/);
  searchIn(x,'missing');
  assert.equal(pick('overdue').querySelector('b').textContent,'0');
  assert.equal(d.querySelector('#empty').hidden,false);
  searchIn(x,'');
  x.update([row('late','shipping',14)]);
  await x.app.poll();
  assert.equal(pick('overdue').getAttribute('aria-pressed'),'true');
  assert.equal(d.querySelector('#empty').hidden,false);
  pick('review').click();
  assert.equal(d.querySelector('#listBody [data-id="check"]').hidden,false);
 }finally{x.close();}
});

test('collection search count and modelhane drill-down agree after unrelated filters',async()=>{
 const c={id:'summer',name:'Yaz 2027',designer:'Elif',brandId:'hm',status:'auto',modelKeys:['erp-model:10']};
 const x=await setup({collections:[c]});
 try{
  const d=x.d;
  d.querySelector('[data-attention="review"]').click();
  d.querySelector('[data-mode="collections"]').click();
  searchIn(x,'yok');
  assert.equal(d.querySelector('#resultCount').textContent,'0 koleksiyon');
  assert.equal(d.querySelector('#statModels').textContent,'0');
  assert.match(d.querySelector('#emptyTitle').textContent,/Eşleşen/);
  searchIn(x,'Elif');
  assert.equal(d.querySelector('#resultCount').textContent,'1 koleksiyon');
  assert.match(d.querySelector('.stage-legend').textContent,/Dikimde 1/);
  d.querySelector('[data-collection-stage="sewing"]').click();
  assert.equal(d.querySelector('#stageFilter').value,'sewing');
  assert.equal(d.querySelector('#collectionFilter').value,'summer');
  assert.equal(d.querySelector('#resultCount').textContent,'1 numune · 1 model');
  assert.equal(d.querySelector('#search').value,'');
  assert.match(d.querySelector('#toggleFilters').textContent,/2/);
 }finally{x.close();}
});

test('designer search deep-links to the right slide by any ERP barcode and steps through the deck',async()=>{
 const m={id:'art',model:'Tişört',erpModelKey:'erp-model:10',slideId:'s2'};
 const c={id:'deck',name:'Yaz',status:'auto',brandId:'hm',designer:'Ece',modelKeys:['art'],canvaDesignId:'DEMO',
  canvaSlides:[{id:'s1',number:1,title:'Kapak'},{id:'s2',number:2,title:'Jersey'}]};
 const x=await setup({collections:[c],models:[m],rows:[
  {...row('a'),barcode:'949822-A'}, {...row('b'),barcode:'949822-B',version:2}]});
 try{
  const d=x.d;
  d.querySelector('[data-mode="collections"]').click();
  assert.equal(d.querySelector('#layoutSwitch').hidden,false);
  searchIn(x,'949822-A');
  const tile=d.querySelector('.slide-results [data-key="s2"]');assert.ok(tile);
  tile.click();assert.match(d.querySelector('.design-slide-head h2').textContent,/Jersey/);
  assert.equal(d.querySelector('#layoutSwitch').hidden,false);
  assert.ok(d.querySelector('.slide-nav button:last-child').disabled);
  d.querySelector('[data-design-action="link"]').click();
  const lookup=d.querySelector('#erpLookup');lookup.value='949822-A';lookup.dispatchEvent(new x.w.Event('input'));
  assert.equal(d.querySelector('#linkModel option').value,'erp-model:10');
  d.querySelector('[data-close]').click();
  d.querySelector('.slide-nav [data-key="s1"]').click();
  assert.equal(d.querySelector('.design-slide-head h2').textContent,'Kapak');
  assert.ok(d.querySelector('.slide-nav button:first-child').disabled);
  d.querySelector('[data-brand="erp-brand-333"]').click();
  assert.equal(d.querySelector('.design-slide-head'),null);
  assert.equal(d.querySelector('#layoutSwitch').hidden,false);
 }finally{x.close();}
});

test('two workstations read shared follow-up, protect a dirty draft and resolve a same-field conflict',async()=>{
 const shared={},a=await setup({shared}),b=await setup({shared});
 const open=x=>x.d.querySelector('#board [data-id="erp-bc-1-91"]').click(),save=async x=>{x.d.querySelector('#saveDetail').click();await new Promise(r=>setImmediate(r));};
 try{
  open(a);open(b);
  b.d.querySelector('#detailNote').value='B taslağı';
  a.d.querySelector('#detailNote').value='A notu';
  a.d.querySelector('#detailOwner').value='Ece';await save(a);await b.app.poll();
  assert.equal(b.d.querySelector('#detailOwner').value,'Ece');
  assert.equal(b.d.querySelector('#detailNote').value,'B taslağı');
  assert.match(b.d.querySelector('#teamHistory').textContent,/A notu/);
  await save(b);assert.match(b.d.querySelector('#teamConflict').textContent,/A notu/);
  b.d.querySelector('#keepDraft').click();await save(b);await a.app.poll();
  assert.equal(a.app.records.find(r=>r.id==='erp-bc-1-91').userNote,'B taslağı');
  open(a);a.d.querySelector('#detailNote').value='';await save(a);await b.app.poll();
  assert.equal(b.app.records.find(r=>r.id==='erp-bc-1-91').userNote,'');
 }finally{a.close();b.close();}
});
test('legacy browser migrates its note history and shared values on first open',async()=>{
 const shared={},id='erp-bc-1-91',legacy=[{id,userOwner:'Eski sorumlu',userNote:'Yeni not',history:[{at:'2026-11-10T10:00:00Z',type:'note',note:'İlk not'}]}];
 const a=await setup({legacy,shared});const b=await setup({shared});
 try{assert.equal(b.app.records.find(r=>r.id===id).userOwner,'Eski sorumlu');assert.ok(shared[id].history.some(h=>h.note==='İlk not'));
  assert.equal(JSON.parse(a.w.localStorage.getItem(('numune-tracker-v2:'+require('../server/period.json').since))).edits[0].userNote,undefined);
 }finally{a.close();b.close();}
});
test('stage duration uses observed Turkish calendar days and rejects future, manual and unverified dates',async()=>{
 const sample=row('erp-bc-1-91');sample.erp.stageEntry={stage:'sewing',source:'barcode',at:'2026-11-15T23:55:00'};
 const x=await setup({rows:[sample]});try{
  const record=x.app.records[0], wait=x.w.TeamFollowup.waiting,asOf='2026-11-15T21:05:00Z';
  assert.equal(wait(record,asOf).days,1);assert.equal(wait({...record,override:{stage:'sewing'}},asOf),null);
  assert.equal(wait(record,'2026-11-14T12:00:00Z'),null);
  assert.equal(wait({...record,erp:{...record.erp,stageEntry:null}},asOf),null);
  assert.match(x.d.querySelector('.stage-wait').textContent,/1 gündür bu aşamada/);
  x.d.querySelector('[data-view=list]').click();assert.match(x.d.querySelector('#listBody .stage-wait').textContent,/1 gündür bu aşamada/);
 }finally{x.close();}
});

test('catalog lists the creation date, opens only linked samples and restores the production view',async()=>{
 const stamp='2026-11-21T12:00:00Z',base={category:'3',addedAt:stamp,brand:'H&M',department:'Divided',styleId:'81',code:'PR-81'};
 const products=[{...base,id:'25',name:'Yeni <ürün>',match:'sample',recordIds:['erp-bc-1-91']},
  {...base,id:'24',name:'Başka model',match:'model',recordIds:['erp-bc-2-92']},
  {...base,id:'23',name:'Dış kayıt',match:'outside',recordIds:[]}];
 const x=await setup({catalog:{available:true,readAt:stamp,products}});
 try{
  const d=x.d;d.querySelector('[data-mode=universe]').click();await new Promise(r=>setImmediate(r));
  assert.equal(d.querySelectorAll('#universeRows .compare-row').length,3);
  assert.equal(d.querySelector('.uni-row time').dateTime,stamp);
  assert.equal(d.querySelector('.compare-row .uni-product strong').textContent,'Yeni <ürün>');
  assert.equal(d.querySelector('#universeComparison a').href,'https://uni-verse.com.tr/admin#/product/edit/25/3');
  const scope=d.querySelector('#universeScope');scope.value='tracked';scope.dispatchEvent(new x.w.Event('change'));
  assert.equal(d.querySelectorAll('.uni-row').length,2);
  scope.value='sample';scope.dispatchEvent(new x.w.Event('change'));assert.equal(d.querySelectorAll('.uni-row').length,1);
  assert.match(d.querySelector('.comparison-status').textContent,/Numune eşleşti/);
  assert.equal(d.querySelectorAll('.comparison-picture').length,2);
  const initial=d.querySelector('.uni-row');await x.app.poll();assert.equal(d.querySelector('.uni-row'),initial);
  d.querySelector('[data-uni-id]').click();d.querySelector('[data-uni-sample]').click();assert.ok(d.querySelector('#detailFields'));
  d.querySelector('[data-close]').click();
  searchIn(x,'eşleşmeyen');assert.equal(d.querySelectorAll('.uni-row').length,0);
  d.querySelector('[data-mode=workshop]').click();assert.equal(d.querySelector('#universeView').hidden,true);
  assert.equal(d.querySelector('#board').hidden,false);
 }finally{x.close();}
});

test('pending list drills into approved barcodes, supports search and can return to recent products',async()=>{
 const rowId='erp-bc-1-91',x=await setup({queue:{pending:[{styleId:'15',recordIds:[rowId]}],unresolved:[],catalogued:1,approved:2,available:true},catalog:{products:[],available:true}});
 try{
  x.w.location.hash='katalog-bekleyenler';await new Promise(r=>setTimeout(r,30));
  assert.equal(x.d.querySelector('#catalogQueue').hidden,false);
  assert.match(x.d.querySelector('#queueCounts').textContent,/1 bekleyen · 1 dönem içinde eşleşti/);
  assert.equal(x.d.querySelector('#catalogRecent').hidden,true);
  searchIn(x,'olmayan');assert.equal(x.d.querySelectorAll('[data-queue-id]').length,0);
  searchIn(x,'SMP-10');x.d.querySelector('[data-queue-id]').click();
  x.d.querySelector('[data-uni-sample]').click();assert.ok(x.d.querySelector('#detailFields'));
  x.d.querySelector('[data-close]').click();x.d.querySelector('[data-catalog="recent"]').click();
  assert.equal(x.d.querySelector('#catalogRecent').hidden,false);
 }finally{x.close();}
});
test('Universe deep link opens an exact barcode and labels main-model matches separately',async()=>{
 const production={styleId:'15',recordIds:['erp-bc-1-91'],match:'sample'};
 const x=await setup({production});
 try{
  x.w.location.hash='uretim?style=15&main=20';await new Promise(r=>setTimeout(r,30));
  assert.ok(x.d.querySelector('#detailFields'));
  x.d.querySelector('[data-close]').click();production.match='model';
  x.w.location.hash='uretim?style=16&main=20';await new Promise(r=>setTimeout(r,30));
  assert.match(x.d.querySelector('#modal').textContent,/Aynı ana model/);
  assert.equal(x.d.querySelector('#detailFields'),null);
 }finally{x.close();}
});

test('Üniteks production is inside the catalogue, searchable, and distinguishes outages from empty data',async()=>{
 const x=await setup({catalog:{products:[],available:true},uff:{available:false,sources:[{brand:'Zara',status:'offline'}],
 products:[{id:'19',brand:'H&M',name:'Jersey',reference:'HM19',url:'https://uff.unitx.com.tr/hm/product/19',addedAt:new Date().toISOString(),evidence:'ERP sipariş eşleşmesi'},
 {id:'20',brand:'Zara',name:'Triko',reference:'DEMO/210',url:'https://uff.unitx.com.tr/zara/product/20',addedAt:new Date().toISOString(),evidence:'Zara tedarikçi kodu'}]}});
 try{
  const d=x.d;d.querySelector('[data-mode=universe]').click();d.querySelector('[data-catalog=uff]').click();
  for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));
  assert.equal(d.querySelector('#catalogUff').hidden,false);assert.equal(d.querySelector('#catalogRecent').hidden,true);
  assert.match(d.querySelector('#uffRows').textContent,/Jersey/);assert.match(d.querySelector('#uffStatus').textContent,/bağlantısı|bağlantı/);
  assert.equal(d.querySelectorAll('#uffRows .uff-row').length,2);
  const evidence=d.querySelector('#uffEvidence');
  evidence.value='Zara tedarikçi kodu';evidence.dispatchEvent(new x.w.Event('change'));
  assert.equal(d.querySelectorAll('#uffRows .uff-row').length,1);
  assert.match(d.querySelector('#uffRows .uff-row').textContent,/Triko/);
  searchIn(x,'not-present');assert.equal(d.querySelectorAll('#uffRows .uff-row').length,0);
  assert.equal(d.querySelector('#uffColumns').hidden,true);
  assert.equal(d.querySelectorAll('[data-mode]').length,3);
 }finally{x.close();}
});
test('long lanes load in batches; search still finds records outside the first batch',async()=>{
 const rows=Array.from({length:23},(_,i)=>row('row-'+i,'sewing',100+i));
 const x=await setup({rows});try{
  const lane=x.d.querySelector('.column[data-stage=sewing]');
  assert.equal(lane.querySelectorAll('.card:not([hidden])').length,16);
  searchIn(x,'Model 122');assert.equal(lane.querySelectorAll('.card:not([hidden])').length,1);
  searchIn(x,'');lane.querySelector('[data-more-stage]').click();
  assert.equal(lane.querySelectorAll('.card:not([hidden])').length,23);
 }finally{x.close();}
});

test('a card moved by hand remains visible when the destination lane is full',async()=>{
 const moved=row('move-from-pattern','pattern',500);
 const pending=Array.from({length:17},(_,i)=>row('already-in-quality-'+i,'quality',600+i));
 const x=await setup({rows:[...pending,moved]});
 try{
  const lane=x.d.querySelector('.column[data-stage=quality]');
  assert.equal(lane.querySelectorAll('.card:not([hidden])').length,16);
  await x.app.moveCard(moved.id,'quality');
  assert.ok(lane.querySelector('[data-id="move-from-pattern"]:not([hidden])'));
  assert.equal(lane.querySelectorAll('.card:not([hidden])').length,16);
 }finally{x.close();}
});

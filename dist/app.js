
(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],T=window.Tracker,TRACKING_SINCE=$('meta[name="nts-tracking-since"]').content,KEY='numune-tracker-v2:'+TRACKING_SINCE;
const demo=window.NTSCollectionDemo;
if(new URLSearchParams(location.search).get('demo')==='koleksiyon'&&!demo&&!window.frameElement?.hasAttribute('data-nts-practice')){
 $('#connection').textContent='Demo yüklenemedi. Sayfayı yeniden aç.';return;
}
const practice=!!demo||window.frameElement?.hasAttribute('data-nts-practice');
const sampleService=demo||window.NTSPractice;
$('#trackingWindow').hidden=!!practice;
const trDay=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short',timeZone:'Europe/Istanbul'});
function periodLabel(){
 if(practice)return;
 const windowText=meta.trackingSince?'Son 30 gün · '+trDay.format(new Date(meta.trackingSince))+' – '+trDay.format(new Date()):'Son 30 gün';
 const label=$('#trackingWindow');
 label.textContent=mode==='collections'?'Canva · '+trDay.format(new Date(TRACKING_SINCE))+' itibarıyla':windowText;
 label.title=mode==='collections'?'Canva tasarımları bu tarihten, üretim dağılımı son 30 günden gelir.':'Bugün dahil son 30 İstanbul takvim günü';
}
if(practice&&!sampleService)throw Error('Tanıtım verisi yüklenemedi.');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal=s=>T.normal(s).trim().replace(/\s+/g,' '),stage=id=>T.stages.find(s=>s.id===id)||{id,name:id||'Diğer hareket',color:'#8aa0ab',description:''};
let raw=new Map(),records=[],state={collections:[],models:[],jobs:{}},taxonomy={brands:[]},erpGroupCatalog=[],brands=[],brandById=new Map(),branchById=new Map(),erpBrandMap=new Map();
let handoffModel='', designerWorkspace=null;
let lastManualMove='';
let attention='', filtersOpen=false;
const workshopFilters=['collectionFilter','stageFilter','versionFilter','workKindFilter','natureFilter','groupFilter'];
const finished=new Set(['shipping','done']);
function attentionFlags(row,today){
 return {
  overdue: Boolean(row.targetDate && row.targetDate < today && !finished.has(row.stage)),
  revision: row.stage==='revise'||row.approval==='revise',
  review: row.conflict||row.stage==='review'||row.stage==='intermediate_review'
 };
}
function localDay(){
 const now=new Date();
 return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
function attentionRows(rows){
 const today=localDay();
 const totals={overdue:0,revision:0,review:0}, shown=[];
 for(const row of rows){
  const flags=attentionFlags(row,today);
  for(const key of Object.keys(totals))if(flags[key])totals[key]++;
  if(!attention||flags[attention])shown.push(row);
 }
 for(const button of $$('#attentionBar button')){
  const key=button.dataset.attention;
  button.setAttribute('aria-pressed',String(attention===key));
  button.querySelector('b').textContent=key?totals[key]:rows.length;
  button.hidden=!!key&&totals[key]===0&&key!==attention;
 }
 return shown;
}
function updateFilterBar(){
 const workshop=mode==='workshop',designing=mode==='collections'&&!!designerWorkspace?.activeDeck;
 const toolbar=$('.toolbar'),target=workshop?$('.hero'):$('.workspace main > .panel');
 if(toolbar.parentNode!==target)target.prepend(toolbar);
 const keys=workshop?workshopFilters:['collectionStateFilter'];
 const active=keys.filter(id=>$('#'+id).value).length+Number($('#allScope').checked)+Number(workshop&&$('#allStages').checked)+Number(workshop&&!!attention);
 $('#toggleFilters').textContent='Filtreler'+(active?' ('+active+')':'');
 $('#toggleFilters').hidden=designing;
 $('#toggleFilters').setAttribute('aria-expanded',String(filtersOpen));
 $('#productionFilters').hidden=designing||!filtersOpen;
 $('#attentionBar').hidden=!workshop||!filtersOpen;
}
function resetFilters(){
 handoffModel=attention='';
 for(const id of ['search','collectionStateFilter',...workshopFilters])$('#'+id).value='';
 $('#allScope').checked=$('#allStages').checked=false;
}
let revision='',meta={},mode='workshop',view='board',brandFilter='',branchFilter='',otherBrandsOpen=false,openBrandBranches=new Set(),dragged=null,fetching=false,selected=null,openedStage=null,localEdits=new Map(),cardNodes=new Map(),rowNodes=new Map(),collectionNodes=new Map();
const editsKey=demo?'nts:collection-demo:edits:v1':KEY;
try{if(!practice||demo)for(const r of JSON.parse((demo?sessionStorage:localStorage).getItem(editsKey)||'{"edits":[]}').edits||[])localEdits.set(r.id,r);}catch{}
async function api(path,data){if(practice)return sampleService.request(path,data);const response=await fetch(path,{cache:'no-store',...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,trackingSince:TRACKING_SINCE})}:{})});const value=await response.json();if(!response.ok){const error=Error(value.error||'İşlem tamamlanamadı.');error.current=value.current;throw error;}return value;}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function date(value){
 if(!value)return 'Tarih yok';
 const stamp=/(?:Z|[+-]\d\d:\d\d)$/i.test(value)?value:value+'+03:00';
 return new Date(stamp).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'});
}
function localSave(){if(practice&&!demo)return;try{(demo?sessionStorage:localStorage).setItem(editsKey,JSON.stringify({schemaVersion:2,edits:[...localEdits.values()]}));if(!demo)$('#saveStatus').textContent='Sorumlu, hedef ve revizyonlar ekipçe paylaşılır.';}catch{toast('Yerel kayıt alanı dolu.');}}
const team=window.TeamFollowup;
let detailBase=null;
function sharedRow(id){return state.followups?.[id]||{...team.defaults,versions:{},history:[],version:0};}
function acceptShared(row){
 state.followups??={};
 const old=state.followups[row.id];
 if(row.version<(old?.version||0))return;
 state.followups[row.id]=row;
 if(mode==='universe'&&catalogTab==='pending'&&old?.approval!==row.approval)catalogQueue.load();
}
function retain(r){
 localEdits.set(r.id,{...localEdits.get(r.id),id:r.id,override:r.override||null,sampleNature:r.sampleNature||'',workKind:r.workKind||'',sewingGroupId:r.sewingGroupId||'',history:r.history||[]});
 localSave();
}
async function importLocal(next){
 for(const [id,edit] of localEdits){
  if(!Object.keys(team.fields).some(k=>k in edit)&&!(edit.history||[]).some(h=>['note','detail'].includes(h.type)))continue;
  const payload=team.legacy(edit);
  if(Object.keys(payload.values).length||payload.history.length){
   try{const row=await api('/api/followups/import',payload);next.followups[id]=row;}
   catch(error){$('#saveStatus').textContent='Eski takip kayıtlarının bir kısmı bu tarayıcıda aktarım bekliyor.';continue;}
  }
  const cleaned={...edit,history:(edit.history||[]).filter(h=>!['note','detail'].includes(h.type))};
  for(const key of Object.keys(team.fields))delete cleaned[key];
  localEdits.set(id,cleaned);
  localSave();
 }
}
function reconcile(){
 let editsChanged=false;
 const old=new Map(records.map(r=>[r.id,r]));let incoming=[...raw.values()];
 const linkedBriefs=new Map();
 for(const m of state.models.filter(model=>!model.retired)){
  const brief=m.productionBrief;
  if(m.erpModelKey){
   if(brief){
    if(!linkedBriefs.has(m.erpModelKey))linkedBriefs.set(m.erpModelKey,new Set());
    linkedBriefs.get(m.erpModelKey).add(brief.code+' · '+brief.operation);
   }
   continue;
  }
  const c=state.collections.find(c=>c.modelKeys.includes(m.id));
  const lane={Dikim:'queue',Kesim:'cutting_in','Kalıp':'pattern'}[brief?.operation]||'design';
  const reason=m.matchState==='ambiguous'?'Birden fazla ERP modeli bu kodu taşıyor. Doğru modeli seç.':'ERP modeli eşleştirmesi bekleniyor.';
  incoming.push({...m,recordType:'canva',modelKey:m.id,sampleCode:brief?.code||'',status:'Tasarım · Canva',
   brand:branchById.get(branchById.get(c?.branchId)?.erpBrandId||c?.brandId)?.name||brands.find(b=>b.id===c?.brandId)?.name||'Atanmamış',
   brandCanonicalId:c?.brandId,branchId:c?.branchId,barcode:'',sample:'Canva tasarımı',
   erp:{stage:lane,reason,movements:[],milestones:{}}});
 }
 incoming=incoming.map(row=>linkedBriefs.has(row.modelKey)?{...row,canvaPlans:[...linkedBriefs.get(row.modelKey)]}:row);
 records=incoming.map(row=>{const previous=old.get(row.id),saved=previous||localEdits.get(row.id);let override=saved?.override?{...saved.override}:null;
 if(override&&override.stage===row.erp?.stage)override=null;else if(override&&row.erp?.stage!==(override.baseStage||previous?.erpStage))override.conflict=true;
 let history=saved?.history||[];if(override&&row.erp?.workflowVersion===3&&['cutting','returned'].includes(override.stage)){const from=override.stage;override={...override,stage:from==='returned'?'quality':row.erp.intermediateSelected===true?'external':row.erp.intermediateSelected===false?'queue':'intermediate_review',conflict:true,migratedFrom:from};history=[...history,{at:new Date().toISOString(),type:'workflow',note:'Süreç revizyonu: önceki elle aşama yeni akışa uyarlandı.',from,to:override.stage}].slice(-250);}if(previous&&previous.erpStage!==row.erp?.stage)history=[...history,{at:new Date().toISOString(),type:'erp',from:previous.erpStage,to:row.erp?.stage,note:row.erp?.reason}].slice(-250);
 const r=T.decorate({...row,override,...Object.fromEntries(Object.keys(team.fields).map(k=>[k,state.followups?.[row.id]?.[k]??localEdits.get(row.id)?.[k]??team.defaults[k]])),sampleNature:saved?.sampleNature||row.sampleNature||'',workKind:saved?.workKind||(row.recordType==='canva'?'collection':'production'),sewingGroupId:saved?.sewingGroupId||'',history});
 if(saved&&(JSON.stringify(saved.override)!==JSON.stringify(override)||previous&&previous.erpStage!==r.erpStage)){localEdits.set(r.id,{...localEdits.get(r.id),id:r.id,override,sampleNature:r.sampleNature,workKind:r.workKind,sewingGroupId:r.sewingGroupId,history:r.history});editsChanged=true;}return r;});
 if(editsChanged)localSave();
}
function buildBrands(){
 brands=taxonomy.brands.map(b=>({...b}));const featured=window.WEBSCRAPING_BRANDS||[];for(const [index,entry] of featured.entries()){let brand=brands.find(b=>entry.aliases.some(a=>normal(a)===normal(b.name)||(b.erpAliases||[]).some(alias=>normal(alias)===normal(a))));if(!brand){brand={id:'web-brand-'+index,name:entry.name,erpAliases:entry.aliases,erpMarkIds:[],children:[]};brands.push(brand);}brand.logoUrl=entry.logoUrl;brand.sidebarMainOrder=index;brand.erpAliases=[...new Set([...(brand.erpAliases||[]),...entry.aliases])];}const used=new Set();erpBrandMap.clear();brandById.clear();branchById.clear();
 for(const b of brands)for(const id of b.erpMarkIds||[]){erpBrandMap.set(String(id),b.id);used.add(String(id));}
 for(const item of meta.brands||[]){const id=String(item.id??item.RecId),name=item.name||item.Explanation||item.MarkName;if(used.has(id))continue;const match=brands.find(b=>(b.erpAliases||[b.name]).some(a=>normal(a)===normal(name)));if(match){erpBrandMap.set(id,match.id);continue;}const key='erp-brand-'+id;brands.push({id:key,name,erpMarkIds:[Number(id)],children:[]});erpBrandMap.set(id,key);}
 brands.sort((a,b)=>a.name.localeCompare(b.name,'tr'));for(const b of brands){brandById.set(b.id,b);const walk=(nodes,erpBrandId='')=>{for(const n of nodes||[]){const source=n.kind==='erp-brand'?n.id:erpBrandId;branchById.set(n.id,{...n,brandId:b.id,erpBrandId:source});walk(n.children,source);}};walk(b.children);}
 $('#brandTotal').textContent=String((meta.brands||[]).length||taxonomy.erpCatalog?.totalRows||brands.length);
}
function canonicalBrand(id){const branch=branchById.get(id);return branch?.kind==='erp-brand'?branch.brandId:id;}
function recordBrand(r){return canonicalBrand(r.brandCanonicalId)||erpBrandMap.get(String(r.brandId))||brands.find(b=>(b.erpAliases||[b.name]).some(a=>normal(a)===normal(r.brand)))?.id||'';}
function branchNames(id){const b=branchById.get(id);if(!b)return[];return [...(b.departmentNames||[b.name]),...(b.children||[]).flatMap(c=>branchNames(c.id))].map(normal);}
function inBranch(r,id){if(!id||r.branchId===id)return true;const b=branchById.get(id);if(b?.kind==='erp-brand')return r.brandCanonicalId===id||branchById.get(r.branchId)?.erpBrandId===id||(b.erpMarkIds||[]).some(mark=>String(mark)===String(r.brandId))||(b.erpAliases||[b.name]).some(alias=>normal(alias)===normal(r.brand));return branchNames(id).includes(normal(r.department));}
function collectionBranch(c){return c.branchId||(branchById.get(c.brandId)?.kind==='erp-brand'?c.brandId:'');}
function collectionInBranch(c,id){return !id||c.brandId===id||c.branchId===id||branchById.get(c.branchId)?.erpBrandId===id;}
function members(c){const keys=new Set(c.modelKeys||[]);for(const m of state.models)if(!m.retired&&keys.has(m.id)&&m.erpModelKey)keys.add(m.erpModelKey);return records.filter(r=>keys.has(r.modelKey));}
function collectionsFor(r){return state.collections.filter(c=>c.status!=='archived'&&(c.modelKeys.includes(r.modelKey)||state.models.some(m=>!m.retired&&m.erpModelKey===r.modelKey&&c.modelKeys.includes(m.id))));}
function scopeRows(){return records.filter(r=>(mode!=='workshop'||r.recordType!=='canva'||r.productionBrief)&&(!handoffModel||mode!=='workshop'||r.modelKey===handoffModel)&&($('#allScope').checked||!r.hidden||r.modelKey===handoffModel)&&(!brandFilter||recordBrand(r)===brandFilter)&&inBranch(r,branchFilter));}
function filteredRows(){const q=normal($('#search').value),collection=$('#collectionFilter').value;return scopeRows().filter(r=>(!$('#workKindFilter').value||r.workKind===$('#workKindFilter').value)&&(!$('#natureFilter').value||($('#natureFilter').value==='unknown'?!r.sampleNature:r.sampleNature===$('#natureFilter').value))&&(!$('#groupFilter').value||($('#groupFilter').value==='unassigned'?!r.sewingGroupId:r.sewingGroupId===$('#groupFilter').value))&&(!$('#stageFilter').value||r.stage===$('#stageFilter').value)&&(!$('#versionFilter').value||String(r.version)===$('#versionFilter').value)&&(!collection||(collection==='unassigned'?!collectionsFor(r).length:collectionsFor(r).some(c=>c.id===collection)))&&(!q||normal([r.model,r.barcode,r.sampleCode,r.mainCode,...(r.canvaPlans||[]),r.brand,r.department,r.userNote,r.userOwner,r.erp?.workflowMilestones?.[r.erpStage]?.employeeName,...(r.erp?.movements||[]).flatMap(m=>[m.employeeName,m.createdByName]),...collectionsFor(r).map(c=>c.name)].join(' ')).includes(q)));}
function photo(r){const fallback=state.models.find(m=>!m.retired&&m.erpModelKey===r.modelKey&&m.photo)?.photo;return [r.erpPhoto,r.erp?.photo,r.photo,fallback].find(p=>p&&!window.DOCUMENT_THUMBNAILS?.has(p)&&!window.DOCUMENT_THUMBNAILS?.has(p.split('/').pop()))||null;}
function image(r){const p=photo(r);return p?'<img src="'+esc(p)+'" alt="'+esc(r.model)+'" loading="lazy" draggable="true">':'<div class="placeholder">♧<small>Görsel henüz yok</small></div>';}
function sourceLabel(r){return r.recordType==='canva'?'Canva':r.recordType==='sample'?'Barkod bekliyor':'ERP · Rapor 211';}
function person(r){return r.erp?.workflowMilestones?.[r.erpStage]||r.erp?.milestones?.[r.erpStage]||[...(r.erp?.movements||[])].reverse().find(m=>m.stage)||{};}
function cardMarkup(r){
 const actor=person(r),picture=photo(r);
 const group=(state.groups||[]).find(g=>g.id===r.sewingGroupId)?.name;
 const scanned=[...(r.erp?.movements||[])].reverse().find(movement=>movement.at)?.at;
 const edited=scanned||r.erp?.activityAt;
 const code=r.sampleCode||r.mainCode||r.model;
 const flags=r.override?'<span class="tag manual">'+(r.conflict?'ERP farklı':'Elle düzeltildi')+'</span>':'';
 const operator=actor.employeeName||actor.createdByName;
 return '<div class="card-face'+(picture?' has-photo':'')+'">'+(picture?'<div class="photo">'+image(r)+'</div>':'')+'<div class="card-body">'+
  '<div class="card-brand">'+esc(r.brand||'')+flags+'</div><h3>'+esc(code)+'</h3>'+
  (r.barcode||r.version!=null?'<div class="barcode-line"><span class="barcode">'+esc(r.barcode||'')+'</span>'+
    (r.version!=null?'<b class="version-chip">V'+esc(r.version)+'</b>':'')+'</div>':'')+
  (r.model!==code?'<div class="card-model">'+esc(r.model)+'</div>':'')+
  (r.productionBrief?'<div class="card-code">Canva · '+esc(r.productionBrief.operation)+' planı · ERP eşleşmesi bekliyor</div>':'')+
  (operator?'<div class="person" title="'+(actor.employeeName?'İşlem personeli':'ERP kullanıcısı')+'">'+esc(operator)+'</div>':'')+
  (group?'<div class="card-code">'+esc(group)+'</div>':'')+'</div></div>'+
  (edited?'<time class="card-edited" datetime="'+esc(edited)+'">'+(scanned?'Son okutma · ':'ERP değişikliği · ')+esc(date(edited))+'</time>':'')+
  followupMarkup(r)+
  ((r.erp?.vouchers||[]).some(v=>v.AutomaticEligible===false)?'<div class="card-note">Fiş teyidi bekleniyor</div>':'');
}
function followupMarkup(row){
 const fields=[];
 const wait=team.waiting(row,meta.fetchedAt);
 if(wait){
  const text=wait.days===0?'Bugün girdi':wait.days+' gündür bu aşamada';
  fields.push('<span class="stage-wait" title="'+esc(wait.source+' · '+wait.entered+' · Son okuma '+wait.asOf)+'">'+esc(text)+'</span>');
 }
 if(row.conflict)fields.push('<span class="review-reason">ERP aşaması farklı · '+esc(stage(row.erpStage).name)+'</span>');
 else if(row.stage==='review')fields.push('<span class="review-reason">'+esc(row.reason||'ERP hareketini kontrol et.')+'</span>');
 if(row.userOwner)fields.push('<span>Takip sorumlusu <b>'+esc(row.userOwner)+'</b></span>');
 if(row.targetDate){
  const overdue=attentionFlags(row,localDay()).overdue;
  fields.push('<span class="'+(overdue?'due-late':'')+'">'+(overdue?'Hedefi geçti':'Hedef bitiş')+' <b>'+esc(row.targetDate.split('-').reverse().join('.'))+'</b></span>');
 }
 if(row.approval==='revise')fields.push('<span>Revize istendi</span>');
 return fields.length?'<div class="followup">'+fields.join('')+'</div>':'';
}
function patchNode(map,id,container,markup,tag,cls){let node=map.get(id);if(!node){node=document.createElement(tag);node.className=cls;if(cls==='card')node.draggable=true;node.dataset.id=id;node.tabIndex=0;map.set(id,node);}if(node._markup!==markup){const focused=node.contains(document.activeElement);node.innerHTML=markup;node._markup=markup;if(focused)node.focus({preventScroll:true});}if(node.parentNode!==container){const moved=!!node.parentNode;container.append(node);if(moved&&node.animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)node.animate([{outline:'2px solid #278477'},{outline:'2px solid transparent'}],{duration:1300});}node.hidden=false;return node;}
const laneLimits=new Map();let listLimit=60;
const mainStages=['pattern','pattern_done','cutting_in','queue','sewing','quality'];
const boardProcesses={
 pattern:{name:'Kalıp',stages:['pattern','pattern_done']},
 cutting_in:{name:'Kesim',stages:['cutting_in']},
 queue:{name:'Dikim',stages:['queue','sewing']},
 intermediate_review:{name:'Ara işlemler',stages:['intermediate_review','external']}
};
function initColumns(){
 const board=$('#board');
 const nestedStages=new Set(Object.values(boardProcesses).flatMap(process=>process.stages.slice(1)));
 function addColumn(item,parent){
  const col=document.createElement('section');
  col.className='column';col.dataset.stage=item.id;col.style.setProperty('--stage-color',item.color);
  col.innerHTML='<div class="column-header"><span>'+esc(item.name)+'</span><b class="count">0</b>'+
   '<button class="info" data-info="'+esc(item.description)+'" title="'+esc(item.description)+'" aria-label="'+esc(item.name)+' açıklaması">···</button></div>'+
   '<span class="drop-hint" aria-hidden="true">Buraya bırak · '+esc(item.name)+'</span><div class="cards"></div>'+
   '<button type="button" class="more-rows" data-more-stage="'+esc(item.id)+'" hidden></button>';
  parent.append(col);
 }
 const orderedStages=['pattern','cutting_in','queue','quality','intermediate_review'];
 const otherStages=T.stages.filter(item=>!item.legacy&&!nestedStages.has(item.id)&&!orderedStages.includes(item.id));
 for(const item of [...orderedStages.map(stage),...otherStages]){
  const process=boardProcesses[item.id];
  if(!process){addColumn(item,board);continue;}
  const group=document.createElement('section');
  const heading=document.createElement('h2');
  const lanes=document.createElement('div');
  group.className='board-process';
  heading.className='process-title';
  heading.id='process-title-'+item.id;
  heading.textContent=process.name;
  group.setAttribute('aria-labelledby',heading.id);
  lanes.className='process-lanes';
  for(const id of process.stages)addColumn(stage(id),lanes);
  group.append(heading,lanes);
  board.append(group);
 }
}
function renderSidebar(){
 $('#mobileBrands').textContent=branchById.get(branchFilter)?.name||brandById.get(brandFilter)?.name||'Markalar';

 const q=normal($('#brandSearch').value),counts=new Map(),visible=records.filter(r=>$('#allScope').checked||!r.hidden);
 const collectionMode=mode==='collections';
 const tally=(brand,id)=>{if(!counts.has(brand))counts.set(brand,new Set());counts.get(brand).add(id);};
 if(collectionMode){for(const c of state.collections)if(c.status!=='archived')tally(canonicalBrand(c.brandId),c.id);}
 else if(mode==='workshop'){for(const r of visible)tally(recordBrand(r),r.modelKey);}
 function countLabel(n){return n?'<b title="'+(collectionMode?'Aktif görünümdeki koleksiyonlar':'ERP modelleri')+'">'+n+'</b>':'';}
 const matches=b=>!q||normal([b.name,...(b.erpAliases||[])].join(' ')).includes(q);
 const main=brands.filter(b=>b.sidebarMainOrder!==undefined).sort((a,b)=>a.sidebarMainOrder-b.sidebarMainOrder),other=brands.filter(b=>b.sidebarMainOrder===undefined);
 const row=b=>{const children=(b.children||[]).filter(n=>n.kind==='erp-brand'),expanded=openBrandBranches.has(b.id),listId='brand-children-'+b.id;return '<div class="brand-wrap"><div class="brand-line"><button class="brand-row '+(brandFilter===b.id&&!branchFilter?'selected':'')+'" data-brand="'+esc(b.id)+'"'+(brandFilter===b.id&&!branchFilter?' aria-current="true"':'')+'>'+(b.logoUrl?'<img src="'+esc(b.logoUrl)+'" alt="">':'<span class="brand-symbol">'+esc(b.name.slice(0,2).toUpperCase())+'</span>')+'<span>'+esc(b.name)+'</span>'+countLabel(counts.get(b.id)?.size)+'</button>'+(children.length?'<button class="brand-expand" data-expand-brand="'+esc(b.id)+'" aria-expanded="'+expanded+'" aria-controls="'+esc(listId)+'" aria-label="'+esc(b.name)+' alt markalarını '+(expanded?'gizle':'göster')+'">'+(expanded?'⌄':'›')+'</button>':'')+'</div>'+(children.length?'<div class="brand-children" id="'+esc(listId)+'" '+(expanded?'':'hidden')+'>'+children.map(child=>'<button class="brand-child '+(branchFilter===child.id?'selected':'')+'" data-branch="'+esc(child.id)+'"'+(branchFilter===child.id?' aria-current="true"':'')+'><span>'+esc(child.name)+'</span>'+countLabel(collectionMode?state.collections.filter(c=>c.status!=='archived'&&collectionInBranch(c,child.id)).length:mode==='workshop'?new Set(visible.filter(r=>recordBrand(r)===b.id&&inBranch(r,child.id)).map(r=>r.modelKey)).size:0)+'</button>').join('')+'</div>':'')+'</div>';};
 const mainHtml=main.filter(matches).map(row).join(''),otherMatches=other.filter(matches);
 const currentOther=other.find(b=>b.id===brandFilter);
 const html='<div class="main-brands">'+mainHtml+(!mainHtml?'<p class="brand-empty">Ana markalarda eşleşme yok.</p>':'')+'</div><details id="otherBrands" class="other-brands" '+(otherBrandsOpen?'open':'')+'><summary aria-label="Diğer markaları göster"><span class="other-arrow" aria-hidden="true">›</span><span>Diğer markalar</span><b>'+otherMatches.length+'</b></summary>'+(!otherBrandsOpen&&currentOther?'<small class="other-selected">Seçili: '+esc(currentOther.name)+'</small>':'')+'<div class="other-brand-list">'+otherMatches.map(row).join('')+(!otherMatches.length?'<p class="brand-empty">Eşleşen marka yok.</p>':'')+'</div></details>';
 if($('#brandTree')._html!==html){const top=$('#brandTree').scrollTop;$('#brandTree').innerHTML=html;$('#brandTree')._html=html;$('#brandTree').scrollTop=top;const disclosure=$('#otherBrands');disclosure.addEventListener('toggle',()=>{if(disclosure.isConnected)otherBrandsOpen=disclosure.open;});}
 $('#allBrands').classList.toggle('selected',!brandFilter);
}
function updateOptions(){
 const group=$('#groupFilter'),gv=group.value,gh=groupOptions(gv,true);if(group._html!==gh){group.innerHTML=gh;group.value=gv;group._html=gh;}
 const select=$('#collectionFilter'),value=select.value,html='<option value="">Tüm koleksiyonlar</option><option value="unassigned">Koleksiyona atanmamış</option>'+state.collections.filter(c=>c.status!=='archived').map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');if(select._html!==html){select.innerHTML=html;select._html=html;select.value=[...select.options].some(o=>o.value===value)?value:'';}
 const v=$('#versionFilter'),old=v.value,versions=[...new Set(records.map(r=>r.version).filter(v=>v!=null))].sort((a,b)=>a-b),vh='<option value="">Tüm versiyonlar</option>'+versions.map(x=>'<option value="'+esc(x)+'">V'+esc(x)+'</option>').join('');if(v._html!==vh){v.innerHTML=vh;v._html=vh;v.value=old;}
}
function collectionStatus(c){if(c.status!=='auto')return{id:c.status,label:{active:'Aktif',paused:'Beklemede',completed:'Tamamlandı',archived:'Arşiv'}[c.status]||c.status};const rows=members(c),done=rows.length>0&&rows.every(r=>['done','shipping'].includes(r.stage));return{id:done?'completed':'active',label:done?'Tamamlandı':'Aktif'};}
function openCatalogSamples(p){
  const ids=new Set(p.recordIds),linked=records.filter(r=>ids.has(r.id));
  openModal(p.name||'Üni-verse ürünü','<p>'+esc(p.context||(p.match==='sample'?'Bu ERP numunesine bağlı kayıtlar':'Aynı ana modelde izlenen numuneler'))+'</p>'+
   linked.map(r=>'<button class="uni-sample" data-uni-sample="'+esc(r.id)+'"><strong>'+esc(r.sampleCode||r.model)+'</strong> · '+esc(r.barcode||'Barkod bekliyor')+' · V'+esc(r.version??'—')+' · '+esc(stage(r.stage).name)+'</button>').join(''));
  for(const btn of $$('#modal [data-uni-sample]'))btn.onclick=()=>openDetail(btn.dataset.uniSample);
 }
let catalogTab='recent';
const catalogOptions={api,esc,normal,date,stageName:id=>stage(id).name,refresh:()=>{if(mode==='universe')render();},openSamples:openCatalogSamples};
const universeView=window.createUniverseFeed?.(catalogOptions);
const catalogQueue=window.createCatalogQueue?.(catalogOptions);
const uffView=window.createUffFeed?.(catalogOptions);
function activeCatalog(){return {pending:catalogQueue,uff:uffView,recent:universeView}[catalogTab];}
function selectCatalog(tab){
 catalogTab=tab;mode='universe';$('#search').value='';handoffModel='';activeCatalog().load();render();
}
$$('[data-catalog]').forEach(b=>b.onclick=()=>{if(catalogTab!==b.dataset.catalog)selectCatalog(b.dataset.catalog);});
function renderPeriodModels(){
 const box=$('#periodModels'),q=normal($('#search').value);
 const items=mode==='workshop'&&!attention&&!handoffModel&&!workshopFilters.some(id=>$('#'+id).value)
  ?(meta.analysis?.mainModels||[]).filter(m=>(!brandFilter||recordBrand(m)===brandFilter)&&inBranch(m,branchFilter)&&(!q||normal([m.model,m.code,m.brand].join(' ')).includes(q))):[];
 box.hidden=!items.length;
 if(!items.length)return;
 box.querySelector('summary').textContent=items.length+' ERP modeli · Bu dönemde numune hareketi yok';
 const html=items.map(m=>'<li><strong>'+esc(m.model)+'</strong> '+esc([m.code,m.brand].filter(Boolean).join(' · '))+'</li>').join('');
 if(box.querySelector('ul').innerHTML!==html)box.querySelector('ul').innerHTML=html;
}
function render(){
 $('#moreList').hidden=true;periodLabel();renderPeriodModels();
 document.body.dataset.workspace=mode;
 const collectionMode=mode==='collections',catalog=mode==='universe';
 const visibleCollections=state.collections.filter(c=>(!brandFilter||canonicalBrand(c.brandId)===brandFilter)&&collectionInBranch(c,branchFilter)&&
  (c.status!=='archived'||collectionMode&&$('#collectionStateFilter').value==='archived')&&
  (!collectionMode||!$('#collectionStateFilter').value||collectionStatus(c).id===$('#collectionStateFilter').value));
 if(collectionMode){
  designerWorkspace.search($('#search').value);
  designerWorkspace.render({...state,collections:visibleCollections},records,view);
 }
 const insideDeck=collectionMode&&!!designerWorkspace.activeDeck;
 const archivedCount=collectionMode?state.collections.filter(c=>c.status==='archived').length:0;
 const firstCollection=collectionMode&&!insideDeck&&state.collections.length===archivedCount&&!$('#collectionStateFilter').value;
 $('#collectionArchive').hidden=!firstCollection||!archivedCount;
 $('#collectionArchive').textContent='Arşivi aç ('+archivedCount+')';
 document.body.classList.toggle('first-collection',firstCollection);
 $('#collectionStart').hidden=!firstCollection;
 $('#universeView').hidden=!catalog;
 $('#designerView').hidden=!collectionMode;
 updateFilterBar();
 const workshop=mode==='workshop';
 const statusArea=workshop?$('#productionInfo'):$('.topbar > div');
 for(const id of ['teamUrl','connection','groupsBtn','analysisBtn']){
  const control=$('#'+id);
  if(control.parentNode!==statusArea)statusArea.append(control);
 }
 const demoLink=$('#demoEntry'),demoArea=workshop&&!demo?statusArea:$('.topbar > div');
 if(demoLink.parentNode!==demoArea)demoArea.append(demoLink);
 const windowLabel=$('#trackingWindow'),windowArea=workshop?statusArea:$('#title').parentNode;
 if(windowLabel.parentNode!==windowArea)windowArea.prepend(windowLabel);
 $('#productionInfo').hidden=!workshop;
 const resultArea=workshop?$('#productionResult'):$('#productionViewMeta > div');
 if($('#resultCount').parentNode!==resultArea)resultArea.append($('#resultCount'));
 $('#productionViewMeta').hidden=insideDeck||workshop;
 $('#stats').hidden=insideDeck;
 $('#groupsBtn').hidden=$('#analysisBtn').hidden=collectionMode;
 $('#createBtn').hidden=$('#canvaBtn').hidden=!collectionMode||insideDeck;
 document.body.classList.toggle('inside-deck',insideDeck);
 $('#title').textContent={universe:'Üni-verse',collections:'Koleksiyon',workshop:'Üretim'}[mode];
 $('#search').placeholder=mode==='collections'?'Koleksiyon, tasarımcı, slayt veya model ara…':'Model, barkod veya kişi ara…';
 $('#layoutSwitch').hidden=false;
 $$('[data-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.mode===mode);button.setAttribute('aria-pressed',String(button.dataset.mode===mode));});
 $$('[data-view]').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-pressed',String(button.dataset.view===view));});
 $('#designHandoffBanner').hidden=mode!=='workshop'||!handoffModel;
 if(catalog){
  for(const id of ['board','listView','collectionsView','empty','stats','productionFilters','toggleFilters','productionViewMeta','layoutSwitch','groupsBtn','analysisBtn','createBtn','canvaBtn'])$('#'+id).hidden=true;
  $('#breadcrumb').textContent='Üni-verse';$('#search').placeholder='Ürün, marka, mamul kodu veya ERP kart no ara…';
  renderSidebar();
  if(catalogTab==='uff')$('#search').placeholder='Ürün, marka veya referans ara…';
  $('#catalogQueue').hidden=catalogTab!=='pending';$('#catalogRecent').hidden=catalogTab!=='recent';$('#catalogUff').hidden=catalogTab!=='uff';
  $$('[data-catalog]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.catalog===catalogTab)));
  activeCatalog().render($('#search').value,(p,linked)=>{
   if(!brandFilter)return true;
   const catalogBrand=recordBrand({brand:p.brand});
   return (!branchFilter&&catalogBrand===brandFilter)||linked.some(r=>recordBrand(r)===brandFilter&&inBranch(r,branchFilter))||
    (branchFilter&&catalogBrand===brandFilter&&inBranch({brand:p.brand},branchFilter));
  },records);
  return;
 }
 if(insideDeck){
  for(const id of ['board','listView','collectionsView','empty'])$('#'+id).hidden=true;
  $('#breadcrumb').textContent='Koleksiyon';
  renderSidebar();
  $('#search').placeholder=designerWorkspace.searchHint;
  $('#layoutSwitch').hidden=!designerWorkspace.activeSlide;
  return;
 }
 if(mode==='workshop'&&handoffModel){
  const linked=state.models.filter(model=>model.handoff?.erpModelKey===handoffModel);
  const focused=records.find(row=>row.modelKey===handoffModel);
  const label=focused?.productionBrief?.code||focused?.model||'ERP modeli';
  const context=linked.map(model=>model.handoff.note).filter(Boolean).join(' · ');
  $('#designHandoffBanner').innerHTML='<div><strong>Tasarımdan üretime · '+esc(label)+'</strong>'+(context?'<p>'+esc(context)+'</p>':'')+'</div><button class="button" id="clearHandoff">Tüm numuneler</button>';
  $('#clearHandoff').onclick=()=>{handoffModel='';render();};
  if(demo&&focused){
   const modelKey=focused.modelKey, next=demo.nextStep(modelKey);
   const controls=document.createElement('div');controls.className='demo-actions';
   controls.innerHTML='<button class="button" id="backToLook">Koleksiyon görseli</button>'+
    (next?'<button class="button primary" id="advanceDemo">'+esc(next)+' →</button>':'<strong>Numune onaylandı</strong>');
   $('#designHandoffBanner').append(controls);
   $('#backToLook').onclick=()=>openDemoSlide(demo.pageFor(modelKey));
   if(next)$('#advanceDemo').onclick=event=>{event.currentTarget.disabled=true;advanceDemo(modelKey,focused.erpStage);};
  }
 }
 updateOptions();const rows=mode==='workshop'?attentionRows(filteredRows()):[];renderSidebar();
 const cs=collectionMode?visibleCollections.filter(c=>designerWorkspace.includesCollection(c)):visibleCollections;if(mode==='workshop')updateStats(rows,cs);
 $('#contextName').textContent=branchById.get(branchFilter)?.name||brandById.get(brandFilter)?.name||'Tüm markalar';$('#breadcrumb').textContent=mode==='workshop'?'Üretim':'Koleksiyon';$('#resultCount').textContent=mode==='workshop'?rows.filter(r=>r.recordType!=='canva').length+' numune · '+new Set(rows.map(r=>r.modelKey)).size+' model'+(rows.some(r=>r.recordType==='canva')?' · '+rows.filter(r=>r.recordType==='canva').length+' tasarım':''):cs.length+' koleksiyon';
 $('#board').hidden=mode!=='workshop'||view!=='board';$('#listView').hidden=mode!=='workshop'||view!=='list';$('#collectionsView').hidden=mode!=='collections';
 for(const name of ['stageFilter','versionFilter','workKindFilter','natureFilter','groupFilter','allStages']){const node=$('#'+name).closest('label')||$('#'+name);node.hidden=mode==='collections';}$('#collectionFilter').hidden=mode==='collections';$('#collectionStateFilter').hidden=mode!=='collections';
 $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(mode==='collections'){renderCollections(cs);return;}
 const moveInView=view==='board'?lastManualMove:'';
 rows.sort((a,b)=>Number(b.id===moveInView)-Number(a.id===moveInView)||
  (Date.parse(b.erp?.activityAt)||0)-(Date.parse(a.erp?.activityAt)||0));
 const counts={},shown=[];
 for(const [index,r] of rows.entries()){
  counts[r.stage]=(counts[r.stage]||0)+1;
  if(view==='board'?counts[r.stage]<=(laneLimits.get(r.stage)||16):index<listLimit)shown.push(r);
 }
 $('#moreList').hidden=view!=='list'||rows.length<=listLimit;
 $('#moreList').textContent='Daha fazla numune göster ('+Math.max(0,rows.length-listLimit)+')';
 const ids=new Set(shown.map(r=>r.id)),allIds=new Set(records.map(r=>r.id));for(const map of [cardNodes,rowNodes])for(const [id,n] of map){if(!allIds.has(id)){n.remove();map.delete(id);}else n.hidden=!ids.has(id);}
 for(const col of $$('.column')){const id=col.dataset.stage;col.querySelector('.count').textContent=counts[id]||0;
 const more=col.querySelector('[data-more-stage]'),remaining=(counts[id]||0)-(laneLimits.get(id)||16);
 more.hidden=remaining<=0;more.textContent='Daha fazla göster ('+Math.max(0,remaining)+')';
 col.hidden=!dragged && (($('#stageFilter').value&&id!==$('#stageFilter').value)||(!$('#allStages').checked&&!counts[id]&&(!mainStages.includes(id)||!!$('#search').value)));}
 for(const group of $$('#board .board-process'))group.hidden=!group.querySelector('.column:not([hidden])');
 let previousListRow=null;
 for(const [rank,r] of shown.entries()){if(view==='board'){const col=$('.column[data-stage="'+r.stage+'"] .cards');if(col)patchNode(cardNodes,r.id,col,cardMarkup(r),'article','card').style.order=rank;}else{const p=person(r),markup='<td><div class="table-model">'+image(r)+'<div><b>'+esc(r.model)+'</b><small>'+esc(r.sampleCode||'Canva')+'</small></div></div></td><td>'+esc(r.brand)+'<br><small>'+esc(r.department)+'</small></td><td>'+esc(r.barcode||'Barkod yok')+'<br>V'+esc(r.version??'—')+'</td><td>'+esc(stage(r.stage).name)+(r.productionBrief?' · Canva planı':'')+(r.override?' <span class="tag manual">Elle</span>':'')+'</td><td>'+esc(p.employeeName||'—')+'<br><small>'+esc(p.createdByName||'')+'</small>'+followupMarkup(r)+'</td><td>'+esc(collectionsFor(r).map(c=>c.name).join(', ')||'Atanmamış')+'</td>';const parent=$('#listBody');const node=patchNode(rowNodes,r.id,parent,markup,'tr','');const next=previousListRow?previousListRow.nextElementSibling:parent.firstElementChild;if(next!==node)parent.insertBefore(node,next);previousListRow=node;}}
 if(!rows.length){$('#board').hidden=$('#listView').hidden=true;}
 $('#empty').hidden=rows.length>0;$('#emptyTitle').textContent='Bu görünümde numune yok.';$('#emptyText').textContent=records.length?'Diğer numuneleri görmek için filtreleri değiştirebilirsin.':'Son 30 günde oluşturulan veya hareket gören numuneler burada görünür.';
}
function updateStats(rows,collections){
 $('#statModels').textContent=new Set(rows.map(r=>r.modelKey)).size;
 $('#statProduction').textContent=rows.filter(r=>r.recordType!=='canva'&&['cutting_in','intermediate_review','external','queue','sewing'].includes(r.stage)).length;
 $('#statReturned').textContent=rows.filter(r=>r.stage==='quality').length;
 $('#statCollections').textContent=collections.length;
 const statuses=collections.map(c=>collectionStatus(c).id);
 $('#statCollectionNote').textContent=statuses.filter(status=>status==='completed').length+' tamamlandı · '+statuses.filter(status=>status==='active').length+' aktif';
}
function collectionProgress(collectionId,rows,counts,unresolved){
 const physical=rows.length-unresolved;
 const stages=T.stages.filter(item=>item.id!=='design'&&counts[item.id]);
 const segments=stages.map(item=>'<span title="'+esc(item.name)+' · '+counts[item.id]+'" style="background:'+item.color+';width:'+(counts[item.id]/Math.max(1,physical)*100)+'%"></span>').join('');
 const breakdown=stages.map(item=>'<button type="button" data-open-collection="'+esc(collectionId)+'" data-collection-stage="'+esc(item.id)+'" title="Bu aşamadaki numuneleri Üretimde aç"><i aria-hidden="true" style="background:'+item.color+'"></i>'+esc(item.name)+' <b>'+counts[item.id]+'</b></button>').join('');
 return '<div class="collection-progress"><b>Üretim dağılımı</b><small>'+physical+' numune</small></div>'+
  (physical?'<div class="progress" aria-hidden="true">'+segments+'</div><div class="stage-legend">'+breakdown+'</div>':'<p class="no-production">Bağlı üretim numunesi yok.</p>')+
  (unresolved?'<div class="unlinked-count">'+unresolved+' tasarım ERP eşleşmesi bekliyor</div>':'');
}
function renderCollections(cs){
 const q=normal($('#search').value);cs=cs.filter(c=>!q||designerWorkspace.hasMatchingSlide(c.id)||normal([c.name,c.designer,c.canvaTitle,...members(c).flatMap(r=>[r.model,r.mainCode,r.sampleCode,r.barcode])].join(' ')).includes(q));$('#resultCount').textContent=cs.length+' koleksiyon';const target=$('#collectionsView');if(!target.querySelector('.collection-groups'))target.innerHTML='<div class="collection-groups"></div>';const groups=target.firstElementChild,keep=new Set(),included=new Map();
 for(const c of cs){const parentId=canonicalBrand(c.brandId);let group=[...groups.children].find(n=>n.dataset.group===parentId);if(!group){group=document.createElement('section');group.className='collection-group';group.dataset.group=parentId;group.innerHTML='<h2>'+esc(brandById.get(parentId)?.name||'Marka atanmamış')+'</h2><div class="collection-grid"></div>';groups.append(group);}const grid=group.querySelector('.collection-grid');grid.classList.toggle('list',view==='list');
 const rows=members(c).filter(r=>$('#allScope').checked||!r.hidden),unique=new Set(rows.map(r=>r.modelKey)),unresolved=rows.filter(r=>r.recordType==='canva').length,counts={};for(const r of rows){if(r.recordType!=='canva')counts[r.stage]=(counts[r.stage]||0)+1;included.set(r.id,r);}const status=collectionStatus(c),slides=c.canvaSlides||[];
 const cover=slides.map(slide=>slide.photo).find(path=>typeof path==='string'&&/^canva-images\/[\w.-]+\.(?:jpg|jpeg|png|webp)$/i.test(path))||rows.map(photo).find(Boolean);
 const deckButton=c.canvaDesignId?' data-cover-deck="'+esc(c.id)+'"':'';
 const coverImage=cover?'<img src="'+esc(cover)+'" loading="lazy" alt="">':'';
 const coverMarkup=c.canvaDesignId?'<button class="collection-cover" type="button" aria-label="'+esc(c.name+' sunumunu aç')+'"'+deckButton+'>'+coverImage+
  (!cover?'<span>Canva</span>':'')+'</button>':coverImage?'<div class="collection-cover">'+coverImage+'</div>':'';
 const deckMeta=c.canvaDesignId?'<p class="collection-deck-meta">'+slides.length+' slayt'+(c.canvaSyncedAt?' · '+esc(date(c.canvaSyncedAt)):'')+'</p>':'';
 const syncNote=state.jobs[c.id]?.status==='running'?'Görsel ve metinler alınıyor…':c.canvaError;
 const openDeck=c.canvaDesignId?'<button type="button" class="button primary" data-open-deck="'+esc(c.id)+'">Sunumu aç ↗</button>':'';
 const markup=coverMarkup+'<div class="collection-body"><div class="collection-head"><h3>'+esc(c.name)+'</h3><span class="status-pill" data-state="'+esc(status.id)+'">'+esc(status.label)+'</span></div>'+
  deckMeta+'<div class="collection-subtitle">'+unique.size+' model · '+(rows.length-unresolved)+' numune'+
  (c.designer?'<br>'+esc(c.designer):'')+(c.modelhouseManager?' · '+esc(c.modelhouseManager):'')+'</div>'+
  collectionProgress(c.id,rows,counts,unresolved)+(syncNote?'<p class="collection-subtitle" role="status">'+esc(syncNote)+'</p>':'')+'</div>'+
  '<div class="collection-actions">'+openDeck+'<button class="button'+(c.canvaDesignId?'':' primary')+'" data-open-collection="'+esc(c.id)+'">Üretimde gör</button>'+
  '<button class="button" data-edit-collection="'+esc(c.id)+'">Düzenle</button>'+
  (c.canvaDesignId?'<button class="button" data-sync-canva="'+esc(c.id)+'">Canva’yı kontrol et</button>':'')+'</div>';
 patchNode(collectionNodes,c.id,grid,markup,'article','collection-card');keep.add(c.id);}

 updateStats([...included.values()],cs);
 for(const [id,n] of collectionNodes)if(!keep.has(id)){n.remove();collectionNodes.delete(id);}for(const group of [...groups.children])if(!group.querySelector('.collection-card'))group.remove();$('#empty').hidden=cs.length>0;const narrowed=q||brandFilter||$('#collectionStateFilter').value;
 $('#emptyTitle').textContent=narrowed?'Eşleşen koleksiyon yok.':'Henüz koleksiyon yok.';
 $('#emptyText').textContent=narrowed?'Başka bir arama, marka veya durum seçebilirsin.':'Koleksiyon oluşturabilir veya bir Canva sunumu alabilirsin.';
}

function openModal(title,body){selected=null;$('#modalContent').innerHTML='<div class="modal-header"><h2 id="dialogTitle">'+esc(title)+'</h2><button class="close" data-close aria-label="Kapat">×</button></div><div class="modal-body">'+body+'</div>';if(!$('#modal').open)$('#modal').showModal();}
function detailFields(r){return [['Barkod',r.barcode||'Henüz yok'],['Versiyon',r.version??'—'],['Numune kodu',r.sampleCode||r.code||'Eşleştirme gerekli'],['Ana model',r.mainCode||'—'],...(r.canvaPlans?.length?[['Canva referansı',r.canvaPlans.join(' / ')]]:[]),['Kalıp No',r.patternNo||'Henüz boş'],['Marka / Departman',[r.brand,r.department].filter(Boolean).join(' / ')],['Ara işlem',r.erp?.intermediateLabel||'Seçilmemiş / bilgi yok'],['Barkod başlangıcı',date(r.erp?.barcodeCreatedAt)],['Beden / Renk',[r.body,r.color].filter(Boolean).join(' / ')||'—'],['ERP aşaması',stage(r.erpStage).name],...entryDetails(r),...state.models.filter(m=>m.handoff?.erpModelKey===r.modelKey).map(m=>['Tasarım kararı',m.handoff.note||'Üretime aktarıldı'])].map(([label,value])=>'<div'+(label==='Aşamada geçen süre'?' data-stage-duration':'')+'><small>'+esc(label)+'</small>'+esc(value)+'</div>').join('');}
function movementTitle(m){if(normal(m.process)==='kesim'&&m.kind===100)return 'Kesim okutuldu → '+stage(m.workflowStage||'queue').name;if(normal(m.process)==='dikim'&&m.kind===0)return 'Dikime giden okutuldu → Dikimde';if(normal(m.process)==='dikim'&&m.kind===1)return 'Dikimden gelen okutuldu → Kalitede';return (m.process||'Hareket')+' · '+stage(m.workflowStage||m.stage).name;}
function historyMarkup(r){return [...(r.erp?.movements||[])].reverse().map(m=>'<div class="history-item"><small>'+date(m.at)+' · Hareket #'+esc(m.id)+'</small><b>'+esc(movementTitle(m))+'</b><br>İşlem personeli/kaynağı: '+esc(m.employeeName||'Ad bilgisi yok')+'<br>Kaydı oluşturan ERP kullanıcısı: '+esc(m.createdByName||m.createdById||'—')+(m.resource?'<br>Operasyon kaynağı: '+esc(m.resource):'')+'</div>').join('')||'<div class="explanation">Henüz kesim/dikim hareketi yok. '+esc(r.erp?.reason)+'</div>';}
function entryDetails(r){
 const wait=team.waiting(r,meta.fetchedAt);
 return wait?[['Aşamaya giriş',wait.entered+' · '+wait.source],['Aşamada geçen süre',wait.days+' takvim günü · '+wait.asOf+' itibarıyla']]:[];
}
function teamHistory(id){
 const rows=sharedRow(id).history||[];
 return rows.slice().reverse().map(h=>{
  const text=h.changes?Object.entries(h.changes).map(([k,v])=>team.labels[k]+' · '+(k==='approval'?team.approvals[v]:v||'Temizlendi')).join('\n'):h.note;
  return '<div class="history-item"><small>'+esc(h.at?date(h.at):'Önceki tarayıcı kaydı')+'</small><div class="team-history-text">'+esc(text)+'</div></div>';
 }).join('')||'<p>Henüz ortak değişiklik yok.</p>';
}
function refreshTeamForm(id){
 const shared=sharedRow(id);
 if(!detailBase)return;
 for(const [key,field] of Object.entries(team.fields)){
  const input=$('#'+field);
  if(input.value===detailBase[key]){
   input.value=shared[key];detailBase[key]=shared[key];detailBase.versions[key]=shared.versions[key]||0;
  }
 }
 $('#teamHistory').innerHTML=teamHistory(id);
}
function openDetail(id){const r=records.find(r=>r.id===id);if(!r)return;const matched=state.models.filter(m=>!m.retired&&m.erpModelKey===r.modelKey),canva=r.recordType==='canva'?state.models.find(m=>m.id===id):null;
 openModal(r.model,'<div class="detail-layout"><div><div class="detail-photo">'+image(r)+'</div><div class="detail-fields" id="detailFields">'+detailFields(r)+'</div><div class="explanation">'+esc(r.erp?.reason)+'</div>'+(canva?'<button class="button teal" id="linkModelBtn" style="margin-top:12px">ERP modeliyle eşleştir</button>':'')+'</div><div><div class="eyebrow">NUMUNE KARTI · '+esc(sourceLabel(r))+'</div><div id="detailConflict">'+(r.override?'<p class="explanation warning">Elle düzeltme aktif. '+(r.conflict?'ERP’de farklı bir aşama var; düzeltmen korundu.':'ERP değişikliği bu düzeltmeyi sessizce silmez.')+'</p>':'')+'</div><div class="form-grid"><label class="field full">İşlem kümesi<select id="detailStage">'+T.stages.filter(s=>!s.legacy).map(s=>'<option value="'+s.id+'" '+(r.stage===s.id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label><label class="field full">Revizyon / not<textarea maxlength="5000" id="detailNote" placeholder="Revizyonu veya bekleme nedenini yaz…">'+esc(r.userNote||'')+'</textarea></label><label class="field">Takip sorumlusu<input id="detailOwner" maxlength="100" value="'+esc(r.userOwner||'')+'" placeholder="Sorumlu kişi"></label><label class="field">Hedef bitiş<input id="detailDate" type="date" value="'+esc(r.targetDate||'')+'"></label><label class="field full">Onay durumu<select id="detailApproval">'+[['pending','Onay bekliyor'],['approved','Onaylandı'],['revise','Revize istendi']].map(([id,label])=>'<option value="'+id+'" '+(r.approval===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="field">Numune niteliği<select id="detailNature">'+[['','Belirlenmemiş'],['original','Orijinal'],['trial','Deneme']].map(([id,n])=>'<option value="'+id+'" '+(r.sampleNature===id?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label class="field">Çalışma türü<select id="detailKind"><option value="collection" '+(r.workKind==='collection'?'selected':'')+'>Koleksiyon · Tasarımcı</option><option value="production" '+(r.workKind==='production'?'selected':'')+'>Üretim numunesi · Modelhane yöneticisi</option></select></label><label class="field full">Dikim grubu<select id="detailGroup">'+groupOptions(r.sewingGroupId)+'</select></label></div><div id="teamConflict" role="alert"></div><div class="inline-actions"><button class="button primary" id="saveDetail">Değişiklikleri kaydet</button><button class="button" id="acceptERP">ERP aşamasını kullan</button><button class="button" id="assignCollection">Koleksiyona ekle</button></div><p class="explanation">İşlem personeli/kaynağı, ERP hareketine atanmış kişi veya ekip etiketidir. Fiziksel olarak barkodu okutan kişi olduğu doğrulanmış değildir. ERP kullanıcı adı ayrıca gösterilir.</p>'+processConfirmation(r)+'<h3 class="section-title">ERP hareket geçmişi</h3><div class="history" id="detailHistory">'+historyMarkup(r)+'</div><h3 class="section-title">Fiş hareketleri</h3><div class="history" id="voucherHistory">'+voucherMarkup(r)+'</div><h3 class="section-title">Ortak revizyon ve takip geçmişi</h3><div class="history" id="teamHistory">'+teamHistory(id)+'</div><h3 class="section-title">Bu tarayıcıdaki aşama değişiklikleri</h3><div class="history" id="manualHistory">'+(r.history||[]).slice().reverse().map(h=>'<div class="history-item"><small>'+date(h.at)+'</small>'+esc(h.from?stage(h.from).name+' → '+stage(h.to).name:'Not')+'<br>'+esc(h.note)+'</div>').join('')+'</div>'+(canva||matched.length?'<h3 class="section-title">Canva tasarım bilgileri</h3>'+[...(canva?[canva]:[]),...matched].map(m=>'<div class="canva-note">'+esc(m.notes)+'</div>'+(m.photo?'<img src="'+esc(m.photo)+'" alt="Canva görseli" style="max-width:100%;max-height:250px;object-fit:contain">':'')).join(''):'')+'</div></div>');selected=id;openedStage=r.stage;
 if(demo&&matched.length){
  const go=document.createElement('button');go.type='button';go.className='button primary';go.textContent='Demoda üretim akışını aç';
  go.onclick=()=>{$('#modal').close();openHandoff(matched[0]);};
  $('#detailFields').before(go);
 }
 detailBase={...sharedRow(id),versions:{...sharedRow(id).versions}};
 const form=$('#saveDetail');
 form.onclick=async()=>{
  if(form.disabled)return;
  const changes={};
  for(const [key,field] of Object.entries(team.fields)){
   const value=$('#'+field).value;
   if(value!==detailBase[key])changes[key]=value;
  }
  const chosenStage=$('#detailStage').value,baseStage=openedStage;
  if(chosenStage==='revise'&&chosenStage!==baseStage&&!('approval' in changes))changes.approval='revise';
  const local={sampleNature:$('#detailNature').value,workKind:$('#detailKind').value,sewingGroupId:$('#detailGroup').value};
  const controls=[...$('#modal').querySelectorAll('input, textarea, select, button:not([data-close])')].filter(control=>!control.disabled);
  controls.forEach(control=>{control.disabled=true;});
  try{
   if(Object.keys(changes).length){
    const saved=await api('/api/followups',{id,changes,versions:detailBase.versions});
    acceptShared(saved);
   }
   const current=records.find(x=>x.id===id);
   if(current){
    const moved=chosenStage===baseStage?current:T.move(current,chosenStage,'Numune kartından aşama düzeltildi.');
    const updated={...moved,...local};
    retain(updated);records=records.map(x=>x.id===id?updated:x);
   }
   reconcile();render();
   if(form===$('#saveDetail')&&selected===id)$('#modal').close();
   toast('Numune kartı kaydedildi.');
  }catch(error){
   if(error.current){acceptShared(error.current);reconcile();render();}
   if(selected===id&&form===$('#saveDetail')){
    const box=$('#teamConflict');
    if(error.current){
     const conflicts=Object.keys(changes).filter(k=>error.current[k]!==changes[k]&&
       (error.current.versions[k]||0)!==(detailBase.versions[k]||0));
     box.innerHTML='<p>Bu alanlar başka bir cihazda güncellendi. Ekipte görünen değerler</p>'+
      conflicts.map(k=>'<p><b>'+esc(team.labels[k])+'</b> · '+esc(k==='approval'?team.approvals[error.current[k]]:error.current[k]||'Boş')+'</p>').join('')+
      '<button class="button" id="useTeam">Güncel değerleri al</button> <button class="button" id="keepDraft">Taslağımı koru</button>';
     for(const selector of ['#useTeam','#keepDraft'])$(selector).onclick=()=>{
      for(const k of conflicts){
       detailBase[k]=error.current[k];detailBase.versions[k]=error.current.versions[k]||0;
       if(selector==='#useTeam')$('#'+team.fields[k]).value=error.current[k];
      }
      box.replaceChildren();refreshTeamForm(id);
     };
    }else box.textContent=error.message+' Taslağın açık.';
   }
  }finally{controls.forEach(control=>{control.disabled=false;});}
 };
 $('#acceptERP').onclick=()=>{const current=records.find(x=>x.id===id);if(!current)return;const updated=T.acceptERP(current);records=records.map(x=>x.id===id?updated:x);retain(updated);openDetail(id);render();};$('#assignCollection').onclick=()=>assignCollection(r);if(canva)$('#linkModelBtn').onclick=()=>linkModel(canva);if($('#saveIntermediate'))$('#saveIntermediate').onclick=async()=>{const button=$('#saveIntermediate');button.disabled=true;const fields=['detailNote','detailOwner','detailDate','detailApproval','detailNature','detailKind','detailGroup'];const previousBase={...detailBase,versions:{...detailBase.versions}};const draft=Object.fromEntries(fields.map(key=>[key,$('#'+key).value]));const chosenStage=$('#detailStage').value,stageChanged=chosenStage!==openedStage;try{await api('/api/process-settings',{sampleRecId:r.erp.recId,intermediate:$('#intermediateChoice').value});await poll();openDetail(id);for(const [key,value] of Object.entries(draft)){
 const sharedKey=Object.keys(team.fields).find(k=>team.fields[k]===key);
 if(!sharedKey||value!==previousBase[sharedKey]){$('#'+key).value=value;if(sharedKey){detailBase[sharedKey]=previousBase[sharedKey];detailBase.versions[sharedKey]=previousBase.versions[sharedKey];}}
 }if(stageChanged)$('#detailStage').value=chosenStage;toast('Ara işlem teyidi kaydedildi; kart taslağın korundu.');}catch(e){toast(e.message);button.disabled=false;}};
}
function patchOpenDetail(){if(!selected||!$('#modal').open)return;const r=records.find(r=>r.id===selected);if(!r){$('#detailConflict').innerHTML='<p class="explanation warning">Kayıt ERP kapsamından çıktı. Yazdığın notu kopyalayabilirsin.</p>';return;}refreshTeamForm(r.id);$('#detailFields').innerHTML=detailFields(r);$('#detailHistory').innerHTML=historyMarkup(r);if($('#voucherHistory'))$('#voucherHistory').innerHTML=voucherMarkup(r);$('#detailConflict').innerHTML=r.conflict?'<p class="explanation warning">ERP’de yeni bir aşama var. Elle düzeltmen ve yazdığın not korunuyor.</p>':'';}

function groupOptions(value,filter=false){return '<option value="">'+(filter?'Tüm dikim grupları':'Grup seçilmemiş')+'</option>'+(filter?'<option value="unassigned">Atanmamış</option>':'')+(state.groups||[]).filter(g=>g.active||g.id===value).map(g=>'<option value="'+esc(g.id)+'" '+(g.id===value?'selected':'')+'>'+esc(g.name)+(g.active?'':' · pasif')+'</option>').join('');}
function groupsDialog(edit=null){
 const groups=state.groups||[],counts=new Map();for(const r of records)if(r.sewingGroupId){const c=counts.get(r.sewingGroupId)||{all:0,sewing:0};c.all++;if(r.stage==='sewing')c.sewing++;counts.set(r.sewingGroupId,c);}
 openModal('Dikim grupları','<p class="explanation">Elif Özbayrak ile teyit edilen dikim gruplarını burada tanımlayabilirsin. ERP işlem personeli/ekip etiketi kartta ayrıca korunur. Bu atama ERP’ye yazılmaz.</p><div class="membership-list">'+groups.map(g=>'<div class="membership-row"><span><b>'+esc(g.name)+'</b><br><small>'+esc(g.manager||'Sorumlu belirtilmemiş')+' · '+(g.active?'Aktif':'Pasif')+' · '+(counts.get(g.id)?.sewing||0)+' dikimde / '+(counts.get(g.id)?.all||0)+' numune</small></span><button class="button" data-edit-group="'+esc(g.id)+'">Düzenle</button></div>').join('')+'</div><label class="field">ERP grup etiketinden başlat (üyelik teyidi değildir)<select id="erpGroupCandidate"><option value="">Elle tanımla…</option>'+erpGroupCatalog.map(g=>'<option value="'+g.ResourceId+'">'+esc(g.Label)+' · '+esc(g.DepartmentName)+'</option>').join('')+'</select></label><form id="groupForm"><h3 class="section-title">'+(edit?'Grubu düzenle':'Yeni grup')+'</h3><div class="form-grid"><label class="field">Grup adı<input id="groupName" required maxlength="100" value="'+esc(edit?.name||'')+'"></label><label class="field">Sorumlu<input id="groupManager" maxlength="100" value="'+esc(edit?.manager||'')+'"></label><label class="field full">Açıklama / üyeler<textarea id="groupNotes">'+esc(edit?.notes||'')+'</textarea></label><label class="check"><input type="checkbox" id="groupActive" '+(edit?.active!==false?'checked':'')+'> Aktif</label></div><div class="form-actions"><button class="button primary" type="submit">Grubu kaydet</button></div></form>');
 $('#modal').querySelectorAll('[data-edit-group]').forEach(b=>b.onclick=()=>groupsDialog(groups.find(g=>g.id===b.dataset.editGroup)));
 $('#erpGroupCandidate').onchange=()=>{const candidate=erpGroupCatalog.find(g=>String(g.ResourceId)===$('#erpGroupCandidate').value);if(candidate){$('#groupName').value=candidate.Label;$('#groupNotes').value='ERP ResourceId '+candidate.ResourceId+' · EmployeeId '+candidate.EmployeeId+' · '+candidate.DepartmentName+'\nÜye listesi ve organizasyon Elif Özbayrak ile teyit edilecek.';}};
 $('#groupForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/groups',{...(edit||{}),name:$('#groupName').value,manager:$('#groupManager').value,notes:$('#groupNotes').value,active:$('#groupActive').checked});await loadState();render();groupsDialog();toast('Dikim grubu kaydedildi.');}catch(error){toast(error.message);}};
}
function processConfirmation(r){return '<div class="explanation"><b>Ara işlem seçimi:</b> '+esc(r.erp?.intermediateLabel||'Teyit gerekli')+'<br>Kaynak: '+esc(r.erp?.intermediateSource||'Henüz yok')+'</div>'+(r.erp?.recId?'<div class="inline-actions"><select id="intermediateChoice" aria-label="Ara işlem teyidi">'+[['erp','ERP rota seçimini kullan'],['none','Ara işlem yok'],['print','Baskı'],['embroidery','Nakış'],['both','Baskı + Nakış']].map(([id,label])=>'<option value="'+id+'" '+((r.erp?.intermediateChoice||'erp')===id?'selected':'')+'>'+label+'</option>').join('')+'</select><button class="button" id="saveIntermediate">Ara işlemi teyit et</button></div><p class="explanation">Bu seçim aynı ERP numune versiyonunun tüm barkodlarına uygulanır. Yeni dikim hareketi gelince otomatik Dikimde/Kalitede ilerler. Yalnız V2’de saklanır.</p>':'');}
function voucherMarkup(r){return (r.erp?.vouchers||[]).map(v=>'<div class="history-item"><small>'+date(v.EventAt)+' · Fiş #'+esc(v.ReceiptNo||v.ReceiptId)+'</small><b>'+esc(v.ReceiptType)+' · '+esc(v.ReceiptType===135?'Transfer çıkış · Numune Depo değerlendirmesi':'Özel çıkış · Gönderi değerlendirmesi')+'</b><br>Bağlantı: '+esc(v.LinkLevel==='barcode'?'Barkod':'Numune versiyonu · aynı versiyonun barkodları')+'<br>'+esc(v.WarehouseName||'')+'<br>Fiş zamanı: '+date(v.ReceiptEventAt||v.EventAt)+(v.ConfirmedTransferAt?'<br>Karşı depo girişi: '+date(v.ConfirmedTransferAt):'')+'<br>Miktar: '+esc(v.Quantity??'—')+' · Karşı giriş: '+esc(v.ConfirmedTransferQuantity??'—')+'<br>ERP kullanıcısı: '+esc(v.CreatedByName||'—')+(v.PendingReason?'<p class="explanation warning">Otomatik taşınmadı: '+esc(v.PendingReason)+'</p>':'')+'</div>').join('')||'<div class="explanation">Bu numuneye kesin bağlanmış 135/132 fiş hareketi yok.</div>';}
function optionsBrands(value){return '<option value="">Marka seç…</option>'+brands.map(b=>'<option value="'+esc(b.id)+'" '+(b.id===value?'selected':'')+'>'+esc(b.name)+'</option>').join('');}
function optionsBranches(brand,id){let list=[];const walk=(nodes,depth)=>{for(const n of nodes||[]){list.push('<option value="'+esc(n.id)+'" '+(n.id===id?'selected':'')+'>'+esc('— '.repeat(depth)+n.name)+'</option>');walk(n.children,depth+1);}};walk(brandById.get(brand)?.children,0);return '<option value="">Genel / alt kırılım yok</option>'+list.join('');}
function collectionForm(c=null,importCanva=false,designerName=''){const wasInCollections=mode==='collections';const brand=canonicalBrand(c?.brandId||brandFilter),branch=c?collectionBranch(c):branchFilter,memberKeys=new Set(c?.modelKeys||[]);
 openModal(importCanva?'Canva sunumunu koleksiyona bağla':c?'Koleksiyonu düzenle':'Yeni koleksiyon','<form id="collectionForm"><div class="form-grid"><label class="field full">Koleksiyon adı<input id="collectionName" required maxlength="120" value="'+esc(c?.name||'')+'" placeholder="Örn. H&M Divided · İlkbahar 2027"></label><label class="field">Ana marka<select id="collectionBrand" required>'+optionsBrands(brand)+'</select></label><label class="field">Alt kırılım<select id="collectionBranch">'+optionsBranches(brand,branch)+'</select></label><label class="field">Tasarımcı<input id="collectionDesigner" maxlength="100" value="'+esc(c?.designer||designerName)+'" placeholder="Koleksiyon sorumlusu"></label><label class="field">Modelhane yöneticisi<input id="collectionManager" maxlength="100" value="'+esc(c?.modelhouseManager||'')+'" placeholder="Üretim numunesi sorumlusu"></label><label class="field">Koleksiyon durumu<select id="collectionStatus">'+[['auto','Otomatik'],['active','Aktif'],['paused','Beklemede'],['completed','Tamamlandı'],['archived','Arşiv']].map(([id,label])=>'<option value="'+id+'" '+(c?.status===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+(importCanva?'<label class="field full">Canva sunum bağlantısı<input id="canvaUrl" required placeholder="https://www.canva.com/design/…"></label><div class="full inline-actions"><input id="canvaSearch" placeholder="Canva tasarım adı ara" aria-label="Canva tasarım ara"><button type="button" class="button" id="findCanva">Tasarımları bul</button></div><label class="field full" id="canvaPickerLabel" hidden>Canva tasarımları<select id="canvaPicker"></select></label><p class="explanation full">Sunumun görselleri ve metinleri alınır. Etiketli model kodu tek bir ERP modeliyle eşleşirse bağlanır. Belirsiz görseller eşleştirme için bekler. Bu koleksiyonun Canva değişiklikleri otomatik kontrol edilir.</p>':'<label class="field">'+(c?.canvaDesignId?'Canva otomatik izleme':'Üyelik araması')+(c?.canvaDesignId?'<select id="canvaWatch"><option value="true" '+(c.canvaWatch?'selected':'')+'>Açık · 60 saniyede kontrol</option><option value="false" '+(!c.canvaWatch?'selected':'')+'>Kapalı</option></select>':'<input id="memberSearch" placeholder="Model kodu ara…">')+'</label><div class="full"><h3 class="section-title">Koleksiyona eklenecek modeller</h3><p style="font-size:10px;color:#8aa0aa">Bir model seçildiğinde ona bağlı barkod ve versiyonlar birlikte izlenir.</p><div class="membership-list" id="membership"></div></div>')+'</div><div class="form-actions"><button type="button" class="button" data-close>Vazgeç</button><button class="button primary" type="submit">'+(importCanva?'Canva’dan al':'Kaydet')+'</button></div></form>');
 const updateMembers=()=>{if(importCanva)return;const q=normal($('#memberSearch')?.value),b=$('#collectionBrand').value,branch=$('#collectionBranch').value;const models=new Map();for(const r of records)if((!b||recordBrand(r)===b)&&inBranch(r,branch)&&(!q||normal(r.model+' '+r.mainCode+' '+r.sampleCode).includes(q)))models.set(r.modelKey,r);$('#membership').innerHTML=[...models.values()].map(r=>'<label class="membership-row"><input type="checkbox" value="'+esc(r.modelKey)+'" '+(memberKeys.has(r.modelKey)?'checked':'')+'>'+esc(r.model)+'<small>'+esc(r.mainCode||r.sampleCode||'Canva')+'</small></label>').join('')||'<p class="explanation">Bu marka veya alt kırılım için kapsamda model yok.</p>';};
 $('#collectionBrand').onchange=()=>{$('#collectionBranch').innerHTML=optionsBranches($('#collectionBrand').value,'');updateMembers();};$('#collectionBranch').onchange=updateMembers;
 if(!importCanva){updateMembers();if($('#memberSearch'))$('#memberSearch').oninput=updateMembers;$('#membership').onchange=e=>{if(e.target.checked)memberKeys.add(e.target.value);else memberKeys.delete(e.target.value);};}
 else{$('#findCanva').onclick=async()=>{const button=$('#findCanva');button.disabled=true;try{const data=await api('/api/canva/designs?query='+encodeURIComponent($('#canvaSearch').value));$('#canvaPicker').innerHTML='<option value="">Tasarım seç…</option>'+data.designs.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.title)+'</option>').join('');$('#canvaPickerLabel').hidden=false;if(!data.designs.length)toast('Bu aramada Canva tasarımı bulunamadı.');}catch(e){toast(e.message);}finally{button.disabled=false;}};$('#canvaPicker').onchange=()=>{const option=$('#canvaPicker').selectedOptions[0];$('#canvaUrl').value=option.value;if(!$('#collectionName').value)$('#collectionName').value=option.textContent;};}
 $('#collectionForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const payload={...(c||{}),name:$('#collectionName').value,brandId:$('#collectionBrand').value,branchId:$('#collectionBranch').value,status:$('#collectionStatus').value,designer:$('#collectionDesigner').value.trim(),modelhouseManager:$('#collectionManager').value.trim(),modelKeys:[...memberKeys],...($('#canvaWatch')?{canvaWatch:$('#canvaWatch').value==='true'}:{})};if(!payload.brandId)throw Error('Bir ana marka seç.');if(importCanva)payload.url=$('#canvaUrl').value;const result=await api(importCanva?'/api/canva/import':'/api/collections',payload);$('#modal').close();await loadState();mode='collections';if(importCanva)designerWorkspace.openPresentation(result.collection.id);else if(!c||!wasInCollections)designerWorkspace.openPresentation('');render();toast(importCanva?(result.started?'Canva alımı başladı. Sonuç koleksiyon kartında görünecek.':'Canva sırası dolu. Koleksiyondan Canva kontrolünü yeniden başlatabilirsin.'):'Koleksiyon kaydedildi.');}catch(error){toast(error.message);}finally{button.disabled=false;}};
}
function assignCollection(r){openModal('Koleksiyona ekle','<p class="explanation">'+esc(r.model)+' modelinin tüm barkod ve versiyonları birlikte eklenecek.</p><div class="membership-list">'+state.collections.filter(c=>c.status!=='archived').map(c=>'<label class="membership-row"><input type="checkbox" value="'+esc(c.id)+'" '+(collectionsFor(r).some(x=>x.id===c.id)?'checked':'')+'>'+esc(c.name)+'</label>').join('')+'</div><div class="form-actions"><button class="button" id="newFromCard">Yeni koleksiyon</button><button class="button primary" id="saveMembership">Kaydet</button></div>');$('#newFromCard').onclick=()=>collectionForm({name:'',brandId:recordBrand(r),modelKeys:[r.modelKey],status:'auto'});$('#saveMembership').onclick=async()=>{try{for(const c of state.collections.filter(c=>c.status!=='archived')){const checked=[...$('#modal').querySelectorAll('input')].find(n=>n.value===c.id)?.checked;let keys=c.modelKeys.filter(k=>k!==r.modelKey&&!state.models.some(m=>m.id===k&&m.erpModelKey===r.modelKey));if(checked)keys.push(r.modelKey);if(JSON.stringify(keys)!==JSON.stringify(c.modelKeys))await api('/api/collections',{...c,modelKeys:keys});}$('#modal').close();await loadState();render();}catch(e){toast(e.message);}};}
function linkModel(model){
 const samples=records.filter(row=>['sample','barcode'].includes(row.recordType));
 openModal('ERP modelini bağla',
  '<p class="explanation">'+esc(model.model)+' için mevcut ERP numune kapsamından bir ana model seç.</p>'+
  '<label class="field">Model, numune kodu veya barkod<input id="erpLookup" type="search" placeholder="ERP modeli ara…"></label>'+
  '<label class="field">ERP modeli<select id="linkModel" size="6" aria-label="ERP modeli"></select></label>'+
  '<p id="erpLookupEmpty" hidden>Bu aramayla eşleşen ERP modeli bulunamadı.</p>'+
  '<div class="form-actions"><button class="button primary" id="saveLink">ERP’ye bağla</button></div>');
 const select=$('#linkModel'),search=$('#erpLookup'),button=$('#saveLink');
 function results(){
  const query=normal(search.value);
  const matches=samples.filter(row=>!query||normal([row.model,row.mainCode,row.sampleCode,row.brand,row.barcode].join(' ')).includes(query));
  const models=[...new Map(matches.map(row=>[row.modelKey,row])).values()];
  select.innerHTML=models.map(row=>'<option value="'+esc(row.modelKey)+'">'+esc([row.model,row.mainCode,row.brand].filter(Boolean).join(' · '))+'</option>').join('');
  select.value=models.some(row=>row.modelKey===model.erpModelKey)?model.erpModelKey:'';
  $('#erpLookupEmpty').hidden=!!models.length;
  button.disabled=!select.value;
 }
 search.oninput=results;
 select.onchange=()=>{button.disabled=!select.value;};
 results();
 button.onclick=async()=>{
  button.disabled=true;
  try{
   await api('/api/models/link',{id:model.id,erpModelKey:select.value});
   $('#modal').close();await loadState();render();
   toast('Canva ürünü ERP modeliyle eşleştirildi.');
  }catch(error){toast(error.message);button.disabled=false;}
 };
}
function openHandoff(model){
 mode='workshop';
 brandFilter=branchFilter='';
 $('#clearFilters').click();
 handoffModel=model.erpModelKey||model.id;
 render();
 if(demo)revealDemoCard();
}
function openDemoSlide(page=''){
 mode='collections';brandFilter=branchFilter='';resetFilters();
 designerWorkspace.openPresentation(demo.deckId,page);render();
}
function revealDemoCard(){
 const row=records.find(r=>r.modelKey===handoffModel);
 if(row&&view==='board')cardNodes.get(row.id)?.scrollIntoView?.({block:'nearest',inline:'center'});
}
async function advanceDemo(modelKey,currentStage){
 try{
  demo.advance(modelKey,currentStage);await poll();revealDemoCard();
 }catch(error){toast(error.message);}
}
function handoffDialog(model){
 openModal('Üretime aktar',
  '<p class="explanation">'+esc(model.model)+' için bağlı ERP modelinin numuneleri Üretimde açılacak.</p>'+
  '<label class="field">Tasarım kararı<textarea id="handoffNote" maxlength="2000" placeholder="Örneğin V2 kalıbını baz al. Yaka 1 cm düşürülecek.">'+esc(model.handoff?.note||'')+'</textarea></label>'+
  '<div class="form-actions"><button class="button" data-close>Vazgeç</button><button class="button primary" id="sendHandoff">Üretime aktar</button></div>');
 const button=$('#sendHandoff');
 button.onclick=async()=>{
  button.disabled=true;
  try{
   const updated=await api('/api/models/handoff',{id:model.id,erpModelKey:model.erpModelKey,note:$('#handoffNote').value});
   $('#modal').close();if(demo)await poll();else await loadState();openHandoff(updated);
   toast('Tasarım kararı Üretime aktarıldı.');
  }catch(error){toast(error.message);button.disabled=false;}
 };
}
function analysis(){const a=meta.analysis||{};openModal('Süreç ve ERP eşleşmeleri','<div class="analysis-grid">'+Object.entries(a.stages||{}).map(([id,n])=>'<div><b>'+n+'</b>'+esc(stage(id).name)+'</div>').join('')+'</div><h3 class="section-title">Onaylanan üretim akışı</h3><p class="explanation">Kalıp No boş → Kalıp sırası; dolu → Kalıp tamamlandı.<br>Barkod kartı oluşmuş → Kesimde.<br>Kesim okutulmuş → ara işlem seçiliyse Baskı–Nakış; seçilmemişse Dikim sırası.<br>Dikime giden okutulmuş → Dikimde.<br>Dikimden gelen okutulmuş → Kalitede.<br>Kesin bağlı 135 fiş → Numune Depo; 132 fiş → Gönderi. Daha yeni hareket esas alınır.</p><h3 class="section-title">Teyit bekleyen alanlar</h3><p class="explanation warning">Kumaşın otomatik giriş/çıkış kuralı ve baskı–nakış tamamlanma işareti henüz tanımlanmadı; elle takip edilebilir. Kalitede olmak kalite onayı değildir. Orijinal/Deneme ERP numune alt türünden ayrı seçilir. Dikim grupları Elif Özbayrak ile teyit edilerek tanımlanabilir.</p><p class="explanation">'+esc(a.barcodePrintPolicy||'Barkod kartı varlığı basım kabulüyle Kesimde gösterilir; ayrı baskı zamanı kaydı doğrulanmadı.')+'</p><p class="explanation">Ara işlem kaynağı ERP rota planı veya V2 kullanıcı teyididir. Alan okunamadıysa boş kabul edilmez; kesim sonrası kayıt kontrolü bekler. Kumaş/ara işlem tamamlama kuralı uydurulmaz.</p><h3 class="section-title">Fiş kapsamı</h3><p class="explanation">'+(a.receiptCount||0)+' fiş satırı · '+(a.receiptEligibleCount||0)+' otomatik geçişe uygun · '+(a.receiptPendingCount||0)+' bağ/transfer teyidi bekliyor. 135 ERP’de genel transfer çıkışıdır; doğrulanan modelhane mamul deposu 80 ve karşı 17 girişi kontrol edilir. Numune versiyonuna bağlı fiş, çok barkod varsa hangi barkodun hareket ettiğini kanıtlamaz.</p><h3 class="section-title">Veri kalitesi</h3><p class="explanation">'+Object.entries(a.issues||{}).map(([id,n])=>esc(id)+': '+n).join('<br>')+'</p><p class="explanation">Koleksiyon sorumlusu: tasarımcı. Üretim numunesi sorumlusu: modelhane yöneticisi. Bu sürümde kullanıcı rol/yetki denetimi yok; sorumluluk alanları takip içindir. ERP yalnız okunur. V2 grupları ve ara işlem teyitleri yerel veritabanında; sorumlu, hedef tarih, revizyon notu ve onay aynı V2 sunucusunda paylaşılır. Elle aşama, tür ve kartın grup ataması bu tarayıcıda saklanır. 60 saniyelik fark güncellemesi sürer.</p>');}
async function refreshTeamAddress(){
 try{
  const health=await api('/api/health'),link=$('#teamUrl');
  link.hidden=!health.teamUrl;
  if(health.teamUrl){link.href=health.teamUrl;link.textContent='Ekip adresi · '+new URL(health.teamUrl).host;}
 }catch{}
}
async function loadState(){const next=await api('/api/state');next.followups??={};
 await importLocal(next);
 for(const [id,latest] of Object.entries(state.followups||{})){
  if(latest.version>(next.followups[id]?.version||0))next.followups[id]=latest;
 }
 if(JSON.stringify(next)!==JSON.stringify(state)){state=next;reconcile();return true;}return false;}
async function poll(initial=false){if(fetching)return;fetching=true;refreshTeamAddress();try{const data=await api('/api/erp/delta?since='+encodeURIComponent(revision)),oldBrands=JSON.stringify(meta.brands||[]);if(data.full)raw=new Map(data.updated.map(r=>[r.id,r]));else{for(const id of data.removed)raw.delete(id);for(const r of data.updated)raw.set(r.id,r);}revision=data.revision;meta=data;if(initial||oldBrands!==JSON.stringify(data.brands||[]))buildBrands();await loadState();reconcile();render();patchOpenDetail();$('#connection').textContent=data.connected?'ERP canlı · 60 sn':data.fetchedAt?(data.partialArchive?'Kısmi ERP arşivi · ':'Son ERP verisi · ')+date(data.fetchedAt):'ERP bağlantısı bekleniyor';$('#connection').classList.toggle('live',!!data.connected);if(practice)$('#connection').textContent='Örnek ERP verisi';
 $('#connection').title=data.connected?'ERP her 60 saniyede kontrol edilir.':(data.partialArchive?'ERP çevrimdışı. Yalnızca önceki okumada yer alan ve son 30 güne giren kayıtlar gösteriliyor.':'ERP bağlantısı bekleniyor. Kartlar son başarılı okumaya ait.');$('#syncStatus').textContent=(data.connected?'Son ERP okuması: ':'Son başarılı veri: ')+date(data.fetchedAt)+(data.full?' · '+raw.size+' kayıt':data.updated.length||data.removed.length?' · '+data.updated.length+' güncellendi, '+data.removed.length+' çıktı':' · Değişiklik yok');if(demo){
 $('#connection').textContent='Koleksiyon demosu';$('#connection').title='Temsili görsellerle örnek Canva ve üretim akışı';
 $('#connection').classList.remove('live');$('#syncStatus').textContent='Üretim hareketleri bu demo içinde canlandırılır.';
 }
}catch(e){$('#connection').textContent='Sunucuya ulaşılamıyor';$('#connection').classList.remove('live');$('#syncStatus').textContent='Veriler korunuyor. V2 başlatıcısını kontrol et.';if(initial)toast(e.message);}finally{fetching=false;}}
async function moveCard(id,to){
 let r=records.find(row=>row.id===id);
 if(!r||r.stage===to)return;
 if(to==='revise'&&r.approval!=='revise'){
  try{acceptShared(await api('/api/followups',{id,changes:{approval:'revise'},versions:sharedRow(id).versions}));}
  catch(error){if(error.current){acceptShared(error.current);reconcile();render();}toast(error.message);return;}
  r=records.find(row=>row.id===id);
  if(!r)return;
 }
 const updated=T.move(r,to,'Görsel kart sürüklenerek taşındı.');
 records=records.map(row=>row.id===id?updated:row);retain(updated);reconcile();
 lastManualMove=id;
 if($('#stageFilter').value && $('#stageFilter').value!==to)$('#stageFilter').value='';
 render();
 const moved=cardNodes.get(id);
 if(view==='board'&&moved&&!moved.hidden)moved.scrollIntoView?.({block:'nearest',inline:'nearest'});
 toast(to==='revise'?'Revizyon isteği ekiple paylaşıldı.':stage(to).name+' · Elle düzeltildi.');
}
// The ERP can attach a 32/40 px document icon in place of a garment photo.
function hideBoardThumbnail(event){
 const image=event.target;
 if(!image.matches?.('.card-face .photo img'))return;
 if(event.type==='load'&&Math.max(image.naturalWidth,image.naturalHeight)>48)return;
 image.closest('.photo').hidden=true;
 image.closest('.card-face').classList.remove('has-photo');
}
$('#board').addEventListener('load',hideBoardThumbnail,true);
$('#board').addEventListener('error',hideBoardThumbnail,true);
$('#board').addEventListener('click',e=>{
 const button=e.target.closest('[data-more-stage]');if(!button)return;
 const id=button.dataset.moreStage;laneLimits.set(id,(laneLimits.get(id)||16)+16);render();
});
$('#moreList').onclick=()=>{listLimit+=60;render();};
const brandPicker=$('#brandPanel'),brandButton=$('#mobileBrands');
function closeBrandPicker(){
 brandPicker.hidden=true;brandButton.setAttribute('aria-expanded','false');
}
brandButton.onclick=()=>{
 if(!brandPicker.hidden){closeBrandPicker();return;}
 brandPicker.hidden=false;brandButton.setAttribute('aria-expanded','true');
 const rect=brandButton.getBoundingClientRect();
 brandPicker.style.top=Math.min(rect.bottom+6,Math.max(80,window.innerHeight-295))+'px';
 $('#brandSearch').focus();
};
document.addEventListener('click',event=>{
 if(!brandPicker.hidden&&!brandPicker.contains(event.target)&&!brandButton.contains(event.target))closeBrandPicker();
 const summary=$('#stats');
 if(summary.open&&!summary.contains(event.target))summary.open=false;
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!brandPicker.hidden){closeBrandPicker();brandButton.focus();}
});

$('#brandTree').onclick=e=>{const toggle=e.target.closest('[data-expand-brand]');if(toggle){const id=toggle.dataset.expandBrand;if(openBrandBranches.has(id))openBrandBranches.delete(id);else openBrandBranches.add(id);renderSidebar();$$('#brandTree [data-expand-brand]').find(n=>n.dataset.expandBrand===id)?.focus({preventScroll:true});return;}const b=e.target.closest('[data-brand]'),n=e.target.closest('[data-branch]');if(b){handoffModel='';brandFilter=b.dataset.brand;branchFilter='';render();}else if(n){handoffModel='';branchFilter=n.dataset.branch;brandFilter=branchById.get(branchFilter)?.brandId||'';render();}};$('#allBrands').onclick=()=>{handoffModel='';brandFilter=branchFilter='';render();};$('#brandSearch').oninput=renderSidebar;
brandPicker.addEventListener('click',event=>{
 if(!brandPicker.hidden&&event.target.closest('#allBrands,[data-brand],[data-branch]')){
  closeBrandPicker();brandButton.focus();
 }
});
$$('[data-mode]').forEach(button=>button.onclick=()=>{
 const next=button.dataset.mode;
 if(mode===next&&next!=='collections')return;
 mode=next;handoffModel='';$('#search').value='';
 if(next==='collections')designerWorkspace.openPresentation(demo?.deckId||'');
 if(next==='universe')activeCatalog().load();
 render();
});
$$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});
for(const id of ['search','collectionFilter','collectionStateFilter','stageFilter','versionFilter','workKindFilter','natureFilter','groupFilter','allScope','allStages'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
$('#toggleFilters').onclick=()=>{filtersOpen=!filtersOpen;updateFilterBar();};
$('#attentionBar').onclick=e=>{const button=e.target.closest('[data-attention]');if(button){attention=button.dataset.attention;render();}};
$('#clearFilters').onclick=()=>{resetFilters();render();};
$('#board').addEventListener('dragstart',e=>{
 const card=e.target.closest('.card');if(!card)return;
 dragged=card.dataset.id;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';
 for(const target of $$('#board .board-process, #board .column'))target.hidden=false;
});
$('#board').addEventListener('dragover',e=>{const col=e.target.closest('.column');if(col&&dragged){e.preventDefault();$$('.column.over').forEach(n=>n.classList.remove('over'));col.classList.add('over');}});
$('#board').addEventListener('drop',e=>{const col=e.target.closest('.column');if(!col||!dragged)return;e.preventDefault();const id=dragged;dragged=null;moveCard(id,col.dataset.stage);$$('.column.over').forEach(n=>n.classList.remove('over'));});
$('#board').addEventListener('dragend',()=>{dragged=null;$$('.column.over').forEach(n=>n.classList.remove('over'));render();});
document.addEventListener('click',async e=>{if(e.target.closest('[data-close]')){$('#modal').close();selected=null;return;}const info=e.target.closest('[data-info]');if(info){toast(info.dataset.info);return;}const card=e.target.closest('.card,#listBody tr');if(card){openDetail(card.dataset.id);return;}
 const deck=e.target.closest('[data-open-deck],[data-cover-deck]');
 if(deck){mode='collections';$('#search').value='';designerWorkspace.openPresentation(deck.dataset.openDeck||deck.dataset.coverDeck);render();return;}
 const open=e.target.closest('[data-open-collection]');if(open){mode='workshop';const includeHidden=$('#allScope').checked;resetFilters();$('#allScope').checked=includeHidden;$('#collectionFilter').value=open.dataset.openCollection;$('#stageFilter').value=open.dataset.collectionStage||'';render();return;}const edit=e.target.closest('[data-edit-collection]');if(edit){collectionForm(state.collections.find(c=>c.id===edit.dataset.editCollection));return;}const sync=e.target.closest('[data-sync-canva]');if(sync){try{const result=await api('/api/canva/sync',{id:sync.dataset.syncCanva});toast(result.started?'Canva güncellemesi kontrol ediliyor.':'Başka bir Canva alımı sürüyor; birazdan yeniden dene.');await loadState();render();}catch(e){toast(e.message);}}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.card,#listBody tr')){e.preventDefault();openDetail(e.target.dataset.id);}});
$('#collectionArchive').onclick=()=>{$('#collectionStateFilter').value='archived';filtersOpen=true;render();};
$('#groupsBtn').onclick=()=>groupsDialog();$('#createBtn').onclick=()=>collectionForm(null,false,mode==='collections'?designerWorkspace.designerName:'');$('#canvaBtn').onclick=()=>collectionForm(null,true,mode==='collections'?designerWorkspace.designerName:'');$('#analysisBtn').onclick=analysis;$('#modal').addEventListener('close',()=>{selected=null;});
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({schemaVersion:2,trackingSince:TRACKING_SINCE,exportedAt:new Date().toISOString(),edits:[...localEdits.values()],followups:state.followups||{},collections:state.collections,models:state.models,groups:state.groups||[],processSettings:state.processSettings||[]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='NumuneTakip-V2-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('#restoreBtn').onclick=()=>$('#restoreFile').click();$('#restoreFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>8e6)throw Error('Yedek 8 MB sınırını aşıyor.');const b=JSON.parse(await file.text());if(b.trackingSince!==TRACKING_SINCE)throw Error("Bu yedek güncel takip dönemine ait değil.");if(b.schemaVersion!==2||!Array.isArray(b.edits))throw Error('NumuneTakip V2 yedeği seç.');for(const x of b.edits){if(typeof x.id!=='string'||x.override&&!T.stages.some(s=>s.id===x.override.stage))throw Error('Yedekte geçersiz kayıt var.');}for(const g of b.groups||[])await api('/api/groups',g);for(const setting of b.processSettings||[])await api('/api/process-settings',setting);for(const c of b.collections||[])await api('/api/collections',{...c,fromBackup:true});if(b.models?.length)await api('/api/models/restore',{models:b.models});for(const entry of Object.values(b.followups||{})){
 const values=Object.fromEntries(Object.keys(entry.versions).map(k=>[k,entry[k]]));
 await api('/api/followups/import',{id:entry.id,values,history:entry.history,fromBackup:true});
 }for(const x of b.edits)localEdits.set(x.id,x);records=[];localSave();await loadState();reconcile();render();toast('Koleksiyonlar, notlar ve elle düzeltmeler geri yüklendi.');}catch(error){toast(error.message);}e.target.value='';};
designerWorkspace=window.createDesignerWorkspace?.($('#designerView'),{
 stageName:id=>stage(id).name,
 followup:sharedRow,
 update:render,
 navigation(){ $('#search').value='';render();$('.workspace').scrollIntoView?.({block:'start'}); },
 async action(kind,key){
  if(demo&&kind==='add-demo')return demo.upload(openModal,async page=>{
   $('#modal').close();await poll();openDemoSlide(page);toast('Görsel koleksiyona eklendi.');
  });
  const c=state.collections.find(item=>item.id===key);
  const model=state.models.find(item=>item.id===key&&!item.retired);
  if(kind==='sample')return openDetail(key);
  if(kind==='edit'&&c)return collectionForm(c);
  if(kind==='link'&&model)return linkModel(model);
  if(kind==='workshop'&&model&&(model.handoff||model.productionBrief))return openHandoff(model);
  if(kind==='handoff'&&model)return handoffDialog(model);
  if(kind==='sync'&&c){
   try{const result=await api('/api/canva/sync',{id:key});
    await loadState();render();
    if(!result.started)toast('Başka bir Canva alımı sürüyor. Birazdan tekrar dene.');
   }catch(error){toast(error.message);}
  }
 }
});
$('#stageFilter').innerHTML='<option value="">Tüm aşamalar</option>'+T.stages.filter(s=>!s.legacy).map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');initColumns();
(async()=>{if(practice){taxonomy=sampleService.taxonomy;}
else{try{taxonomy=await(await fetch('brand-taxonomy.json')).json();}catch{}try{erpGroupCatalog=(await(await fetch('erp-group-catalog.json')).json()).groups||[];}catch{}}
buildBrands();await poll(true);
if(demo){
 const link=$('#demoEntry');link.textContent='Canlı NTS’ye dön';link.href='./#uretim';
 $('#saveStatus').textContent='Demo değişiklikleri bu sekmede saklanır.';
 if(location.hash==='#koleksiyon')openDemoSlide();
 return;
}
if(practice)return;
async function openCatalogLink(){
 const route=location.hash;
 const workspace={'#koleksiyon':'collections','#uretim':'workshop','#modelhane':'workshop','#tasarimcilar':'collections'}[route];
 if(workspace){$('[data-mode="'+workspace+'"]').click();return;}
 if(route==='#uff-uretim'){selectCatalog('uff');return;}
 if(route==='#universe'||route==='#katalog-bekleyenler'){
  selectCatalog(route==='#universe'?'recent':'pending');return;
 }
 if(!route.startsWith('#uretim?'))return;
 const params=new URLSearchParams(route.slice('#uretim?'.length)),query=new URLSearchParams({style:params.get('style')||'',main:params.get('main')||''});
 try{
  const result=await api('/api/universe/production?'+query);
  if(route!==location.hash)return;
  if(result.recordIds.some(id=>!records.some(r=>r.id===id)))await poll();
  if(route!==location.hash)return;
  const ids=result.recordIds.filter(id=>records.some(r=>r.id===id));
  if(result.match==='sample'&&ids.length===1){openDetail(ids[0]);return;}
  if(ids.length){openCatalogSamples({...result,recordIds:ids,name:'ERP kart '+result.styleId});return;}
  const message=result.match==='conflict'?'ERP kartı ile ana model kimlikleri çelişiyor.':!result.erpReadAt?'ERP verisinin ilk okuması bekleniyor.':'Bu ürün için NTS’de eşleşen numune bulunamadı.';
  openModal('NTS üretim kaydı','<p>'+message+'</p>'+(result.erpReadAt?'<small>ERP okuması · '+esc(date(result.erpReadAt))+'</small>':''));
 }catch(error){if(route===location.hash)openModal('NTS üretim kaydı','<p>'+esc(error.message)+'</p>');}
}
window.addEventListener('hashchange',openCatalogLink);openCatalogLink();
setInterval(()=>{poll();if(mode==='universe')activeCatalog().load();},60000);setInterval(async()=>{if(Object.values(state.jobs).some(j=>j.status==='running'))try{if(await loadState()){render();patchOpenDetail();}}catch{}},2500);})();
if(practice&&!demo)window.NTSPractice.restart=async()=>{
 if($('#modal').open)$('#modal').close();
 selected=openedStage=detailBase=null;
 mode='workshop';view='board';brandFilter=branchFilter='';filtersOpen=false;
 resetFilters();designerWorkspace?.openPresentation('');
 raw.clear();records=[];localEdits.clear();revision='';
 state={collections:[],models:[],jobs:{}};
 window.NTSPractice.reset();await poll(true);
};
window.NumuneV2Debug={get records(){return records;},get revision(){return revision;},poll,render,moveCard};
})();

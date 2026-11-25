(() => {
  'use strict';
  const frame = window.frameElement;
  if (!frame?.hasAttribute('data-nts-practice')) return;
  document.documentElement.classList.add('nts-practice');
  const example = frame.ntsExample || {};
  const model = example.name || 'Bisiklet yaka tişört';
  const photo = example.photo || '';
  const now = new Date();
  const entered = new Date(now.getTime() - 3 * 86400000).toISOString();
  const key = 'erp-model:1042';
  const id = 'erp-bc-1042-1';
  const stage = 'sewing';
  const movement = {id:1,stage,workflowStage:stage,process:'Dikim',kind:0,at:entered,employeeName:'Örnek dikim grubu'};
  const row = {id,model,modelKey:key,barcode:'NT-1042',version:1,recordType:'barcode',
    brand:example.brand||'H&M',department:example.department||'Jersey',sample:'Deneme',sampleCode:'NUM-1042',mainCode:'MDL-1042',erpPhoto:photo,
    erp:{stage,reason:'Dikime giden barkod okutuldu.',recId:1042,mainRecId:1042,movements:[movement],milestones:{sewing:movement},
      workflowMilestones:{sewing:movement},stageEntry:{source:'barcode',stage,at:entered}}};
  const second = structuredClone(row);
  Object.assign(second,{id:'erp-bc-1042-2',barcode:'NT-1043',version:2});
  const design = {id:'canva-tour-model',model,photo,productLine:'Jersey',slideId:'tour-page',source:'canva'};
  const deck = {id:'tour-collection',name:'Jersey kapsülü',brandId:'guide-brand',designer:'Tasarım ekibi',status:'active',
    canvaDesignId:'tour-deck',canvaTitle:'Jersey kapsülü',modelKeys:[key,design.id],
    canvaSlides:[{id:'tour-page',number:1,title:'Yaka ve kalıp çalışması',photo,productLine:'Jersey'}]};
  const state = {models:[design],collections:[deck],followups:{},jobs:{},groups:[],processSettings:[]};
  let revision = 1;
  const initialRow=structuredClone(row),initialDesign=structuredClone(design);
  function reset(){
    Object.assign(row,structuredClone(initialRow));
    for(const field of Object.keys(design))delete design[field];
    Object.assign(design,structuredClone(initialDesign));
    state.followups={};
    revision=1;
  }
  function scanReturn() {
    if(row.erp.stage==='quality')return;
    const next = {...movement,id:2,stage:'returned',workflowStage:'quality',kind:1,at:now.toISOString()};
    row.erp.stage='quality';row.erp.reason='Dikimden gelen barkod okutuldu.';
    row.erp.movements.push(next);row.erp.milestones.returned=next;row.erp.workflowMilestones.quality=next;
    row.erp.stageEntry={source:'barcode',stage:'quality',at:next.at};
    revision++;
  }
  async function request(path, data) {
    if(path==='/api/universe/pending')return {available:true,readAt:now.toISOString(),erpReadAt:now.toISOString(),erpConnected:true,pending:[],unresolved:[],approved:0,catalogued:0};
    if(path==='/api/universe/uff')return {available:true,products:[],sources:[]};
    if(path==='/api/universe/recent')return {available:true,readAt:now.toISOString(),products:[{id:'1042',category:'3',name:model,brand:row.brand,department:row.department,code:'MDL-1042',styleId:'1042',mainId:'1042',addedAt:now.toISOString(),match:'sample',recordIds:[id,second.id]}]};
    if(path==='/api/health')return {sharedFollowup:true};
    if(path==='/api/state')return structuredClone(state);
    if(path.startsWith('/api/erp/delta?')){
      const since=new URLSearchParams(path.slice(path.indexOf('?')+1)).get('since');
      return {full:!since,updated:since===String(revision)?[]:structuredClone([row,second]),
        removed:[],connected:true,revision:String(revision),analysis:{},brands:[],fetchedAt:now.toISOString()};
    }
    if(path==='/api/followups' && data.id===id){
      const entry=state.followups[id]||={id,...window.TeamFollowup.defaults,versions:{},version:0,history:[]};
      entry.version++;Object.assign(entry,data.changes);
      for(const k of Object.keys(data.changes))entry.versions[k]=entry.version;
      entry.history.push({at:new Date().toISOString(),changes:{...data.changes}});
      return structuredClone(entry);
    }
    if(path==='/api/models/link' && data.id===design.id && data.erpModelKey===key){
      design.erpModelKey=key;return structuredClone(design);
    }
    if(path==='/api/models/handoff' && data.id===design.id && design.erpModelKey===key && data.erpModelKey===key){
      design.handoff={erpModelKey:key,note:data.note};return structuredClone(design);
    }
    throw Error('Bu işlem tanıtım alıştırmasının dışında.');
  }
  window.NTSPractice = {request,scanReturn,reset,taxonomy:{brands:[{id:'guide-brand',name:row.brand,erpAliases:[row.brand],children:[]}]}};
})();

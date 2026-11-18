(function(root){
  'use strict';
  const stages=[{"id": "design", "name": "Tasarım", "color": "#9f8bbf", "description": "Canva tasarımı. Üretime geçiş için tekil ERP numune/model eşleştirmesi gerekir."}, {"id": "pattern", "name": "Kalıp sırası", "color": "#9a8ab9", "description": "Numune kartındaki Kalıp No boş. Kalıp üzerinde çalışılmaya başlandığı anlamına gelmez."}, {"id": "pattern_done", "name": "Kalıp tamamlandı", "color": "#8b8fc4", "description": "ERP numune kartının Kalıp No alanı dolu. Daha yeni üretim hareketi önceliklidir."}, {"id": "material", "name": "Kumaş", "color": "#b5a777", "description": "Kumaş hazırlığı veya bekleme. ERP otomatik geçiş kuralı henüz tanımlı değil; elle takip edilir."}, {"id": "cutting_in", "name": "Kesimde", "color": "#6899b6", "description": "Barkod basımıyla iş kesimdedir. ERP barkod kartı ve baskı kanıtı ayrıntıda gösterilir."}, {"id": "intermediate_review", "name": "Ara işlem teyidi", "color": "#b89b6d", "description": "Kesim okutulmuş; numunenin rota/ara işlem seçimi belirsiz. Karttan Ara işlem yok, Baskı veya Nakış teyidi verilir."}, {"id": "external", "name": "Baskı – Nakış", "color": "#9879b7", "description": "Kesim okutulmuş ve numune kartında ara işlem seçili. Ara işlem bitti kuralı tanımlanana kadar yeni dikim hareketi veya elle teyit beklenir."}, {"id": "queue", "name": "Dikim sırası", "color": "#789cc7", "description": "Kesim operasyonu okutulmuş, numune kartında ara işlem seçilmemiş. Dikime giden barkod henüz okutulmamış."}, {"id": "sewing", "name": "Dikimde", "color": "#517cc6", "description": "Dikime giden barkod okutuldu: Dikim + InOut=0. Atanan personel/kaynak ve ERP kayıt kullanıcısı ayrı gösterilir."}, {"id": "quality", "name": "Kalitede", "color": "#41a89b", "description": "Dikimden gelen barkod okutuldu: Dikim + InOut=1. Kalite onayı verildiği anlamına gelmez."}, {"id": "warehouse", "name": "Numune Depo", "color": "#719e85", "description": "Numuneye kesin bağlanan 135 fiş hareketi var. Barkod/numune bağlantısı ve tarih ayrıntıda gösterilir."}, {"id": "shipping", "name": "Gönderi", "color": "#486b61", "description": "Numuneye kesin bağlanan 132 fiş hareketi var. Müşterinin teslim aldığı anlamına gelmez."}, {"id": "revise", "name": "Revize", "color": "#c8925b", "description": "Revizyon bekleniyor. Açıklama ve onay durumu karttan takip edilir."}, {"id": "done", "name": "Tamamlandı", "color": "#699575", "description": "Ayrıca tamamlandığı teyit edilmiş numune. Kaliteye giriş tek başına tamamlanma değildir."}, {"id": "review", "name": "Kayıt kontrolü", "color": "#c08c6d", "description": "Eksik tarih, çelişen son hareket veya belirsiz ara işlem/fiş bağlantısı; ayrıntıda sebebi gösterilir."}, {"id": "cutting", "name": "Kesimden döndü · önceki kayıt", "color": "#5893ab", "description": "Eski V2 aşama kaydı. Yeni süreçte ara işleme veya dikim sırasına dönüştürülür.", "legacy": true}, {"id": "returned", "name": "Dikimden döndü · önceki kayıt", "color": "#41a89b", "description": "Eski V2 aşama kaydı. Yeni süreçte Kalitede olarak izlenir.", "legacy": true}];
  const normal=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
  function classify(status){
    const s=normal(status);let stage='review',reason='Açık bir işlem aşaması yok.';
    const rules=[[/kalitede/,'quality'],[/dikim sirasinda|dikim sirasi/,'queue'],[/dikimde|\bdikim\b/,'sewing'],[/kesimde/,'cutting'],[/nakista|baskida|dis isleme gitti|dis islemde|yikamada/,'external'],[/kumas bek|astar bek|triko bek|kumas.*gelecek/,'material'],[/kalipta|kalip calis|kalip hazir|kalip ok/,'pattern'],[/bitti|tamamlandi/,'done'],[/\bdhl\b|gonderildi/,'shipping']];
    if(!/dis isleme gidecek|revize gelecek|\bvaliz\b/.test(s))for(const [rx,id] of rules)if(rx.test(s)){stage=id;reason='Kaynak durumdan eşleştirildi.';break;}
    if(stage==='queue')reason='“Dikim sırasında” ifadesi dikim sırası olarak yorumlandı; doğrulanabilir.';
    if(stage==='shipping')reason='Kaynakta gönderim ifadesi var; teslim teyidi veya takip numarası yok.';
    return {stage,reason};
  }
  function decorate(record){
    const r={...record,sourceStatus:record.sourceStatus??record.status};const c=classify(r.status);r.erpStage=r.erpStatusUnresolved?'review':['barcode','sample','canva'].includes(r.recordType)?(r.erp?.stage||'review'):c.stage;r.reason=r.erpStatusUnresolved?'ERP’de önceki işlem artık doğrulanamıyor; aşama kontrol edilmeli.':['barcode','sample','canva'].includes(r.recordType)?(r.erp?.reason||'Barkod hareketlerinden hesaplandı.'):c.reason;
    if(r.erp?.workflowVersion===3&&r.override&&['cutting','returned'].includes(r.override.stage)){const previous=r.override.stage;const migrated=previous==='returned'?'quality':r.erp.intermediateSelected===true?'external':r.erp.intermediateSelected===false?'queue':'intermediate_review';r.override={...r.override,stage:migrated,conflict:true,migratedFrom:previous};}
    r.stage=r.override?.stage||r.erpStage;r.conflict=!!r.override?.conflict;
    const s=normal([r.status,r.fabric,r.accessory,r.notes].join(' '));
    r.blockers=[];
    if(/kumas.*bilgisi\?|kumas yok|kumas.*gelecek|kumas bek/.test(s))r.blockers.push('Kumaş bilgisi / tedariği');
    if(/fermuar.*bek|fermuar\?|aksesuar.*bek|astar bek|triko bek/.test(s))r.blockers.push('Aksesuar / malzeme bekliyor');
    if(/revize gelecek/.test(s))r.blockers.push('Revizyon bekliyor');
    if(/kumas.*yok/.test(s)&&!r.blockers.length)r.blockers.push('Kumaş eksik');
    return r;
  }
  function history(r,event){return [...(r.history||[]),{at:new Date().toISOString(),...event}].slice(-250);}
  function move(record,stage,note){
    if(!stages.some(s=>s.id===stage))throw Error('Geçersiz işlem kümesi.');
    const r=decorate(record);
    return decorate({...r,override:{stage,baseStatus:r.status,baseStage:r.erpStage,conflict:false},history:history(r,{type:'manual',from:r.stage,to:stage,note:String(note||'').slice(0,2000)})});
  }
  function acceptERP(record){const r=decorate(record);return decorate({...r,override:null,history:history(r,{type:'accept',from:r.stage,to:r.erpStage,note:'ERP durumu kabul edildi.'})});}
  function saveDetail(record,openedStage,selectedStage,note){
    let r=decorate(record);const text=String(note||'').slice(0,5000);
    if(selectedStage!==openedStage)r=move(r,selectedStage,text);
    if(text!==(r.userNote||''))r={...r,history:history(r,{type:'note',note:text})};
    return decorate({...r,userNote:text});
  }
  function applyUpdates(records,updates){
    if(!Array.isArray(updates)||!updates.length||updates.length>10000)throw Error('updates dizisi boş veya geçersiz.');
    const known=new Set(records.map(r=>r.id)),seen=new Set();
    for(const u of updates){
      if(!u||typeof u.id!=='string'||!known.has(u.id))throw Error('Bilinmeyen kayıt kimliği: '+String(u?.id||''));
      if(seen.has(u.id))throw Error('Aynı kayıt birden fazla kez güncellenemez.');seen.add(u.id);
      if(typeof u.status!=='string'||!u.status.trim()||u.status.length>4000)throw Error('Geçersiz ERP durumu.');
      if(u.photo!==undefined&&(typeof u.photo!=='string'||!/^https:\/\//i.test(u.photo)))throw Error('Fotoğraf adresi HTTPS olmalı.');
    }
    const by=new Map(updates.map(u=>[u.id,u]));
    return records.map(record=>{
      const u=by.get(record.id);if(!u)return decorate(record);
      const r=decorate(record);let override=r.override?{...r.override}:null;
      if(override&&classify(u.status).stage===override.stage)override=null;
      else if(override&&u.status!==override.baseStatus)override.conflict=true;
      const changed=u.status!==r.status||u.photo&&u.photo!==r.photo;
      return decorate({...r,status:u.status,statusOrigin:'erp',erpStatusUnresolved:false,...(u.photo?{photo:u.photo}:{}),override,erpUpdatedAt:new Date().toISOString(),history:changed?history(r,{type:'erp',from:r.erpStage,to:classify(u.status).stage,note:u.status}):r.history});
    });
  }
  function reconcileERP(records,data){
    const sources=records.filter(r=>!['barcode','sample','canva'].includes(r.recordType)).map(record=>{
      let r=decorate(record);const erp=data.matches?.[r.id]||null;
      if(erp?.liveStatus){
        r=applyUpdates([r],[{id:r.id,status:erp.liveStatus}])[0];
      }else if(data.connected&&r.statusOrigin==='erp'){
        r={...r,status:r.sourceStatus,erpStatusUnresolved:true};
        if(r.override)r.override={...r.override,conflict:true};
      }
      return decorate({...r,initialStatus:r.sourceStatus,erp,erpPhoto:erp?.photo||null});
    });
    const oldBarcodes=new Map(records.filter(r=>['barcode','sample','canva'].includes(r.recordType)).map(r=>[r.id,r]));
    if(!Array.isArray(data.barcodes))return [...sources,...oldBarcodes.values()];
    const incoming=new Set();const result=[];
    for(const row of data.barcodes){
      if(incoming.has(row.id))continue;incoming.add(row.id);
      const old=oldBarcodes.get(row.id);let override=old?.override?{...old.override}:null;
      if(override&&override.stage===row.erp?.stage)override=null;
      else if(override&&(row.status!==override.baseStatus||row.erp?.stage!==(override.baseStage||old.erpStage)))override.conflict=true;
      const changed=old&&old.erpStage!==row.erp?.stage;
      result.push(decorate({...row,sourceStatus:row.status,statusOrigin:'barcode',override,userNote:old?.userNote||'',history:changed?history(old,{type:'erp',from:old.erpStage,to:row.erp?.stage,note:row.status}):old?.history||[],erpStatusUnresolved:false,erpMissing:false}));
    }
    for(const old of oldBarcodes.values())if(!incoming.has(old.id)){
      result.push(data.connected?decorate({...old,erpMissing:true,erpStatusUnresolved:true,override:old.override?{...old.override,conflict:true}:null}):old);
    }
    return [...sources,...result];
  }
  function restoreEdits(records,edits){
    if(!Array.isArray(edits))throw Error('Geçersiz yedek.');
    const by=new Map();
    for(const e of edits){
      if(!e||typeof e.id!=='string'||by.has(e.id))throw Error('Tekrarlı veya geçersiz yedek kaydı.');
      if(e.override&&!stages.some(s=>s.id===e.override.stage))throw Error('Geçersiz işlem kümesi.');
      if(e.status!==undefined&&typeof e.status!=='string')throw Error('Geçersiz durum.');
      by.set(e.id,e);
    }
    return records.map(record=>{
      const e=by.get(record.id);if(!e)return record;
      return decorate({...record,...(['barcode','sample','canva'].includes(record.recordType)?{}:{status:e.status||record.status,statusOrigin:e.statusOrigin||null,erpStatusUnresolved:!!e.erpStatusUnresolved}),override:e.override||null,userNote:String(e.userNote||'').slice(0,5000),history:Array.isArray(e.history)?e.history.slice(-250):[],erpUpdatedAt:e.erpUpdatedAt||null});
    });
  }
  function restoreBackup(records,edits){
    restoreEdits([],edits);const known=new Set(records.map(r=>r.id));const base=[...records];
    for(const e of edits)if(!known.has(e.id)&&/^(erp-bc-[0-9]+-[0-9]+|erp-sample-[0-9]+)$/.test(e.id)){
      const c=e.card||{},identity={};
      for(const key of ['model','barcode','sampleCode','mainCode','orderNo','sample','brand','department','body','color'])identity[key]=String(c[key]??'').slice(0,500);
      base.push(decorate({...identity,id:e.id,recordType:'barcode',model:identity.model||'ERP barkodu · kayıt bulunamadı',version:Number.isInteger(c.version)?c.version:null,house:['m1','m2','m3','erp'].includes(c.house)?c.house:'erp',hidden:!!c.hidden,source:'ERP · Önceki barkod kaydı',sheet:'Yedekten korundu',row:e.id,status:'ERP · kayıt doğrulanamadı',erp:{stage:'review',movements:[]},erpStatusUnresolved:true,erpMissing:true,photo:'',erpPhoto:null}));
    }
    return restoreEdits(base,edits).map(r=>{
      if(!['barcode','sample','canva'].includes(r.recordType)||!r.override)return r;
      const conflict=r.erpMissing||r.erpStage!==(r.override.baseStage||classify(r.override.baseStatus).stage);
      return decorate({...r,override:{...r.override,conflict:!!conflict||!!r.override.conflict}});
    });
  }
  root.Tracker={stages,normal,classify,decorate,move,acceptERP,saveDetail,applyUpdates,reconcileERP,restoreEdits,restoreBackup};
})(typeof window!=='undefined'?window:globalThis);

(() => {
 'use strict';
 window.createCatalogQueue=function({api,esc,normal,refresh,openSamples}){
  const el=id=>document.getElementById(id);
  let data=null,busy=false,error=false,again=false,page=0,previous='',markup='';
  const stamp=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',dateStyle:'short',timeStyle:'short'});
  async function load(){
   if(busy){again=true;return;}
   busy=true;refresh();
   try{data=await api('/api/universe/pending');error=false;}
   catch{error=true;data=null;}
   finally{busy=false;refresh();if(again){again=false;load();}}
  }
  function render(query,includesBrand,records){
   const q=normal(query),byId=new Map(records.map(r=>[r.id,r]));
   const selection=document.querySelector('#brandTree [aria-current="true"]');
   const filter=JSON.stringify([q,selection?.dataset.brand,selection?.dataset.branch]);
   if(previous!==filter){previous=filter;page=0;}
   const items=[];
   for(const entry of [...(data?.pending||[]),...(data?.unresolved||[])]){
    const linked=entry.recordIds.map(id=>byId.get(id)).filter(Boolean),r=linked[0]||{};
    if(!includesBrand(r,linked))continue;
    if(q&&!normal([entry.styleId,...entry.recordIds,...linked.flatMap(n=>[n.model,n.barcode,n.sampleCode,n.mainCode,n.brand,n.userOwner])].join(' ')).includes(q))continue;
    items.push({entry,linked,r});
   }
   items.sort((a,b)=>Number(!!a.entry.state)-Number(!!b.entry.state)||(a.r.model||'').localeCompare(b.r.model||'','tr'));
   const pages=Math.ceil(items.length/24);
   page=Math.max(0,Math.min(page,pages-1));
   el('queueStatus').textContent=error?'Bekleme listesi okunamadı.':busy?'Onaylar kontrol ediliyor…':
    data?.available===false?'Katalog bağlantısı bekleniyor.':data?.readAt?'Katalog kontrolü · '+stamp.format(new Date(data.readAt)):'';
   el('queueErp').textContent=data?.erpReadAt?(data.erpConnected?'ERP okuması · ':'Son kayıtlı ERP verisi · ')+stamp.format(new Date(data.erpReadAt)):'';
   el('queueCounts').textContent=data?data.pending.length+' bekleyen · '+data.catalogued+' dönem içinde eşleşti · '+data.unresolved.length+' doğrulama bekliyor':'';
   const messages={identity:'ERP kart kimliği bekleniyor',conflict:'Ana model kimlikleri çelişiyor',unavailable:'Katalog kontrolü bekleniyor'};
   const html=items.slice(page*24,(page+1)*24).map(({entry,linked,r})=>{
    const photo=linked.find(n=>/^erp-photos\/\d+\.jpg(?:\?v=\d+)?$/i.test(n.erpPhoto||''))?.erpPhoto;
    const codes=linked.map(n=>[n.barcode,n.version!=null&&'V'+n.version].filter(Boolean).join(' · '));
    return '<article class="uni-row"><div class="uni-photo"><span aria-hidden="true">'+esc((r.brand||'NT').slice(0,2))+'</span>'+(photo?'<img alt="" loading="lazy" src="'+esc(photo)+'">':'')+'</div>'+
     '<div class="uni-product"><small>'+esc(r.brand||'')+'</small><h2>'+esc(r.model||entry.recordIds[0])+'</h2><p>'+esc([r.sampleCode,entry.styleId&&'ERP kart '+entry.styleId,...codes].filter(Boolean).join(' · '))+'</p></div>'+
     '<div class="uni-match"><strong>'+esc(messages[entry.state]||'Dönem içinde katalog eşleşmesi yok')+'</strong></div><div class="uni-links">'+(linked.length?'<button class="button" data-queue-id="'+esc(entry.recordIds[0])+'">Onaylı numuneyi aç</button>':'')+'</div></article>';
   }).join('');
   const empty=!data?'Onay ve katalog bilgisi bekleniyor.':!data.approved?'Henüz katalog için onaylanmış ERP numunesi yok.':
    data.pending.length||data.unresolved.length?'Arama veya marka ile eşleşen numune yok.':'Tüm onaylı numuneler bu dönemde katalogla eşleşti.';
   const next=html||'<p class="uni-empty">'+esc(empty)+'</p>';
   if(next!==markup){el('queueRows').innerHTML=next;markup=next;}
   el('queuePager').hidden=pages<2;el('queuePrev').disabled=page===0;el('queueNext').disabled=page+1>=pages;
   el('queuePage').textContent=pages?(page+1)+' / '+pages:'';
  }
  el('queueRows').onclick=e=>{
   const b=e.target.closest('[data-queue-id]');if(!b||!data)return;
   const entry=[...data.pending,...data.unresolved].find(r=>r.recordIds[0]===b.dataset.queueId);
   if(entry)openSamples({...entry,name:'Onaylı ERP numunesi',context:'Bu ERP kartında onay verilen numuneler'});
  };
  el('queueRows').addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.hidden=true;},true);
  el('queueNext').onclick=()=>{page++;refresh();el('catalogQueue').scrollIntoView();};
  el('queuePrev').onclick=()=>{page--;refresh();el('catalogQueue').scrollIntoView();};
  return {load,render};
 };
})();
(() => {
 'use strict';
 window.createUffFeed=function({api,esc,normal,refresh}){
  const el=id=>document.getElementById(id);
  const format=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Istanbul'});
  let data=null,busy=false,error=false,page=0,previous='',markup=null;
  async function load(){
   if(busy)return;
   busy=true;refresh();
   try{data=await api('/api/universe/uff');error=false;}catch{error=true;}
   finally{busy=false;refresh();}
  }
  function render(query,includesBrand){
   const q=normal(query),evidenceSelect=el('uffEvidence');
   const matched=(data?.products||[]).filter(p=>includesBrand(p,[])&&
    (!q||normal([p.name,p.brand,p.reference,p.id].join(' ')).includes(q)));
   const evidence=[...new Set((data?.products||[]).map(p=>p.evidence).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
   const options=['',...evidence];
   if(JSON.stringify(Array.from(evidenceSelect.options,o=>o.value))!==JSON.stringify(options)){
    const selected=evidenceSelect.value;
    evidenceSelect.replaceChildren(...options.map(value=>new Option(value||'Tümü',value)));
    if(options.includes(selected))evidenceSelect.value=selected;
   }
   const products=matched.filter(p=>!evidenceSelect.value||p.evidence===evidenceSelect.value);
   const filtered=document.querySelector('#brandTree [aria-current="true"]');
   const key=JSON.stringify([q,filtered?.dataset.brand,filtered?.dataset.branch,evidenceSelect.value]);
   if(previous!==key){page=0;previous=key;}
   const pages=Math.ceil(products.length/24);
   page=Math.max(0,Math.min(page,pages-1));
   const sources=data?.sources||[],failed=sources.filter(s=>s.status!=='ok');
   const unavailable=error||failed.length>0;
   const cached=products.some(p=>p.cached);
   el('uffCount').textContent=data&&(!unavailable||products.length)?products.length+' ürün':'';
   const stamp=sources.filter(s=>s.readAt).map(s=>s.readAt).sort()[0];
   let status='';
   if(error)status='UFF listesi okunamadı.';
   else if(busy&&!data)status='Web scraping kayıtları okunuyor…';
   else if(failed.length)status=failed.length===sources.length?'UFF bağlantısı bekleniyor.':failed.map(s=>s.brand).join(', ')+' için bağlantı bekleniyor.';
   if(failed.length&&failed.every(s=>s.status==='capacity')){
    status=failed.length===sources.length?'UFF veritabanı bağlantı kapasitesi dolu.':failed.map(s=>s.brand).join(', ')+' için UFF bağlantı kapasitesi dolu.';
   }
   if(failed.some(s=>s.status==='auth'))status+=' UFF okuma yetkisi gerekiyor.';
   if(cached&&stamp)status+=' Kayıtlı okuma · '+format.format(new Date(stamp));
   el('uffStatus').textContent=status;
   el('uffColumns').hidden=!products.length;
   let html=products.slice(page*24,page*24+24).map(p=>
    '<article class="uff-row"><div class="uff-product"><div class="uni-photo"><span aria-hidden="true">'+esc(p.brand.slice(0,2))+'</span>'+
    (p.image?'<img alt="" referrerpolicy="no-referrer" loading="lazy" src="'+esc(p.image)+'">':'')+'</div>'+
    '<div class="uni-product"><small>'+esc(p.brand)+'</small><h2>'+esc(p.name)+'</h2><p>'+esc(p.reference||p.id)+'</p></div></div>'+
    '<time class="uff-date" datetime="'+esc(p.addedAt)+'">'+esc(format.format(new Date(p.addedAt)))+'</time>'+
    '<div class="uni-match uff-evidence"><strong>'+esc(p.evidence)+'</strong>'+(p.cached?'<span>Kayıtlı okuma</span>':'')+'</div>'+
    '<a class="uff-open" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">UFF’de aç ↗</a></article>').join('');
   if(!html&&!busy)html='<div class="uni-empty">'+(unavailable?'<a class="button" href="https://uff.unitx.com.tr" target="_blank" rel="noopener noreferrer">UFF’yi aç ↗</a>':q||filtered||evidenceSelect.value?'Bu filtreyle eşleşen ürün yok.':'Son 30 günde eklenen Üniteks eşleşmeli ürün yok.')+'</div>';
   if(html!==markup){el('uffRows').innerHTML=html;markup=html;}
   el('uffPager').hidden=pages<2;el('uffPrev').disabled=page===0;el('uffNext').disabled=page+1>=pages;
   el('uffPage').textContent=pages?(page+1)+' / '+pages:'';
  }
  el('uffEvidence').onchange=refresh;
  el('uffRows').addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.hidden=true;},true);
  el('uffPrev').onclick=()=>{page--;refresh();};el('uffNext').onclick=()=>{page++;refresh();};
  return {load,render};
 };
})();

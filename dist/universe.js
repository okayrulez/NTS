(() => {
  'use strict';
  window.createUniverseFeed=function({api,esc,normal,stageName,refresh,openSamples}){
    const get=id=>document.getElementById(id);
    const labels={sample:'Numune eşleşti',model:'Ana model eşleşti',outside:'NTS’de eşleşme bulunamadı',conflict:'Kart kimlikleri çelişiyor'};
    const format=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const date=value=>value?format.format(new Date(value)):'';
    const size=24;
    let data=null,busy=false,lastQuery='',page=0,failed=false;
    let selectedId='',sampleId='',current=null;

    function catalogImage(p){
      if(!p.imageFile)return '';
      const parts=p.imageFile.split('/');
      if(parts.some(part=>!part||part==='.'||part==='..'||/[\\:?#]/.test(part)))return '';
      const host=p.onSite?'https://uni-verse.com.tr/files/':'https://uniteksverse.blob.core.windows.net/files/';
      return host+parts.map(encodeURIComponent).join('/');
    }

    function sampleImage(row){
      const src=row?.erpPhoto;
      return src&&/^erp-photos\/\d+\.jpg(?:\?v=\d+)?$/i.test(src)?src:'';
    }

    function patch(node,html){
      if(node._markup===html)return;
      const focus=node.contains(document.activeElement)?document.activeElement.dataset.catalogProduct:'';
      const top=node.scrollTop;
      node.innerHTML=html;
      node._markup=html;
      node.scrollTop=top;
      if(focus)Array.from(node.querySelectorAll('[data-catalog-product]')).find(btn=>btn.dataset.catalogProduct===focus)?.focus({preventScroll:true});
    }

    async function load(){
      if(busy)return;
      busy=true;refresh();
      try{data=await api('/api/universe/recent');failed=!data.available;}
      catch{failed=true;}
      finally{busy=false;refresh();}
    }

    function productRow(item){
      const image=catalogImage(item);
      const changed=item.changedAt||item.addedAt;
      const active=String(item.id)===selectedId;
      return '<article class="uni-row compare-row"><button type="button" data-catalog-product="'+esc(item.id)+'" aria-pressed="'+active+'">'+
        '<span class="uni-photo">'+(image?'<img loading="lazy" referrerpolicy="no-referrer" alt="" src="'+esc(image)+'">':'')+'</span>'+
        '<span class="uni-product"><strong>'+esc(item.name||item.code||'Ürün')+'</strong><small>'+esc([item.brand,item.code].filter(Boolean).join(' · '))+'</small></span>'+
        '<span class="catalog-date">'+(item.changeKind==='updated'?'Güncellendi':'Eklendi')+'<time datetime="'+esc(changed)+'">'+esc(date(changed))+'</time></span></button></article>';
    }

    function picture(label,src,alt){
      return '<figure class="comparison-picture"><figcaption>'+esc(label)+'</figcaption><div><span>Görsel yok</span>'+
        (src?'<img src="'+esc(src)+'" alt="'+esc(alt)+'" referrerpolicy="no-referrer">':'')+'</div></figure>';
    }

    function comparison({item,linked}){
      const sameVersion=linked.find(row=>item.sampleVersion!=null&&String(row.version)===String(item.sampleVersion)&&sampleImage(row));
      const sample=linked.find(row=>row.id===sampleId)||sameVersion||linked.find(sampleImage)||linked[0];
      const matched=linked.length?labels[item.match]:item.match==='conflict'?labels.conflict:'NTS’de erişilebilir numune yok';
      const kind=linked.length?item.match:'outside';
      const url='https://uni-verse.com.tr/admin#/product/edit/'+encodeURIComponent(item.id)+'/'+encodeURIComponent(item.category);
      const version=[sample?.barcode,sample?.version!=null?'V'+sample.version:''].filter(Boolean).join(' · ');
      const details=[['Ürün',item.code||item.name],['Marka',item.brand],['Tarih',date(item.changedAt||item.addedAt)],
        ['ERP kartı',sample?.sampleCode||item.styleId],['Barkod · Versiyon',version],['Operasyon aşaması',sample&&stageName(sample.stage)]];
      return '<div class="comparison-status" data-match="'+esc(kind)+'">'+esc(matched)+'</div>'+
        '<div class="comparison-pictures">'+picture('Üni-verse ürünü',catalogImage(item),item.name)+
        picture(item.match==='model'?'Aynı modelden ERP numunesi':'ERP numunesi',sampleImage(sample),sample?.model||'ERP numunesi')+'</div>'+
        '<dl class="comparison-details">'+details.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('')+'</dl>'+
        '<div class="comparison-actions">'+(linked.length>1?'<label>ERP kaydı <select id="universeSample">'+linked.map(row=>
          '<option value="'+esc(row.id)+'"'+(row===sample?' selected':'')+'>'+esc([row.sampleCode||row.model,row.barcode,row.version!=null?'V'+row.version:''].filter(Boolean).join(' · '))+'</option>').join('')+'</select></label>':'')+
        (sample?'<button class="button" data-uni-id="'+esc(item.id)+'" data-selected-sample="'+esc(sample.id)+'">Numuneyi aç</button>':'')+
        '<a class="button primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Üni-verse’te aç ↗</a></div>';
    }

    function render(query,includesBrand,records){
      const scope=get('universeScope').value,q=normal(query);
      const brand=document.querySelector('#brandTree [aria-current="true"]');
      const searchKey=JSON.stringify([q,scope,brand?.dataset.brand||brand?.dataset.branch||'']);
      if(searchKey!==lastQuery){page=0;lastQuery=searchKey;}
      const byId=new Map(records.map(row=>[row.id,row]));
      const items=[];
      for(const item of data?.products||[]){
        const linked=item.recordIds.map(id=>byId.get(id)).filter(Boolean);
        if(!includesBrand(item,linked))continue;
        if(scope==='tracked'&&!linked.length||scope==='sample'&&item.match!=='sample')continue;
        if(q&&!normal([item.name,item.brand,item.department,item.code,item.mainId,item.styleId,
          ...linked.flatMap(row=>[row.model,row.sampleCode,row.mainCode,row.barcode])].join(' ')).includes(q))continue;
        items.push({item,linked});
      }
      const pages=Math.ceil(items.length/size);
      page=Math.max(0,Math.min(page,pages-1));
      const visible=items.slice(page*size,(page+1)*size);
      const detail=get('universeComparison');
      const selected=visible.find(entry=>String(entry.item.id)===selectedId)||visible.find(entry=>entry.linked.length)||visible[0];
      const nextId=selected?String(selected.item.id):'';
      if(nextId!==selectedId)sampleId='';
      selectedId=nextId;current=selected||null;
      get('universeStatus').textContent=busy?'Katalog kontrol ediliyor…':failed?
        (data?.readAt?'Bağlantı bekleniyor · Son okuma '+date(data.readAt):'Üni-verse bağlantısı kurulamadı.'):
        data?.readAt?'Son katalog okuması '+date(data.readAt):'';
      get('universeErp').textContent=data?.erpReadAt?(data.erpConnected?'ERP okuması · ':'Son kayıtlı ERP verisi · ')+date(data.erpReadAt):
        data&&data.erpConnected===false?'ERP eşleşmesi için ilk okuma bekleniyor.':'';
      get('universeSummary').textContent=data?.readAt?items.length+' ürün · '+items.filter(entry=>entry.linked.length).length+' üründe NTS bağlantısı':'';
      const html=visible.map(entry=>productRow(entry.item)).join('');
      patch(get('universeRows'),html||'<p class="uni-empty">'+(busy&&!data?'Katalog okunuyor…':!data?.readAt?'Katalog verisi bekleniyor.':q||scope||brand?'Seçili arama veya filtreyle eşleşen ürün yok.':'Son 30 günde eklenen veya güncellenen ERP bağlantılı ürün yok.')+'</p>');
      patch(detail,selected?comparison(selected):'');detail.hidden=!selected;
      get('uniPrev').parentElement.hidden=pages<2;
      get('uniPrev').disabled=page===0;get('uniNext').disabled=page+1>=pages;
      get('uniPage').textContent=pages?(page+1)+' / '+pages:'';
    }
    for(const node of [get('universeRows'),get('universeComparison')]){
      node.addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.hidden=true;},true);
      node.addEventListener('load',event=>{if(event.target.tagName==='IMG'&&Math.max(event.target.naturalWidth,event.target.naturalHeight)<=48)event.target.hidden=true;},true);
    }
    get('universeScope').onchange=refresh;
    get('universeRows').onclick=event=>{
      const button=event.target.closest('[data-catalog-product]');if(!button)return;
      if(selectedId!==button.dataset.catalogProduct)sampleId='';
      selectedId=button.dataset.catalogProduct;
      refresh();
      if(window.matchMedia?.('(max-width: 760px)').matches)get('universeComparison').scrollIntoView?.({block:'start'});
    };
    get('universeComparison').onchange=event=>{
      if(event.target.id!=='universeSample')return;
      sampleId=event.target.value;refresh();get('universeSample')?.focus({preventScroll:true});
    };
    get('universeComparison').onclick=event=>{
      const button=event.target.closest('[data-selected-sample]');
      if(button&&current)openSamples({...current.item,recordIds:[button.dataset.selectedSample]});
    };
    function changePage(delta){
      page+=delta;get('universeRows').scrollTop=0;refresh();
      get('universeView').scrollIntoView?.({block:'start'});
    }
    get('uniPrev').onclick=()=>changePage(-1);
    get('uniNext').onclick=()=>changePage(1);
    return {load,render};
  };
})();

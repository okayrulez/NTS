(() => {
  'use strict';
  if (window.NTSCollectionDemo || window.frameElement?.hasAttribute('data-nts-practice')) return;
  const help=document.querySelector('#guideHelp');
  const click=(target,title,text)=>({kind:'click',target,title,text});
  const read=(target,title,text)=>({kind:'read',target,title,text});
  const field=(target,title,text,accept=value=>Boolean(value.trim()))=>({kind:'field',target,title,text,accept});
  const card='.card[data-id="erp-bc-1042-1"]';
  const chapters={
    universe:{name:'Üni-verse',summary:'Yeni eklenen bir katalog ürününü NTS numunesinde bul.',steps:[
      click('[data-mode="universe"]','Yeni katalog ürünlerini aç','Üni-verse sekmesine tıkla. Bu bölümde son 30 günde eklenen veya güncellenen ERP bağlantılı ürünler yer alır.'),
      read('.uni-product time','Kataloğa giriş tarihini oku','Kartta katalogdaki son ekleme veya güncellemenin tarihini görürsün.'),
      click('[data-uni-id]','Eşleşen numuneyi bul','NTS kayıtları düğmesini seç. Numune eşleşmesi doğrudan ERP kart numarasına dayanır.'),
      click('[data-uni-sample]','NTS kartına geç','İşaretli barkodu aç. Numunenin aşamasını ve versiyonunu burada görebilirsin.'),
      read('#detailFields','Kaynakları birlikte oku','Üni-verse katalog kaydından üretimdeki numuneye ulaştın. Barkod ve hareket geçmişi NTS kartında yer alır.')
    ]},
    workshop:{name:'Üretim',summary:'Barkodu bul, revizyon kaydet ve kaliteye geçişini izle.',steps:[
      field('#search','Barkodla numuneyi bul','Aramaya NT-1042 yaz. Aynı modelin diğer barkodu ve versiyonu dışarıda kalır.',v=>v.trim().toUpperCase()==='NT-1042'),
      click(card+' .photo','Numune kartını aç','İşaretli fotoğrafa tıkla. Panoda bir fotoğrafı tutup başka bir aşamaya bırakarak da elle düzeltme yapabilirsin.'),
      read('#detailFields [data-stage-duration]','Aşamaya ne zaman girdi?','Aşamaya giriş ve geçen süre ERP hareketinden gelir. Bu örnek üç gündür dikimde. Tekrar okutulması sayacı başa almaz.'),
      field('#detailOwner','Takip sorumlusunu belirle','Bu numuneyi kimin takip edeceğini yaz. Barkod hareketindeki üretim personeli kartta ayrıca görünür.'),
      field('#detailDate','Hedef bitişi seç','Takibin tamamlanmasını beklediğin tarihi seç. Tarih geçtiğinde numune Hedefi geçen filtresinde bulunur.'),
      field('#detailNote','Revizyonu tarif et','Modelhanenin uygulayabileceği kısa bir not yaz. Örneğin yaka genişliğinde hangi ölçünün değişeceğini belirt.'),
      click('#saveDetail','Takip bilgilerini kaydet','Değişiklikleri kaydet düğmesine bas. Günlük kullanımda bu bilgiler aynı NTS sunucusuna bağlı ekipte paylaşılır.'),
      {kind:'scan',target:card+' .stage-wait',title:'Dikimden kaliteye geçişi izle',text:'Dikimden gelen barkodun okutulmasını canlandır. Aynı barkod ve revizyon notu korunurken kart Kalitede sütununa geçecek.'},
      read('.column[data-stage="quality"] '+card+' .stage-wait','Yeni aşamayı kontrol et','Kart şimdi Kalitede ve süre Bugün olarak görünüyor. Gerçek panoda ERP hareketleri 60 saniyelik kontrolde alınır.'),
      {kind:'drag',target:card+' .photo',drop:'.column[data-stage="sewing"]',title:'Fotoğraftan tutup aşamayı düzelt',text:'Numunenin yeniden dikime alınması gerektiğini varsay. Fotoğrafı Dikimde sütununa bırak. Dokunarak veya klavyeyle taşımak için önce fotoğrafı, ardından Dikimde başlığını seç.'},
      read('.column[data-stage="sewing"] '+card+' .tag.manual','Elle düzeltmeyi tanı','Elle etiketi bu tarayıcıdaki aşama düzeltmesini gösterir. ERP hareketi bu aşamayı doğrulamadığı için kartta bekleme süresi gösterilmez.')
    ]},
    collection:{name:'Koleksiyon',summary:'Üretim dağılımından doğru barkod ve versiyonlara in.',steps:[
      click('[data-mode="collections"]','Koleksiyonu aç','Koleksiyon sekmesine geç. Üretimdeki ana modelin iki barkodu var. Bir tasarım ayrıca ERP eşleşmesi bekliyor.'),
      read('.collection-progress','Model ve numune sayısını ayır','Üretim dağılımı fiziksel numuneleri sayar. ERP eşleşmesi bekleyen bir tasarım ayrıca gösterilir.'),
      click('[data-collection-stage="sewing"]','Dikimdeki numunelere in','Koleksiyon kartındaki Dikimde sayısına tıkla. Üretim ekranı bu koleksiyon ve aşamayla süzülerek açılır.'),
      click('[data-view="list"]','Versiyonları yan yana incele','Liste görünümüne geç. Her barkodun versiyonunu, aşamasını ve işlem personelini aynı satırda görebilirsin.'),
      read('#listBody','İki barkodu karşılaştır','NT-1042 ve NT-1043 aynı modele ait. Liste bunları ayrı numuneler olarak gösterir.')
    ]},
    design:{name:'Canva’dan üretime',summary:'Sunumdaki ürünü ERP modeliyle eşleştirip üretime aktar.',steps:[
      click('[data-mode="collections"]','Koleksiyonu aç','Koleksiyon sekmesinde tasarımcıyı seçip çalıştığı sunuma ulaşabilirsin.'),
      click('.designer-filter [data-design-action="owner"]','Tasarımcıyı seç','Tasarımcının adına basarak koleksiyonlarını süz.'),
      click('[data-open-deck]','Sunumu aç','Jersey kapsülü sunumunu seç. Uzun sunumlarda aramayla slayt, ürün veya bağlı barkodu bulabilirsin.'),
      click('.design-tile[data-design-action="slide"]','Slayttaki ürünü aç','Yaka ve kalıp çalışması slaydını seç. Ürün kartında product line ve varsa ERP bilgisi yer alır.'),
      click('[data-design-action="link"]','Ürünü ERP modeliyle eşleştir','ERP modelini bağla düğmesine bas. Burada üretimdeki mevcut ana modeli seçeceksin.'),
      field('#linkModel','Mevcut ERP modelini seç','Listeden MDL-1042 kodlu modeli seç. Böylece aynı ana modelin barkodları ve versiyonları tasarıma bağlanır.',v=>v==='erp-model:1042'),
      click('#saveLink','Eşleşmeyi kaydet','ERP’ye bağla düğmesine bas. Tasarım kartı, ERP’ye bağlı ürünler arasına taşınır.'),
      click('[data-design-action="handoff"]','Üretime aktarımı aç','Üretime aktar düğmesiyle tasarım kararını numuneye ilet.'),
      field('#handoffNote','Üretim kararını yaz','Modelhanenin hangi versiyonu ve hangi detayı esas alacağını belirt.'),
      click('#sendHandoff','Kararı Üretime aktar','Üretime aktar düğmesine bas. Karar, bağlı modelin barkodlarıyla birlikte açılacak.'),
      read('#designHandoffBanner','Üretim kararını yerinde gör','Tasarım notu üstte, bağlı modelin numuneleri aşağıda. Bu bağlantı ve üretim kararı NTS’de tutulur.')
    ]}
  };
  const order=['design','collection','workshop','universe'];
  const dialog=document.createElement('dialog');
  dialog.id='ntsGuide';dialog.setAttribute('aria-label','NTS tanıtım turu');
  document.body.append(dialog);
  const el=selector=>dialog.querySelector(selector);
  const compact=matchMedia('(max-width:700px),(max-height:540px)');
  let picked=false,edited=false,marker=null;
  let route=[],chapter=0,index=0,frame=null,target=null,dropTarget=null,token=0,ready=false,manual=null,example={},customValues=new Map();
  const chapterId=()=>route[chapter];
  const steps=()=>chapters[chapterId()].steps;
  const current=()=>steps()[index];
  const valueKey=i=>chapterId()+'/'+i;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,25));

  function close(){token++;dialog.close();}
  function clearTarget(){
    target?.classList.remove('guide-target');dropTarget?.classList.remove('guide-drop');
    marker?.remove();marker=null;
    target=null;dropTarget=null;ready=false;picked=edited=false;
  }
  function menu(){
    token++;clearTarget();frame=null;manual=null;dialog.classList.remove('running');
    dialog.innerHTML='<div class="guide-menu"><div class="guide-menu-top"><strong>NTS kullanım rehberi</strong><button class="button" data-exit>Kapat</button></div><h2>Numune takibini dene</h2><p>Bir iş seç. Işıklı alanlara tıklayarak ve istenen bilgileri girerek ilerle. Alıştırmadaki değişiklikler tur kapanınca silinir.</p><div class="guide-routes"></div><button class="button primary" data-all>Tüm turu başlat</button></div>';
    for(const id of order){
      const c=chapters[id],button=document.createElement('button');
      button.className='guide-route';button.dataset.route=id;
      button.innerHTML='<strong>'+c.name+'</strong><small>'+c.summary+'</small><span>'+c.steps.length+' adım</span>';
      button.onclick=()=>start([id]);el('.guide-routes').append(button);
    }
    el('[data-all]').onclick=()=>start(order);el('[data-exit]').onclick=close;
  }
  help.onclick=()=>{
    const sample=window.NumuneV2Debug?.records?.find(r=>r.recordType==='barcode'&&r.stage==='sewing'&&r.erpPhoto);
    example={name:sample?.model,photo:sample?.erpPhoto,brand:sample?.brand,department:sample?.department};
    menu();dialog.showModal();el('.guide-route').focus();
  };
  dialog.addEventListener('close',()=>{token++;clearTarget();frame=null;dialog.replaceChildren();help.focus({preventScroll:true});});

  function start(ids){
    route=ids;chapter=index=0;customValues=new Map();dialog.classList.add('running');
    dialog.innerHTML='<div class="guide-run"><header class="guide-bar"><div><strong>NTS tanıtımı</strong><span>Alıştırma alanı</span></div><div><button data-menu>Bölümler</button><button data-exit>Turu kapat</button></div></header><div class="guide-slot"></div><section class="guide-coach" aria-labelledby="coach-title"><div class="coach-head"><b></b><button class="coach-grip" aria-label="Rehberi taşı. Yön tuşlarıyla da taşıyabilirsin." title="Tut ve taşı">⠿ Taşı</button></div><div class="guide-progress" aria-hidden="true"><i></i></div><h3 id="coach-title" aria-live="polite"></h3><p></p><div class="coach-actions"><button class="button" data-back>Geri</button><button class="button primary" data-next></button></div></section></div>';
    el('[data-menu]').onclick=()=>{menu();el('.guide-route').focus();};el('[data-exit]').onclick=close;
    el('[data-back]').onclick=back;el('[data-next]').onclick=perform;
    wireGrip();rebuild();
  }
  function finish(){
    token++;clearTarget();frame=null;dialog.classList.remove('running');
    dialog.innerHTML='<section class="guide-menu guide-finish"><h2>Alıştırma tamamlandı</h2><p></p><button class="button primary" data-exit>Çalışma alanıma dön</button> <button class="button" data-menu>Bölümleri aç</button></section>';
    el('p').textContent=route.length===order.length?'Tasarım kararını Üretime aktardın, koleksiyonu barkodlarına kadar açtın bir numunenin kaliteye geçişini izledin ve Üni-verse kaydından NTS kartını açtın.':{universe:'Kataloğa eklenen üründen bağlı numunesine ulaştın.',design:'Sunumdaki ürünün ERP eşleşmesini ve üretim kararını Üretimde gördün.',collection:'Koleksiyonun üretim dağılımından iki ayrı barkoda ulaştın.',workshop:'Revizyon kaydettin ve dikimden gelen okutmanın kartı kaliteye taşıdığını gördün.'}[chapterId()];
    el('[data-menu]').onclick=menu;el('[data-exit]').onclick=close;el('[data-exit]').focus();
  }
  function locate(selector){
    const doc=frame?.contentDocument;if(!doc)return null;
    const modal=doc.querySelector('dialog[open]');
    return Array.from(doc.querySelectorAll(selector)).find(node=>(!modal||modal.contains(node))&&node.getClientRects().length>0&&!node.disabled);
  }
  async function waitTarget(step,generation){
    const deadline=performance.now()+9000;
    while(generation===token&&performance.now()<deadline){
      const node=locate(step.target);if(node)return node;
      await tick();
    }
    if(generation===token)throw Error('Bu adımın ekranı yüklenemedi.');
  }
  function showError(generation){
    if(generation!==token)return;
    ready=false;el('#coach-title').textContent='Adım açılamadı';
    el('.guide-coach p').textContent='Adımı yeniden açabilir veya Bölümler düğmesiyle başka bir alıştırma seçebilirsin.';
    const button=el('[data-next]');button.disabled=false;button.textContent='Yeniden aç';button.onclick=rebuild;
    place();
  }
  async function apply(step,node,i){
    if(step.kind==='click')node.click();
    if(step.kind==='field'){
      const event=tag=>new frame.contentWindow.Event(tag,{bubbles:true});
      if(customValues.has(valueKey(i)))node.value=customValues.get(valueKey(i));
      node.dispatchEvent(event('input'));node.dispatchEvent(event('change'));
      customValues.set(valueKey(i),node.value);
    }
    if(step.kind==='drag'){
      node.click();
      const doc=frame.contentDocument;
      doc.querySelector('#detailStage').value='sewing';
      doc.querySelector('#saveDetail').click();
    }
    if(step.kind==='scan'){frame.contentWindow.NTSPractice.scanReturn();await frame.contentWindow.NumuneV2Debug.poll();}
  }
  async function rebuild(){
    const generation=++token;clearTarget();manual=null;
    renderCoach();
    try{
      if(frame?.contentWindow?.NTSPractice?.restart && frame.contentWindow.NumuneV2Debug?.records.length){
        await frame.contentWindow.NTSPractice.restart();
      }else{
        const slot=el('.guide-slot')||frame;
        frame=document.createElement('iframe');frame.dataset.ntsPractice='';frame.ntsExample=example;
        frame.title='NTS alıştırma ekranı';frame.src=new URL('index.html',location.href).href;
        const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
        slot.replaceWith(frame);place();
        await loaded;if(generation!==token)return;
        await waitTarget({target:card},generation);if(generation!==token)return;
        bindFrame();
      }
      if(generation!==token)return;
      for(let i=0;i<index;i++){
        const step=steps()[i],node=await waitTarget(step,generation);if(generation!==token)return;
        await apply(step,node,i);
      }
      if(generation!==token)return;
      await enter(generation);
    }catch{showError(generation);}
  }
  async function enter(generation){
    clearTarget();manual=null;renderCoach();
    try{
      const doc=frame.contentDocument;
      doc.documentElement.classList.toggle('guide-transfer',current().kind==='drag');
      if(current().kind==='drag'){
        const search=doc.querySelector('#search');search.value='';
        search.dispatchEvent(new frame.contentWindow.Event('input',{bubbles:true}));
        dropTarget=doc.querySelector(current().drop);dropTarget.classList.add('guide-drop');
      }
      const node=await waitTarget(current(),generation);if(generation!==token)return;
      target=node;ready=true;node.classList.add('guide-target');
      const panel=el('.guide-coach');
      marker=doc.createElement('i');
      marker.className='guide-beacon';marker.setAttribute('aria-hidden','true');
      (node.closest('dialog[open]')||doc.body).append(marker);
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)panel.animate?.([{opacity:.7,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:200});
      if(!node.matches('input,textarea,select,button,[tabindex]'))node.tabIndex=-1;
      node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      renderCoach();place();
      (el('[data-next]').disabled?target:el('[data-next]')).focus({preventScroll:true});
    }catch{showError(generation);}
  }
  function renderCoach(){
    const step=current(),c=chapters[chapterId()],panel=el('.guide-coach');
    panel.dataset.chapter=chapterId();panel.dataset.action=step.kind;panel.querySelector('.coach-head b').textContent=c.name+' · '+(index+1)+' / '+c.steps.length;
    panel.querySelector('.guide-progress i').style.width=((index+1)*100/c.steps.length)+'%';
    el('#coach-title').textContent=step.title;panel.querySelector('p').textContent=step.text;
    el('[data-back]').disabled=(!index&&!chapter)||!ready;
    const next=el('[data-next]');next.onclick=perform;
    const blocked=step.kind==='click'||step.kind==='drag'||step.kind==='field'&&(!edited||!step.accept(target?.value||''));
    next.disabled=!ready||blocked;
    next.textContent=!ready?'Hazırlanıyor…':step.kind==='click'?'İşaretli alana tıkla':step.kind==='drag'?(picked?'Dikimde başlığını seç':'Fotoğrafı taşı'):
      step.kind==='field'&&blocked?'Alanı tamamla':step.kind==='scan'?'Okutmayı canlandır':index===steps().length-1&&chapter===route.length-1?'Bitir':'Devam';
  }
  function advance(){
    if(index+1<steps().length){index++;enter(++token);}
    else if(chapter+1<route.length){chapter++;index=0;rebuild();}
    else finish();
  }
  function back(){
    if(index)index--;else if(chapter){chapter--;index=steps().length-1;}else return;
    rebuild();
  }
  async function perform(){
    if(!ready||el('[data-next]').disabled)return;
    const generation=token,node=target,step=current();ready=false;
    try{if(step.kind==='field')customValues.set(valueKey(index),node.value);await apply(step,node,index);if(generation===token)advance();}
    catch{showError(generation);}
  }
  async function chooseDestination(node){
    if(!picked&&target.contains(node)){
      picked=true;
      const header=dropTarget.querySelector('.column-header');
      header.tabIndex=0;header.scrollIntoView({block:'center',inline:'center'});header.focus({preventScroll:true});
      renderCoach();place();
    }else if(picked&&dropTarget.contains(node)){
      const generation=token;ready=false;
      await frame.contentWindow.NumuneV2Debug.moveCard('erp-bc-1042-1','sewing');
      if(generation===token&&locate('.column[data-stage="sewing"] '+card+' .tag.manual'))advance();
    }
  }
  function bindFrame(){
    const doc=frame.contentDocument;
    doc.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      if(ready&&current().kind==='drag'){
        event.preventDefault();event.stopImmediatePropagation();chooseDestination(event.target);return;
      }
      if(!ready||!target.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();return;}
      if(current().kind==='click'){
        const generation=token;ready=false;
        setTimeout(()=>{if(generation===token)advance();},0);
      }
    },true);
    doc.addEventListener('drop',event=>{
      if(ready&&current().kind==='drag'&&!dropTarget.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    doc.addEventListener('drop',event=>{
      if(!ready||current().kind!=='drag'||!dropTarget.contains(event.target))return;
      const generation=token;
      setTimeout(()=>{
        if(generation===token&&locate('.column[data-stage="sewing"] '+card+' .tag.manual'))advance();
      },0);
    });
    function onField(event){
      if(ready&&current().kind==='field'&&event.target===target){
        edited=true;renderCoach();
      }
    }
    doc.addEventListener('input',onField);doc.addEventListener('change',onField);
    doc.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
      if(event.key==='Tab'&&ready){event.preventDefault();const next=el('[data-next]'),back=el('[data-back]');(event.shiftKey&&!back.disabled?back:!next.disabled?next:el('.guide-bar [data-menu]')).focus();}
      if(ready&&current().kind==='drag'&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();chooseDestination(event.target);return;}
      if(ready&&event.target===target&&event.key==='Enter'&&current().kind==='click'&&!target.matches('button,a,input,select')){
        event.preventDefault();event.stopImmediatePropagation();const generation=token;target.click();if(generation===token)advance();
      }
    },true);
    doc.addEventListener('scroll',place,true);frame.contentWindow.addEventListener('resize',place);
  }
  function clamp(value,min,max){return Math.max(min,Math.min(value,Math.max(min,max)));}
  function place(){
    if(marker&&target){
      const anchor=(picked?dropTarget?.querySelector('.column-header'):target)||target;
      const r=anchor.getBoundingClientRect(),w=frame.contentWindow.innerWidth,h=frame.contentWindow.innerHeight;
      marker.hidden=r.right<=0||r.left>=w||r.bottom<=0||r.top>=h;
      marker.style.left=clamp(r.right-8,12,w-14)+'px';
      marker.style.top=clamp(r.top+6,14,h-14)+'px';
      marker.dataset.kind=current().kind;
    }
    const p=el('.guide-coach');if(!p||compact.matches||!frame)return;
    const box=frame.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight,gap=12;
    const minX=box.left+gap,minY=box.top+gap,maxX=box.right-w-gap,maxY=box.bottom-h-gap;
    const r=(picked?dropTarget?.querySelector('.column-header'):target)?.getBoundingClientRect();
    const t=r&&{left:r.left+box.left,right:r.right+box.left,top:r.top+box.top,bottom:r.bottom+box.top};
    const align=([x,y])=>[clamp(x,minX,maxX),clamp(y,minY,maxY)];
    let pos=align([maxX,maxY]);
    if(manual)pos=align(manual);
    else if(t){
      const options=[[t.right+gap,t.top],[t.left-w-gap,t.top],[t.left,t.bottom+gap],[t.left,t.top-h-gap],[maxX,minY],[minX,maxY],[maxX,maxY],[minX,minY]].map(align);
      const targets=[t];
      if(dropTarget){
        const d=dropTarget.querySelector('.column-header').getBoundingClientRect();
        targets.push({left:d.left+box.left,right:d.right+box.left,top:d.top+box.top,bottom:d.bottom+box.top});
      }
      const overlap=([x,y])=>targets.reduce((n,b)=>n+Math.max(0,Math.min(x+w,b.right)-Math.max(x,b.left))*Math.max(0,Math.min(y+h,b.bottom)-Math.max(y,b.top)),0);
      pos=options.sort((a,b)=>overlap(a)-overlap(b))[0];
    }
    p.style.left=pos[0]+'px';p.style.top=pos[1]+'px';
  }
  function wireGrip(){
    const grip=el('.coach-grip'),panel=el('.guide-coach');let offset=null;
    grip.onpointerdown=e=>{const r=panel.getBoundingClientRect();offset=[e.clientX-r.left,e.clientY-r.top];grip.setPointerCapture(e.pointerId);};
    grip.onpointermove=e=>{if(offset){manual=[e.clientX-offset[0],e.clientY-offset[1]];place();}};
    grip.onlostpointercapture=()=>{offset=null;};
    grip.onkeydown=e=>{
      const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];if(!delta)return;
      e.preventDefault();const r=panel.getBoundingClientRect();manual=[r.left+delta[0],r.top+delta[1]];place();
    };
  }
  dialog.addEventListener('keydown',e=>{
    if(!ready||e.target!==el('[data-next]')||e.key!=='Tab'||!e.shiftKey)return;
    e.preventDefault();target.focus({preventScroll:true});
  });
  window.addEventListener('resize',place);
  function openGuideLink(){if(location.hash==='#tanitim'&&!dialog.open)help.click();}
  window.addEventListener('hashchange',openGuideLink);openGuideLink();
})();

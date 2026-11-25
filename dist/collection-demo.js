(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('demo') !== 'koleksiyon' ||
      window.frameElement?.hasAttribute('data-nts-practice')) return;

  const deckId = 'demo-studio';
  const storageKey = 'nts:collection-demo:v1';
  const day = 86400000;
  const deckName = 'Studio / Gündelik silüetler';
  const steps = [
    ['pattern', 'Üretime aktar', 'Kalıp sırasına alındı', 'Kalıp'],
    ['pattern_done', 'Kalıbı tamamla', 'Kalıp numarası girildi', 'Kalıp'],
    ['cutting_in', 'Kesime al', 'Kesim barkodu basıldı', 'Kesim'],
    ['queue', 'Kesimi tamamla', 'Kesim okutuldu, dikim sırasına alındı', 'Kesim', 100],
    ['sewing', 'Dikime al', 'Dikime giden barkod okutuldu', 'Dikim', 0],
    ['quality', 'Dikimden teslim al', 'Dikimden gelen barkod okutuldu', 'Dikim', 1],
    ['done', 'Numuneyi onayla', 'Kalite onayı verildi', 'Kalite']
  ];
  // Bu model kodları, barkodlar ve hareketler demo için oluşturulmuştur.
  const source = [
    ['NTS001',800000101,'NTS001-001','80000001',1,'Düğmeli hırka','Ekru','Triko',0],
    ['NTS002',800000102,'NTS002-001','80000002',2,'Askılı mini elbise','Mercan','Elbise',0],
    ['NTS003',800000103,'NTS003-001','80000003',4,'Bisiklet yaka tişört','Antrasit','Jersey',0],
    ['NTS004',800000104,'NTS004-001','80000004',1,'Desenli pantolon','Kahve','Alt giyim',0],
    ['NTS005',800000105,'NTS005-001','80000005',1,'Grafik baskılı tişört','Beyaz / mavi','Jersey',1],
    ['NTS006',800000106,'NTS006-001','80000006',1,'Polo yaka uzun kollu üst','Koyu kahve','Üst giyim',2],
    ['NTS007',800000107,'NTS007-001','80000007',1,'Halter yaka elbise','Kum','Elbise',3],
    ['NTS008',800000108,'NTS008-001','80000008',2,'Yırtmaçlı midi etek','Siyah','Alt giyim',4],
    ['NTS009',800000109,'NTS009-001','80000009',1,'Omzu açık üst','Lacivert','Üst giyim',5],
    ['NTS010',800000110,'NTS010-001','80000010',1,'Dokulu kısa kollu üst','Taş','Üst giyim',6]
  ];

  const key = item => 'erp-model:' + item.mainId;
  const modelId = item => 'demo-design-' + item.ref;
  const rowId = item => 'demo-sample-' + item.ref;
  const pageId = item => 'demo-slide-' + item.ref;
  function initial() {
    return {revision:1, followups:{}, items:source.map(([mainCode,mainId,sampleCode,barcode,version,name,color,line,count]) => ({
      ref:String(mainId).padStart(9,'0'),mainCode,mainId,sampleCode,barcode,version,name,color,line,
      photo:'assets/koleksiyon-demo/' + mainCode + '.webp',
      events:steps.slice(0,count).map((_,i) => new Date(Date.now() - (count-i)*day).toISOString()),
      note:count ? 'İlk prova için koleksiyon görselindeki silüet esas alınacak.' : ''
    }))};
  }
  function restore() {
    try {
      const saved=JSON.parse(sessionStorage.getItem(storageKey));
      if (Array.isArray(saved?.items) && saved.items.length && saved.followups && saved.revision) return saved;
    } catch {}
    return initial();
  }
  let store = restore();
  function commit(update) {
    const next=structuredClone(store);
    update(next);
    next.revision++;
    try { sessionStorage.setItem(storageKey,JSON.stringify(next)); }
    catch { throw Error('Bu sekmenin demo alanı dolu veya kapalı. Daha küçük bir görselle tekrar dene.'); }
    store=next;
  }
  function design(item) {
    return {id:modelId(item),erpModelKey:key(item),slideId:pageId(item),source:'canva',demo:true,model:item.name,
      photo:item.photo,code:item.ref,mainCode:item.mainCode,color:item.color,productLine:item.line,notes:'Model: '+item.mainCode+'\nÜrün grubu: '+item.line,
      ...(item.events.length ? {handoff:{erpModelKey:key(item),note:item.note}} : {})};
  }
  function row(item) {
    const movements=item.events.map((at,i) => {
      const [stage,,reason,process,kind]=steps[i];
      return {id:i+1,stage,workflowStage:stage,at,process,kind,reason,employeeName:process+' ekibi (demo)'};
    });
    const last=movements.at(-1), milestones=Object.fromEntries(movements.map(m=>[m.stage,m]));
    return {id:rowId(item),modelKey:key(item),recordType:'barcode',model:item.name,brand:'Demo Studio',department:item.line,
      barcode:item.barcode,version:item.version,mainCode:item.mainCode,sampleCode:item.sampleCode,color:item.color,
      sample:'Deneme',sampleNature:'trial',erpPhoto:item.photo,patternNo:movements.length>1?'K-'+item.mainId:'',
      canvaPlans:[item.ref],erp:{mainRecId:item.mainId,stage:last.stage,reason:last.reason,activityAt:last.at,
        movements,milestones,workflowMilestones:milestones,intermediateSelected:false,intermediateLabel:'Ara işlem yok',
        stageEntry:{stage:last.stage,at:last.at,source:'barcode'}}};
  }
  function state() {
    const models=store.items.map(design);
    const slides=store.items.map((item,index)=>({id:pageId(item),number:index+1,title:item.name,photo:item.photo,productLine:item.line}));
    const deck={id:deckId,name:deckName,canvaTitle:deckName,canvaDesignId:deckId,brandId:'demo-studio-brand',
      status:'active',designer:'Demo Studio tasarım ekibi',modelKeys:models.map(m=>m.id),canvaSlides:slides,demo:true};
    return {models,collections:[deck],groups:[],processSettings:[],jobs:{},followups:structuredClone(store.followups)};
  }
  function find(modelKey) { return store.items.find(item=>key(item)===modelKey); }
  function nextStep(modelKey) { const item=find(modelKey); return item && steps[item.events.length]?.[1]; }
  function advance(modelKey,expectedStage) {
    const item=find(modelKey);
    if (!item?.events.length || steps[item.events.length-1][0]!==expectedStage || !nextStep(modelKey)) return;
    commit(next=>next.items.find(i=>key(i)===modelKey).events.push(new Date().toISOString()));
  }
  function add({name,ref,line,photo,color}) {
    if (!name.trim() || !/^\d{9}$/.test(ref) || !photo.startsWith('data:image/')) throw Error('Model adı, görsel ve dokuz haneli referansı kontrol et.');
    if (store.items.some(i=>i.ref===ref)) throw Error('Bu referans koleksiyonda zaten var. Modeli arama kutusundan açabilirsin.');
    const item={name:name.trim(),ref,mainId:'demo-'+ref,mainCode:ref,sampleCode:ref+'-001',barcode:'D'+ref,
      version:1,color:color.trim(),line:line.trim()||'Koleksiyon',photo,events:[],note:''};
    commit(next=>next.items.push(item));
    return pageId(item);
  }
  async function request(path,data) {
    if (path==='/api/health') return {};
    if (path==='/api/state') return state();
    if (path.startsWith('/api/erp/delta?')) {
      const changed=new URL(path,location.href).searchParams.get('since')!==String(store.revision);
      return {full:changed,updated:changed?store.items.filter(i=>i.events.length).map(row):[],removed:[],
        revision:String(store.revision),connected:true,brands:[],analysis:{},fetchedAt:new Date().toISOString()};
    }
    if (path==='/api/models/handoff') {
      const item=find(data.erpModelKey);
      if (!item || modelId(item)!==data.id) throw Error('Bu tasarımın üretim eşleşmesi bulunamadı.');
      if (!item.events.length) commit(next=>{
        const copy=next.items.find(i=>i.ref===item.ref);
        copy.note=String(data.note||''); copy.events.push(new Date().toISOString());
      });
      return design(find(data.erpModelKey));
    }
    if (path==='/api/followups' && store.items.some(i=>rowId(i)===data.id)) {
      commit(next=>{
        const saved=next.followups[data.id]??={id:data.id,...window.TeamFollowup.defaults,version:0,versions:{},history:[]};
        Object.assign(saved,data.changes);saved.version++;
        for (const field of Object.keys(data.changes)) saved.versions[field]=saved.version;
        saved.history.push({at:new Date().toISOString(),changes:{...data.changes}});
      });
      return structuredClone(store.followups[data.id]);
    }
    throw Error('Bu işlem için canlı çalışma alanını aç.');
  }
  function upload(openModal, onSaved) {
    const refs=new Set(store.items.map(item=>item.ref));
    let suggested=900000001;
    while(refs.has(String(suggested))) suggested++;
    openModal('Koleksiyona görsel ekle','<form id="demoUpload" class="demo-upload"><label class="demo-file">Numune görseli'+
      '<img alt="Seçilen görselin önizlemesi" hidden><input required name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>'+
      '<label class="field">Model adı<input required name="name" maxlength="90" placeholder="Örn. Balon kollu gömlek"></label>'+
      '<label class="field">Dokuz haneli referans<input required name="ref" inputmode="numeric" pattern="[0-9]{9}" maxlength="9" value="'+suggested+'"></label>'+
      '<label class="field">Ürün grubu<input name="line" maxlength="60" placeholder="Örn. Gömlek"></label>'+
      '<label class="field">Renk<input name="color" maxlength="60" placeholder="Örn. Açık mavi"></label>'+
      '<p role="alert" hidden></p><div class="form-actions"><button type="button" class="button" data-close>Vazgeç</button>'+
      '<button type="submit" class="button primary">Koleksiyona ekle</button></div></form>');
    const form=document.querySelector('#demoUpload'),input=form.elements.photo,preview=form.querySelector('img');
    const submit=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]');
    let photo='';
    function message(text){error.hidden=!text;error.textContent=text;}
    input.onchange=async()=>{
      photo='';preview.hidden=true;message('');
      const file=input.files[0];
      if(!file)return;
      submit.disabled=true;
      try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)
          throw Error('12 MB altında bir JPG, PNG veya WebP seç.');
        const url=URL.createObjectURL(file);
        try {
          const img=new Image();img.src=url;await img.decode();
          if(file!==input.files[0])return;
          const ratio=Math.min(1,720/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
          const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);photo=canvas.toDataURL('image/jpeg',0.8);
          preview.src=photo;preview.hidden=false;
        } finally {URL.revokeObjectURL(url);}
      } catch(e){if(input.files[0]===file)message(e.message?.includes('12 MB')?e.message:'Görsel açılamadı. Başka bir dosya seç.');}
      finally {if(input.files[0]===file)submit.disabled=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();
      if(!photo){message('Önce bir görsel seç.');return;}
      submit.disabled=true;
      try{
        const page=add({photo,...Object.fromEntries(['name','ref','color','line'].map(k=>[k,form.elements[k].value]))});
        await onSaved(page);
      }catch(e){message(e.message);submit.disabled=false;}
    };
  }
  document.documentElement.classList.add('collection-demo');
  window.NTSCollectionDemo={deckId,request,add,upload,advance,nextStep,pageFor:modelKey=>{const item=find(modelKey);return item&&pageId(item);},
    taxonomy:{brands:[{id:'demo-studio-brand',name:'Demo Studio',erpAliases:['Demo Studio'],children:[]}]}};
})();

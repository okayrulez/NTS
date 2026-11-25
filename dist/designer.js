(() => {
  'use strict';

  window.createDesignerWorkspace = function (container, callbacks) {
    let designer = '';
    let presentation = '';
    let slideId = '';
    let query = '';
    let hint = '';
    let selectedProduct = '';
    const matchingDecks = new Set();
    const statusNames = {design:'ERP eşleşmesi bekliyor', draft:'Devir bekliyor', linked:'ERP’ye bağlı', production:'Üretime aktarıldı'};

    function escape(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    }

    const normalize = value => window.Tracker.normal(value).trim();
    const owner = collection => collection.designer?.trim() || 'Tasarımcı atanmamış';
    const title = collection => collection.canvaTitle || collection.name;
    const action = (label, kind, id = '', cls = 'button') =>
      '<button type="button" class="' + cls + '" data-design-action="' + kind +
      '" data-key="' + escape(id) + '">' + escape(label) + '</button>';

    function photo(source, alt, cls = '') {
      return source ? '<img class="' + cls + '" src="' + escape(source) + '" alt="' +
        escape(alt) + (cls === 'design-slide-cover' ? '">' : '" loading="lazy">') : '<div class="design-placeholder" aria-hidden="true">◩</div>';
    }

    function workState(model, matches) {
      if (model.demo && !model.handoff) return 'draft';
      if (model.handoff?.erpModelKey === model.erpModelKey && matches.length) return 'production';
      return matches.length ? 'linked' : 'design';
    }

    function attribute(model, field, labels) {
      const explicit = model[field];
      if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
      const line = String(model.notes || '').split(/\r?\n/).find(text => labels.test(text));
      return line ? line.split(/[:：]/).slice(1).join(':').trim().slice(0, 160) : '';
    }

    function productInfo(model, matches, page) {
      const sample = matches[0];
      return {
        model, sample, matches, status:workState(model,matches),
        code:model.productionBrief?.code||model.code||sample?.mainCode||sample?.sampleCode||model.model,
        color:attribute(model,'color',/^\s*(renk|colour|color)\s*[:：]/i)||sample?.color||'',
        material:attribute(model,'material',/^\s*(malzeme|kumaş|material|composition|fabric)\s*[:：]/i),
        line:model.productLine||page.productLine,
        photo:model.photo||sample?.erpPhoto||'',
      };
    }

    function fields(product) {
      const attributes=product.model.demo?[['Sunum referansı',product.code],['Ana model',product.model.mainCode],['Renk',product.color]]:
        [['Model kodu',product.code],['Renk',product.color],['Malzeme',product.material]];
      return '<dl class="product-attributes">'+attributes.map(([label,value])=>
        '<div><dt>'+label+'</dt><dd>'+escape(value||'—')+'</dd></div>').join('')+'</dl>';
    }

    function productCard(product, active) {
      const {model,sample,status}=product;
      const stage=sample?' · '+callbacks.stageName(sample.stage):'';
      return '<article class="selection-card'+(active?' selected':'')+'"><button type="button" data-design-action="select-product" data-key="'+
        escape(model.id)+'" aria-pressed="'+active+'" aria-label="'+escape(model.model)+'">'+photo(product.photo,model.model)+
        (active?'<span class="selection-check" aria-hidden="true">✓</span>':'')+
        '<div class="selection-body">'+fields(product)+'<small>'+escape([product.line,statusNames[status]+stage].filter(Boolean).join(' · '))+'</small></div></button></article>';
    }

    function handoffPanel(product) {
      if(!product)return '';
      const {model,sample,matches,status}=product;
      const shared=sample&&callbacks.followup(sample.id);
      const note=model.handoff?.note||shared?.userNote||'';
      const actions=model.demo?[]:[action(sample?'ERP eşleşmesini düzenle':'ERP modelini bağla','link',model.id)];
      if(sample)actions.push(action('Numune takibini düzenle','sample',sample.id));
      if(status==='linked'||status==='draft')actions.push(action('Üretime aktar','handoff',model.id,'button primary'));
      if(status==='production'||model.productionBrief)actions.push(action('Üretimde gör →','workshop',model.id,'button primary'));
      const due=shared?.targetDate?shared.targetDate.split('-').reverse().join('.'):'';
      return '<aside class="handoff-panel" aria-label="Üretime devir"><h3>Üretime devir</h3><div class="handoff-content">'+
        '<div class="handoff-product">'+photo(product.photo,model.model)+fields(product)+'</div>'+
        '<dl class="handoff-fields"><div><dt>'+(model.demo?'Ana model kodu':'ERP referansı')+'</dt><dd>'+escape(model.demo?model.mainCode:model.productionBrief?.code||sample?.mainCode||sample?.sampleCode||'Eşleşme bekliyor')+'</dd></div>'+
        (model.demo?'<div><dt>Aşama</dt><dd>'+escape(sample?callbacks.stageName(sample.stage):statusNames.draft)+'</dd></div>':'')+
        (model.productionBrief?'<div><dt>Canva işlem talebi</dt><dd>'+escape(model.productionBrief.operation)+'</dd></div>':'')+
        '<div><dt>Sorumlu</dt><dd>'+escape(shared?.userOwner||'Atanmamış')+'</dd></div>'+
        '<div><dt>Hedef tarih</dt><dd>'+escape(due||'Belirlenmemiş')+'</dd></div>'+
        (matches.length>1?'<div><dt>Numune</dt><dd>'+escape([sample.sampleCode,sample.barcode,sample.version!=null?'V'+sample.version:''].filter(Boolean).join(' · '))+'</dd></div>':'')+'</dl>'+
        '<div class="handoff-note"><strong>Revizyon notu</strong><p>'+escape(note||'Henüz not eklenmedi.')+'</p></div>'+
        (model.notes?'<details class="design-notes"><summary>Canva metni</summary><p>'+escape(model.notes)+'</p></details>':'')+
        '<div class="design-actions">'+actions.join('')+'</div></div></aside>';
    }

    function render(state, records, view) {
      matchingDecks.clear();
      const collections = state.collections;
      const presentations = collections.filter(c => c.canvaDesignId);
      const designers = [...new Set(collections.map(owner))].sort((a, b) => a.localeCompare(b, 'tr'));
      const current = presentations.find(c => c.id === presentation);
      if (current) designer = owner(current);
      else if (presentation || (designer && !designers.includes(designer))) designer = presentation = slideId = '';
      const own = presentations.filter(c => owner(c) === designer);
      const slides = current?.canvaSlides || [];
      const selected = slides.find(s => s.id === slideId);
      if (!selected) slideId = '';
      hint = selected ? 'Bu slaytta ürün veya ERP kodu ara…' :
        current ? 'Slayt, ürün, barkod veya product line ara…' : 'Tasarımcı, sunum, slayt veya ürün ara…';
      const needle = normalize(query);
      const includes = (...values) => !needle || normalize(values.join(' ')).includes(needle);
      const crumbs = current ? '<nav class="design-crumbs" aria-label="Koleksiyon yolu">' + action('Koleksiyon', 'home') +
        (designer ? '<span aria-hidden="true">›</span>' + action(designer, 'owner', designer) : '') +
        (current ? '<span aria-hidden="true">›</span>' + action(title(current), 'presentation', current.id) : '') +
        (selected ? '<span aria-hidden="true">›</span><span>' + escape(selected.title) + '</span>' : '') + '</nav>' : '';
      let body;
      const erpByKey = new Map();
      const modelById = new Map(state.models.filter(m => !m.retired).map(m => [m.id, m]));
      if (needle || current) {
        for (const row of records) {
          if (row.recordType === 'canva') continue;
          if (!erpByKey.has(row.modelKey)) erpByKey.set(row.modelKey, []);
          erpByKey.get(row.modelKey).push(row);
        }
      }
      function onPages(deck) {
        const pages = deck.canvaSlides || [];
        const legacy = new Map(pages.map(s => [s.sourcePart + '/' + s.sourcePage, s.id]));
        const grouped = new Map();
        for (const key of deck.modelKeys || []) {
          const m = modelById.get(key);
          if (!m) continue;
          const id = m.slideId || legacy.get(m.sourcePart + '/' + m.page);
          if (!id) continue;
          if (!grouped.has(id)) grouped.set(id, []);
          grouped.get(id).push(m);
        }
        return grouped;
      }
      function modelMatches(model) {
        return includes(model.model, model.code, model.productionBrief?.code, model.productionBrief?.operation, model.productLine, model.notes,
          ...(erpByKey.get(model.erpModelKey) || []).flatMap(r => [r.mainCode, r.sampleCode, r.barcode, r.model]));
      }
      function pageMatches(page, models) {
        return includes(page.title, page.productLine, page.number) || models.some(modelMatches);
      }
      function slideTile(page, deck, models, showDeck) {
        const count = models.length;
        if(deck.demo && models.length){
          const model=models[0],sample=erpByKey.get(model.erpModelKey)?.[0];
          return '<button type="button" class="demo-look" data-design-action="slide" data-deck="'+escape(deck.id)+'" data-key="'+escape(page.id)+'">'+
            '<span class="demo-look-image">'+photo(page.photo,model.model)+'<span class="demo-stage '+(sample?'in-production':'')+'">'+
            escape(sample?callbacks.stageName(sample.stage):statusNames.draft)+'</span></span><span class="demo-look-copy"><small>'+escape(model.productLine)+
            '</small><strong>'+escape(model.model)+'</strong><span>'+escape(model.code)+'</span></span></button>';
        }
        return '<button class="design-tile" data-design-action="slide" data-deck="' + escape(deck.id) +
          '" data-key="' + escape(page.id) + '">' + photo(page.photo, '') +
          '<span class="design-tile-copy"><small>' + (showDeck ? escape(title(deck)) + ' · ' : '') +
          'Slayt ' + escape(page.number) + ' · ' + count + ' ürün</small><strong>' + escape(page.title) +
          '</strong>' + (page.productLine ? '<small>' + escape(page.productLine) + '</small>' : '') + '</span></button>';
      }
      if (selected) {
        const slideModels = onPages(current).get(selected.id) || [];
        const products = slideModels.filter(model => (selected.productLine && includes(selected.productLine)) || modelMatches(model))
          .map(model => productInfo(model,erpByKey.get(model.erpModelKey)||[],selected));
        const product=products.find(item=>item.model.id===selectedProduct)||products[0];
        selectedProduct=product?.model.id||'';
        const index = slides.indexOf(selected);
        function step(label, offset) {
          const next = slides[index + offset];
          return next ? action(label, 'slide', next.id) : '<button type="button" class="button" disabled>' + label + '</button>';
        }
        const filmstrip = '<nav class="slide-filmstrip" aria-label="Sunum slaytları">' + slides.map(page =>
          '<button type="button" class="filmstrip-tile" data-design-action="slide" data-key="' + escape(page.id) +
          '" aria-current="' + (page.id === selected.id ? 'page' : 'false') + '" title="' + escape(page.title) + '">' +
          '<span>' + escape(page.number) + '</span>' + (page.photo ? photo(page.photo, '') : '<small>' + escape(page.title) + '</small>') +
          '</button>').join('') + '</nav>';
        const showSlide=selected.photo?'<details class="original-slide"'+(!products.length?' open':'')+'><summary>Slayt görseli</summary><figure class="slide-preview">'+
          photo(selected.photo,selected.title,'design-slide-cover')+'</figure>'+filmstrip+'</details>':'';
        body = '<div class="design-slide-head"><div><h2>' + escape(selected.title) + '</h2></div>'+
          '<nav class="slide-nav" aria-label="Sunumda gezin"><span>Slayt ' + (index + 1) + ' / ' + slides.length +
          '</span><div>' + step('Önceki slayt', -1) + action('Tüm slaytlar','slides') + step('Sonraki slayt', 1) + '</div></nav></div>' +
          '<div class="product-selection"><div class="product-selection-main">'+showSlide+
          (!selected.photo?'<details class="original-slide"><summary>Slaytlar</summary>'+filmstrip+'</details>':'')+
          '<div class="'+(view==='list'?'design-product-list selection-list':'selection-grid')+'">'+
          products.map(item=>productCard(item,item===product)).join('')+'</div>'+
          (!products.length?'<p class="design-empty">'+(needle?'Aramanla eşleşen ürün yok.':'Bu slaytta ayrıştırılabilen ürün bulunamadı.')+'</p>':'')+
          '</div>'+handoffPanel(product)+'</div>';
      } else if (current) {
        const byPage = onPages(current);
        const shown = slides.filter(s => pageMatches(s, byPage.get(s.id) || []));
        const job = state.jobs?.[current.id];
        if(current.demo){
          const transferred=Array.from(byPage.values()).flat().filter(m=>m.handoff).length;
          body='<header class="demo-lookbook-head"><div><small>DEMO STUDIO · ÖRNEK CANVA SUNUMU</small><h2>'+escape(title(current))+'</h2>'+
            '<p>'+slides.length+' model · '+(slides.length-transferred)+' devir bekliyor · '+transferred+' üretime aktarıldı</p></div>'+
            action('＋ Görsel ekle','add-demo','','button primary')+'</header>'+
            '<div class="demo-lookbook">'+shown.map(page=>slideTile(page,current,byPage.get(page.id)||[],false)).join('')+'</div>'+
            (shown.length?'':'<p class="design-empty">Bu aramayla eşleşen model yok.</p>');
        } else body = '<div class="design-section-heading"><div><p class="design-kicker">CANVA SUNUMU</p><h2>' +
          escape(title(current)) + '</h2><p>' + slides.length + ' slayt</p></div><div class="design-actions">' +
          action('Tasarımcıyı düzenle', 'edit', current.id) +
          (job?.status === 'running' ? '<span role="status">Canva slaytları alınıyor…</span>' :
            action('Canva’yı güncelle', 'sync', current.id)) + '</div></div>' +
          (current.canvaError ? '<p class="design-empty" role="status">' + escape(current.canvaError) + '</p>' : '') +
          '<div class="design-grid">' + shown.map(slide => slideTile(slide,current,byPage.get(slide.id)||[],false)).join('') + '</div>' +
          (!shown.length && job?.status !== 'running' ? '<p class="design-empty">' +
            (slides.length ? 'Aramanla eşleşen slayt yok.' : (current.canvaSourceAt?'Bu sunum takipte. Eklenen veya değiştiği doğrulanan slaytlar burada görünecek.':'Slaytları yüklemek için Canva’yı güncelle.')) + '</p>' : '');
      } else {
        body = designers.length ? '<div class="designer-filter" role="group" aria-label="Tasarımcı filtresi"><span>Tasarımcı</span>' +
          '<button type="button" data-design-action="home" aria-pressed="' + !designer + '">Tümü</button>' +
          designers.map(name => '<button type="button" data-design-action="owner" data-key="' + escape(name) +
            '" aria-pressed="' + (name === designer) + '">' + escape(name) + '</button>').join('') + '</div>' : '';
      }
      if (needle && !current) {
        const results = [];
        for (const deck of designer ? own : presentations) {
          const byPage = onPages(deck);
          for (const page of deck.canvaSlides || []) {
            const models = byPage.get(page.id) || [];
            if (pageMatches(page, models)) {
              matchingDecks.add(deck.id);
              results.push(slideTile(page,deck,models,true));
            }
          }
        }
        if (results.length) {
          body +=
            '<section class="slide-results"><h3>Eşleşen slaytlar <small>' + results.length +
            '</small></h3><div class="design-grid">' + results.join('') + '</div></section>';
        }
      }
      const html = crumbs + body;
      if (container._markup !== html) {
        const oldPreview=container.querySelector('.original-slide');
        const open=oldPreview?.open&&oldPreview.dataset.slide===selected?.id;
        const focus=document.activeElement?.dataset.designAction==='select-product'&&container.contains(document.activeElement);
        container.innerHTML=html;
        container._markup=html;
        const preview=container.querySelector('.original-slide');
        if(preview){preview.dataset.slide=selected.id;if(oldPreview?.dataset.slide===selected.id)preview.open=!!open;}
        if(focus)container.querySelector('.selection-card.selected button')?.focus({preventScroll:true});
      }
    }

    container.addEventListener('click', event => {
      const button = event.target.closest('[data-design-action]');
      if (!button) return;
      const key = button.dataset.key;
      const kind = button.dataset.designAction;
      if (kind === 'select-product') {
        selectedProduct=key;
        callbacks.update();
        if(window.matchMedia?.('(max-width: 760px)').matches)container.querySelector('.handoff-panel')?.scrollIntoView?.({block:'start'});
        return;
      }
      if (kind === 'home') designer = presentation = slideId = '';
      else if (kind === 'owner') { designer = key; presentation = slideId = ''; }
      else if (kind === 'presentation') { presentation = key; slideId = ''; }
      else if (kind === 'slides') slideId = '';
      else if (kind === 'slide') {
        if (button.dataset.deck) presentation = button.dataset.deck;
        slideId = key;
      }
      else { callbacks.action(kind, key); return; }
      query = selectedProduct = '';
      callbacks.navigation();
    });

    return {
      render,
      search(value) { query = value; },
      openPresentation(id, page = '') { presentation = id; slideId = page; designer = query = selectedProduct = ''; },
      includesCollection(collection) { return !designer || owner(collection) === designer; },
      hasMatchingSlide(id) { return matchingDecks.has(id); },
      get designerName() { return designer==='Tasarımcı atanmamış'?'':designer; },
      get activeDeck() { return presentation; },
      get searchHint() { return hint; },
      get activeSlide() { return slideId; },
    };
  };
})();

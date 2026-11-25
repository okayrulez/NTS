"""Authorized design export with backend-only rotating OAuth credentials."""
import base64,datetime,hashlib,json,os,pathlib,re,threading,time,urllib.parse,urllib.request,urllib.error
from contextlib import contextmanager
from contextvars import ContextVar

from period import source_time, START

PRIVATE=pathlib.Path(os.environ.get('NUMUNE_CANVA_CONFIG_DIR') or pathlib.Path.home()/'.nts'/'canva')
TOKEN_LOCK=threading.Lock()
ACCOUNT=ContextVar('canva_account',default='original')

def import_account():
    team=PRIVATE/'nts-canva-uniteks'
    return 'team' if all((team/name).is_file() for name in ('numunetakip-canva-client.json','numunetakip-canva-token.json')) else 'original'

@contextmanager
def use_account(account):
    token=ACCOUNT.set(account)
    try:
        yield
    finally:
        ACCOUNT.reset(token)

class CanvaError(Exception):pass

def design_id(value):
    value=str(value or '').strip()
    if value.startswith(('http://','https://')):
        parsed=urllib.parse.urlsplit(value)
        if parsed.hostname not in ('canva.com','www.canva.com'):raise ValueError('Bir canva.com tasarım bağlantısı gir.')
        match=re.search(r'/design/(D[\w-]+)',parsed.path)
        value=match[1] if match else urllib.parse.parse_qs(parsed.query).get('designId',[''])[0]
    if not re.fullmatch(r'D[A-Za-z0-9_-]{5,40}',value):raise ValueError('Geçerli Canva tasarım bağlantısı veya kimliği gerekli.')
    return value

def access_token():
    with TOKEN_LOCK:
        folder=PRIVATE/'nts-canva-uniteks' if ACCOUNT.get()=='team' else PRIVATE
        path=folder/'numunetakip-canva-token.json';client_path=folder/'numunetakip-canva-client.json'
        if not path.exists() or not client_path.exists():raise CanvaError('Canva bağlantısı bu bilgisayarda kurulmamış.')
        token=json.loads(path.read_text());client=json.loads(client_path.read_text())
        if time.time()<token.get('received_at',0)+token.get('expires_in',0)-120:return token['access_token']
        if not token.get('refresh_token'):raise CanvaError('Canva yetkilendirmesinin yenilenmesi gerekiyor.')
        basic=base64.b64encode((client['client_id']+':'+client['client_secret']).encode()).decode()
        data=urllib.parse.urlencode({'grant_type':'refresh_token','refresh_token':token['refresh_token']}).encode()
        request=urllib.request.Request('https://api.canva.com/rest/v1/oauth/token',data=data,headers={'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'})
        try:
            with urllib.request.urlopen(request,timeout=30) as response:updated=json.load(response)
        except Exception:raise CanvaError('Canva oturumu yenilenemedi. Yeniden bağlantı gerekebilir.') from None
        updated['received_at']=time.time();temp=path.with_suffix('.new');temp.write_text(json.dumps(updated));temp.replace(path)
        return updated['access_token']

def api(path,payload=None):
    if not path.startswith('/designs') and not path.startswith('/exports'):raise ValueError('İzin verilmeyen API yolu.')
    token=access_token();data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request('https://api.canva.com/rest/v1'+path,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in (401,403):raise CanvaError('Canva tasarımını okuma yetkisi yok veya bağlantı yenilenmeli.') from None
        if error.code==404:raise CanvaError('Canva tasarımı bulunamadı.') from None
        if error.code==429:raise CanvaError('Canva istek sınırı doldu; sonraki kontrolde yeniden denenecek.') from None
        raise CanvaError('Canva dışa aktarımı başarısız: HTTP '+str(error.code)) from None

def list_designs(query=''):
    params={'limit':100,'sort_by':'modified_descending'}
    if query.strip():
        params['query']=query.strip()
    designs={}
    while True:
        data=api('/designs?'+urllib.parse.urlencode(params))
        reached_start=False
        for item in data.get('items',[]):
            if not source_time(item):
                if type(item.get('updated_at')) in (int,float) and item['updated_at']<=START.timestamp():
                    reached_start=True
                continue
            designs[item['id']]={'id':item['id'],'title':item.get('title','İsimsiz tasarım'),'pageCount':item.get('page_count')}
        continuation=data.get('continuation')
        if reached_start or not continuation or continuation==params.get('continuation'):
            return list(designs.values())
        params['continuation']=continuation


MODEL_CODE=re.compile(r'(?:model\s*(?:kodu|code)|style\s*(?:no|code)|numune\s*kodu)\s*[:：]\s*([^\n]+)',re.I)
PRODUCT_LINE=re.compile(r'(?:product\s*line|ürün\s*(?:grubu|hattı|serisi))\s*[:：]\s*([^\n]+)',re.I)


def page_ids(design,count):
    ids={}
    try:
        for offset in range(1,min(count,500)+1,200):
            items=api(f'/designs/{design}/pages?offset={offset}&limit=200').get('items',[])
            ids.update({p['page_number']:p['id'] for p in items if p.get('id') and p.get('page_number')})
    except CanvaError:
        pass
    return ids


ERP_NUMBER = re.compile(r'(?<!\w)[0-9]{9}(?!\w)')
PROCESS_LABEL = re.compile(
    r'^(?:(?:aşama|işlem|operasyon|süreç)\s*[:：-]\s*)?(dikim|kesim|kalıp)$', re.I
)
PROCESS_NAMES = {'dikim': 'Dikim', 'kesim': 'Kesim', 'kalip': 'Kalıp'}


def production_brief(text, code=None):
    """Only route a product when its own text identifies one number and operation."""
    numbers = set(ERP_NUMBER.findall(text))
    if code and ERP_NUMBER.fullmatch(str(code)):
        numbers.add(str(code))
    operations = set()
    for line in text.splitlines():
        label = ERP_NUMBER.sub('', line).strip(' \t·|:/–—-')
        label = re.sub(r'^ERP(?:\s+(?:no|kodu|numarası))?\s*[:：-]?\s*', '', label, flags=re.I)
        for segment in re.split(r'\s*[|·;/–—]\s*', label.strip(' \t:：-')):
            match = PROCESS_LABEL.fullmatch(segment.strip())
            if match:
                name = match[1].casefold().replace('\u0307', '').replace('ı', 'i')
                operations.add(PROCESS_NAMES[name])
    if len(numbers) == 1 and len(operations) == 1:
        return {'code': numbers.pop(), 'operation': operations.pop()}
    return None


def resolve_production_models(models, erp_rows):
    pending = []
    for model in models:
        brief = model.get('productionBrief') if 'productionBrief' in model else production_brief(model.get('notes') or '', model.get('code'))
        if (isinstance(brief,dict) and ERP_NUMBER.fullmatch(str(brief.get('code','')))
                and brief.get('operation') in PROCESS_NAMES.values() and not model.get('retired')):
            model['productionBrief'] = brief
            if not model.get('manualLink'):
                pending.append(model)
        elif brief:
            model['productionBrief']=None
    if not pending:
        return
    candidates = {}
    for row in erp_rows:
        erp = row.get('erp') or {}
        for value in (row.get('mainCode'), row.get('sampleCode'), row.get('barcode'),
                      row.get('model'), row.get('orderNo'), erp.get('recId'), erp.get('mainRecId')):
            number = str(value or '').strip()
            if ERP_NUMBER.fullmatch(number):
                candidates.setdefault(number, set()).add(row['modelKey'])
    for model in pending:
        hits = candidates.get(model['productionBrief']['code'], set())
        model['erpModelKey'] = next(iter(hits)) if len(hits) == 1 else None
        model['matchState'] = 'exact' if len(hits) == 1 else 'ambiguous' if hits else 'review'


def slide_record(page,design,part,local_page,number,canva_id,dist,page_filter=None):
    text=page.get_text(sort=True).strip()
    lines=[' '.join(line.split()) for line in text.splitlines() if line.strip()]
    title=next((line[:110] for line in lines if len(line)>=3 and not MODEL_CODE.search(line) and not PRODUCT_LINE.search(line)),f'Slayt {number}')
    slide_id='page-'+hashlib.sha256(canva_id.encode()).hexdigest()[:16] if canva_id else f'number-{number}'
    image_dir=dist/'canva-images'
    image_dir.mkdir(exist_ok=True)
    import pymupdf
    scale=min(1.5,900/max(page.rect.width,page.rect.height))
    pix=page.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False)
    data=pix.tobytes('jpeg',jpg_quality=78)
    digest=hashlib.sha256(data).hexdigest()[:20]
    if page_filter and not page_filter(slide_id,digest):
        return None
    filename=f'{design}-slide-{digest}.jpg'
    (image_dir/filename).write_bytes(data)
    line=PRODUCT_LINE.search(text)
    return {'id':slide_id,'number':number,'title':title,'photo':'canva-images/'+filename,
            'productLine':line[1].strip()[:180] if line else '', 'sourcePart':part,'sourcePage':local_page}


def recover_cached_slides(store,dist,cache):
    import pymupdf
    for collection in store.state()['collections']:
        design=collection.get('canvaDesignId')
        if not design or collection.get('canvaSlides'):
            continue
        design=design_id(design)
        files=sorted((p for p in cache.glob(f'{design}-*.pdf') if p.stem.rsplit('-',1)[-1].isdigit()),
                     key=lambda p:int(p.stem.rsplit('-',1)[-1]))
        slides=[]
        for file in files:
            part=int(file.stem.rsplit('-',1)[-1])
            with pymupdf.open(file) as doc:
                for index,page in enumerate(doc,1):
                    slides.append(slide_record(page,design,part,index,len(slides)+1,None,dist))
        if slides:
            store.put_collection({**collection,'canvaSlides':slides})


def parse_pdf(content,design,part,dist,model_cards,slides=None,page_numbers=(),ids=None,page_filter=None,first_offset=None):
    import pymupdf
    images=dist/'canva-images';images.mkdir(exist_ok=True)
    models=[];document=pymupdf.open(stream=content,filetype='pdf')
    ids=ids or {}
    normalized={}
    for key,values in model_cards.items():
        for value in values:
            if value:normalized.setdefault(' '.join(str(value).split()).casefold(),set()).add(key)
    for page_no,page in enumerate(document,1):
        text=page.get_text(sort=True);blocks=page.get_text('blocks');image_infos=page.get_image_info(xrefs=True)
        slide=None
        if slides is not None:
            offset=len(slides) if first_offset is None else first_offset+page_no-1
            number=page_numbers[offset] if offset<len(page_numbers) else offset+1
            slide=slide_record(page,design,part,page_no,number,ids.get(number),dist,page_filter)
            if slide is None:continue
            slides.append(slide)
        # A page is a model card when fields are explicitly labelled. Otherwise
        # preserve each image with nearby text for a user to resolve.
        codes=list(dict.fromkeys(match[1].strip() for match in MODEL_CODE.finditer(text)))
        explicit_code=codes[0] if len(codes)==1 else None
        useful=[x for x in image_infos if x.get('xref') and x['width']>=90 and x['height']>=90]
        if not useful and (not text.strip() or not explicit_code and len(text.strip())<3):continue
        labelled_rows=[]
        if not useful and len(set(ERP_NUMBER.findall(text)))>1:
            labelled_rows=[line for line in text.splitlines() if production_brief(line)]
        units=useful or [None]*max(1,len(labelled_rows) or len(codes))
        used=set()
        for position,info in enumerate(units):
            if info:
                image=document.extract_image(info['xref']);digest=hashlib.sha256(image['image']).hexdigest()[:16]
                if digest in used:continue
                used.add(digest);filename=design+'-'+digest+'.'+image['ext'];(images/filename).write_bytes(image['image'])
                photo='canva-images/'+filename;box=list(info['bbox'])
                lines=[]
                for b in blocks:
                    if len(b)>6 and b[6]==0:
                        bx=(b[0]+b[2])/2
                        if box[0]-30<=bx<=box[2]+30 and box[1]-150<=b[3]<=box[1]+40:lines.append(b[4].strip())
                nearby='\n'.join(lines) or text[:1500]
            else:
                nearby=labelled_rows[position] if labelled_rows else text[:3000]
                digest=hashlib.sha256((nearby if labelled_rows else text).encode()).hexdigest()[:16];photo=None;box=None
            nearby_codes=list(dict.fromkeys(match[1].strip() for match in MODEL_CODE.finditer(nearby)))
            code=(codes[position] if not info and codes and not labelled_rows else explicit_code) or (nearby_codes[0] if len(nearby_codes)==1 else None)
            # Only exact, unique ERP identifiers are eligible for an automatic link.
            hits=set()
            for line in nearby.splitlines():hits.update(normalized.get(re.sub(r'\s+',' ',line).strip().casefold(),set()))
            if code:
                hits=normalized.get(' '.join(code.split()).casefold(),set())
            linked=next(iter(hits)) if len(hits)==1 else None
            ident='canva-'+design+'-'+('code-'+hashlib.sha256(code.encode()).hexdigest()[:12] if code else digest)
            legacy_id=ident
            if slide:ident+='-'+slide['id']+('-'+digest[:8] if code and info else '')
            line=PRODUCT_LINE.search(nearby)
            models.append({'id':ident,'modelKey':ident,'legacyId':legacy_id,'slideId':slide['id'] if slide else None,'model':code or (nearby.splitlines()[0][:90] if nearby.strip() else 'Canva model '+str(position+1)),'code':code,'photo':photo,'notes':nearby,'productLine':line[1].strip()[:180] if line else (slide or {}).get('productLine',''),'source':'canva','canvaDesignId':design,'sourcePart':part,'page':page_no,'imageBox':box,'erpModelKey':linked,'matchState':'exact' if linked else 'review','retired':False})
            brief_text = nearby if labelled_rows else text
            if info and len(useful) > 1:
                # Assign a caption only to the closest image in its horizontal band.
                captions = []
                for block in blocks:
                    if len(block) < 7 or block[6] != 0:
                        continue
                    x = (block[0] + block[2]) / 2
                    distances = []
                    for index, candidate in enumerate(useful):
                        left, top, right, bottom = candidate['bbox']
                        if left - 8 <= x <= right + 8:
                            distances.append((max(0, top - block[3], block[1] - bottom), index))
                    distances.sort()
                    if (distances and distances[0][0] <= 150 and distances[0][1] == position
                            and (len(distances) == 1 or distances[0][0] < distances[1][0])):
                        captions.append(block[4])
                brief_text = '\n'.join(captions)
            models[-1]['productionBrief'] = production_brief(brief_text)
    document.close()
    return models

def slide_window(collection, new_design):
    previous=collection.get('canvaFingerprints') or {}
    previous_hashes=set(previous.values())
    shown={s['id']:pathlib.Path(s['photo']).stem.rsplit('-',1)[-1] for s in collection.get('canvaSlides',[])}
    visible_hashes=set(shown.values())
    current={}
    def include(slide,digest):
        current[slide]=digest
        if new_design:
            return True
        if not previous:
            return False
        if slide.startswith('page-') and slide in previous:
            return previous[slide]!=digest or slide in shown
        if slide.startswith('page-') and all(k.startswith('page-') for k in previous):
            return True
        # Number-only pages may move when another slide is inserted.
        return digest not in previous_hashes or digest in visible_hashes
    return current,include


def sync_collection(store,collection,dist,cache,erp_rows,force=False):
    design=design_id(collection['canvaDesignId']);metadata=api('/designs/'+design)['design']
    stamp=source_time(metadata)
    if stamp is None:
        candidate=collection.get('canvaBaselineCandidate') or {}
        if candidate.get('hashes') and candidate.get('version')==metadata.get('updated_at'):
            store.put_collection({**collection,'canvaFingerprints':candidate['hashes'],'canvaBaselineCandidate':None})
        if force:raise CanvaError('Bu sunumun takip başlangıcından sonra oluşturulmuş veya güncellenmiş bir sürümü yok.')
        return {'outsidePeriod':True,'count':0}
    if not force and collection.get('canvaSourceAt')==stamp and collection.get('canvaFingerprints') and collection.get('canvaUpdatedAt')==metadata.get('updated_at'):
        return {'unchanged':True,'count':len(collection.get('modelKeys',[]))}
    formats=api('/designs/'+design+'/export-formats').get('formats',{})
    if 'pdf' not in formats:raise CanvaError('Bu tasarım PDF olarak okunamıyor.')
    options={'type':'pdf'}
    if formats['pdf'].get('page_numbers'):options['pages']=formats['pdf']['page_numbers']
    job=api('/exports',{'design_id':design,'format':options})['job']
    for _ in range(45):
        if job['status'] in ('success','failed'):break
        time.sleep(2);job=api('/exports/'+job['id'])['job']
    if job['status']!='success':raise CanvaError('Canva dışa aktarımı tamamlanamadı.')
    model_cards={}
    for row in erp_rows:model_cards.setdefault(row['modelKey'],set()).update([row.get('model'),row.get('mainCode'),row.get('sampleCode')])
    models=[];slides=[]
    page_numbers=options.get('pages') or []
    page_count=metadata.get('page_count') or max(page_numbers,default=0)
    ids=page_ids(design,page_count)
    fingerprints,include=slide_window(collection,source_time({'created_at':metadata.get('created_at')}) is not None)
    for part,url in enumerate(job.get('urls',[]),1):
        if urllib.parse.urlsplit(url).scheme!='https':raise CanvaError('Güvenli Canva indirme adresi alınamadı.')
        with urllib.request.urlopen(url,timeout=60) as response:content=response.read(50_000_001)
        if len(content)>50_000_000:raise CanvaError('Canva dışa aktarımı 50 MB sınırını aştı.')
        models.extend(parse_pdf(content,design,part,dist,model_cards,slides,page_numbers,ids,include,len(fingerprints)))
    if not fingerprints:raise CanvaError('Canva sunumunda okunabilen slayt bulunamadı.')
    models=list({m['id']:m for m in models}.values())
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    existing=store.state()['models'];old={m['id']:m for m in existing if m.get('canvaDesignId')==design}
    claimed=set()
    for model in models:
        model['canvaSourceAt']=stamp
        previous=old.get(model['id'])
        if previous is None:
            legacy=old.get(model['legacyId'])
            if legacy and legacy['id'] not in claimed and legacy.get('sourcePart')==model['sourcePart'] and legacy.get('page')==model['page']:
                previous=legacy
                model['id']=model['modelKey']=legacy['id']
        claimed.add(model['id'])
        if previous and previous.get('manualLink'):
            model['erpModelKey']=previous.get('erpModelKey')
            model['manualLink']=True
    current={m['id'] for m in models}
    removed=[{**m,'retired':True} for m in old.values() if m['id'] not in current]
    store.put_models(models+removed)
    latest=next((c for c in store.state()['collections'] if c['id']==collection['id']),collection)
    members=[k for k in latest.get('modelKeys',[]) if not k.startswith('canva-'+design+'-')]
    members.extend(m['id'] for m in models)
    store.put_collection({**latest,'modelKeys':members,'canvaSlides':slides,'canvaFingerprints':fingerprints,'canvaBaselineCandidate':None,'canvaSourceAt':stamp,'canvaTitle':metadata.get('title') or latest['name'],'canvaUpdatedAt':metadata.get('updated_at'),'canvaSyncedAt':now,'canvaError':None})
    return {'unchanged':False,'count':len(models),'retired':len(removed)}

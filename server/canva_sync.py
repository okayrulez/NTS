"""Authorized design export with backend-only rotating OAuth credentials."""
import base64,datetime,hashlib,json,pathlib,re,threading,time,urllib.parse,urllib.request,urllib.error

PRIVATE=pathlib.Path('C:/Users/okay.dedeoglu/.codex/private-config')
TOKEN_LOCK=threading.Lock()
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
        path=PRIVATE/'numunetakip-canva-token.json';client_path=PRIVATE/'numunetakip-canva-client.json'
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
    data=api('/designs?'+urllib.parse.urlencode({'query':query,'limit':100,'sort_by':'modified_descending'}))
    return [{'id':x['id'],'title':x.get('title','İsimsiz tasarım'),'updatedAt':x.get('updated_at'),'pageCount':x.get('page_count')} for x in data.get('items',[])]

def parse_pdf(content,design,part,dist,model_cards):
    import pymupdf
    images=dist/'canva-images';images.mkdir(exist_ok=True)
    models=[];document=pymupdf.open(stream=content,filetype='pdf')
    for page_no,page in enumerate(document,1):
        text=page.get_text(sort=True);blocks=page.get_text('blocks');image_infos=page.get_image_info(xrefs=True)
        # A page is a model card when fields are explicitly labelled. Otherwise
        # preserve each image with nearby text for a user to resolve.
        field_code=re.search(r'(?:model\s*(?:kodu|code)|style\s*(?:no|code)|numune\s*kodu)\s*[:：]\s*([^\n]+)',text,re.I)
        explicit_code=field_code[1].strip() if field_code else None
        useful=[x for x in image_infos if x.get('xref') and x['width']>=90 and x['height']>=90]
        if not useful and (not text.strip() or not explicit_code and len(text.strip())<3):continue
        units=useful or [None]
        if explicit_code:units=[useful[0] if useful else None]
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
                digest=hashlib.sha256(text.encode()).hexdigest()[:16];photo=None;box=None;nearby=text[:3000]
            code=explicit_code
            # Only exact, unique ERP identifiers are eligible for an automatic link.
            normalized={}
            for key,values in model_cards.items():
                for x in values:
                    if x:normalized.setdefault(re.sub(r'\s+',' ',str(x)).strip().casefold(),set()).add(key)
            hits=set()
            for line in nearby.splitlines():hits.update(normalized.get(re.sub(r'\s+',' ',line).strip().casefold(),set()))
            if code:
                hits={key for key,values in model_cards.items() if code.casefold() in {str(v).casefold() for v in values}}
            linked=next(iter(hits)) if len(hits)==1 else None
            ident='canva-'+design+'-'+('code-'+hashlib.sha256(code.encode()).hexdigest()[:12] if code else digest)
            models.append({'id':ident,'modelKey':ident,'model':code or (nearby.splitlines()[0][:90] if nearby.strip() else 'Canva model '+str(position+1)),'code':code,'photo':photo,'notes':nearby,'source':'canva','canvaDesignId':design,'sourcePart':part,'page':page_no,'imageBox':box,'erpModelKey':linked,'matchState':'exact' if linked else 'review','retired':False})
    return models

def sync_collection(store,collection,dist,cache,erp_rows,force=False):
    design=design_id(collection['canvaDesignId']);metadata=api('/designs/'+design)['design']
    if not force and collection.get('canvaUpdatedAt')==metadata.get('updated_at'):
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
    models=[]
    for part,url in enumerate(job.get('urls',[]),1):
        if urllib.parse.urlsplit(url).scheme!='https':raise CanvaError('Güvenli Canva indirme adresi alınamadı.')
        with urllib.request.urlopen(url,timeout=60) as response:content=response.read(50_000_001)
        if len(content)>50_000_000:raise CanvaError('Canva dışa aktarımı 50 MB sınırını aştı.')
        (cache/f'{design}-{part}.pdf').write_bytes(content)
        models.extend(parse_pdf(content,design,part,dist,model_cards))
    models=list({m['id']:m for m in models}.values())
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    existing=store.state()['models'];old={m['id']:m for m in existing if m.get('canvaDesignId')==design}
    for model in models:
        if old.get(model['id'],{}).get('manualLink'):model['erpModelKey']=old[model['id']].get('erpModelKey');model['manualLink']=True
    current={m['id'] for m in models}
    removed=[{**m,'retired':True} for m in old.values() if m['id'] not in current]
    store.put_models(models+removed)
    latest=next((c for c in store.state()['collections'] if c['id']==collection['id']),collection)
    members=[k for k in latest.get('modelKeys',[]) if not k.startswith('canva-'+design+'-')]
    members.extend(m['id'] for m in models)
    store.put_collection({**latest,'modelKeys':members,'canvaUpdatedAt':metadata.get('updated_at'),'canvaSyncedAt':now,'canvaError':None})
    return {'unchanged':False,'count':len(models),'retired':len(removed)}

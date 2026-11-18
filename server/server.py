"""NumuneTakip V2: read-only ERP integration, isolated local collection storage."""
import json,pathlib,subprocess,datetime,threading,time,http.server,urllib.parse,sys,os,shutil,hashlib
from matching import build_matches
from v2_projection import build_v2_records
from v2_store import Store
import canva_sync
ROOT=pathlib.Path(__file__).resolve().parent.parent
DIST=ROOT/'dist';CACHE=ROOT/'server'/'cache';CACHE.mkdir(exist_ok=True)
RECORDS=json.loads((ROOT/'server'/'source-records.json').read_text(encoding='utf-8-sig'))['records']
STORE=Store(CACHE/'v2.sqlite3')
LOCK=threading.Lock();STATE_LOCK=threading.RLock();CANVA_LOCK=threading.Lock()
snapshot=None;versions={};last_read=0;last_error=True;jobs={}
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def install_snapshot(rows,analysis,brands,when=None):
 global snapshot,last_read,last_error
 value={'schemaVersion':3,'barcodes':rows,'analysis':analysis,'brands':brands,'connected':True,'fetchedAt':when or datetime.datetime.now(datetime.timezone.utc).isoformat()}
 value['revision']=digest([rows,analysis,brands])
 with STATE_LOCK:
  versions[value['revision']]={r['id']:r for r in rows}
  while len(versions)>4:versions.pop(next(iter(versions)))
  snapshot=value;last_read=time.monotonic();last_error=False
 return value

def current():
 with STATE_LOCK:
  if not snapshot:return {'barcodes':[],'connected':False,'revision':'','fetchedAt':None,'analysis':{},'brands':[],'error':'İlk ERP okuması hazırlanıyor.'}
  return {**snapshot,'connected':not last_error and time.monotonic()-last_read<180,'refreshing':LOCK.locked(),**({'error':'ERP okunamadı; son başarılı veri gösteriliyor.'} if last_error else {})}

def delta(since):
 data=current();rows=data.pop('barcodes');previous=versions.get(since)
 if previous is None:return {**data,'full':True,'updated':rows,'removed':[]}
 now={r['id']:r for r in rows}
 return {**data,'full':False,'updated':[r for ident,r in now.items() if previous.get(ident)!=r],'removed':[ident for ident in previous if ident not in now]}

def bridge(mode):
 shell=shutil.which('pwsh') or shutil.which('powershell.exe') or 'pwsh'
 # No secret appears on command line, in JSON output or under static assets.
 p=subprocess.run([shell,'-NoProfile','-NonInteractive','-File',str(ROOT/'server'/'erp_bridge.ps1'),'-Mode',mode],capture_output=True,encoding='utf-8-sig',timeout=75,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 if p.returncode:raise RuntimeError('ERP okuması başarısız.')
 return json.loads(p.stdout)
def convert_photos():
 from PIL import Image
 unsupported=CACHE/'unsupported-photos';unsupported.mkdir(exist_ok=True)
 for f in (DIST/'erp-photos').glob('*.bin'):
  try:
   with Image.open(f) as image:
    image=image.convert('RGB');image.thumbnail((800,800));image.save(f.with_suffix('.jpg'),quality=88)
   f.unlink()
  except Exception:
   # PDF/technical attachments are not product photos and are never static assets.
   target=(unsupported/f.name).resolve()
   if f.resolve().is_relative_to((DIST/'erp-photos').resolve()) and target.is_relative_to(CACHE.resolve()):f.replace(target)
def refresh():
 global last_error
 if not LOCK.acquire(blocking=False):return
 try:
  raw=bridge('Snapshot');convert_photos()
  raw['processSettings']=STORE.state()['processSettings']
  wanted={x for s in raw.get('serials',[]) for x in (s.get('AttachmentId'),s.get('MainAttachmentId')) if x}
  wanted.update(i.get('AttachmentId') for i in raw.get('items',[]) if i.get('AttachmentId'))
  missing={x for x in wanted if not (DIST/'erp-photos'/f'{x}.jpg').exists() and not (CACHE/'unsupported-photos'/f'{x}.bin').exists()}
  if missing:
   (CACHE/'photo-ids.json').write_text(json.dumps(sorted(missing)),encoding='utf-8');bridge('Photos');convert_photos()
  rows,analysis=build_v2_records(raw,RECORDS,lambda ident:(DIST/'erp-photos'/f'{ident}.jpg').exists())
  value=install_snapshot(rows,analysis,raw.get('brands',[]))
  (CACHE/'raw-v2.json').write_text(json.dumps(raw,ensure_ascii=False),encoding='utf-8')
  (CACHE/'snapshot-v2.json').write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
  print(f"ERP V2: {len(rows)} cards, {len(raw.get('movements',[]))} movements",flush=True)
 except Exception as error:
  last_error=True;print('ERP V2 read failed ('+type(error).__name__+'). Last snapshot preserved.',flush=True)
 finally:LOCK.release()

def reproject_local():
 global last_read,last_error
 # A local confirmation must not pretend that a new ERP read succeeded.
 with LOCK:
  path=CACHE/'raw-v2.json'
  if not path.exists():return
  raw=json.loads(path.read_text(encoding='utf-8'));raw['processSettings']=STORE.state()['processSettings']
  rows,analysis=build_v2_records(raw,RECORDS,lambda ident:(DIST/'erp-photos'/f'{ident}.jpg').exists())
  saved_read,saved_error=last_read,last_error
  install_snapshot(rows,analysis,raw.get('brands',[]),snapshot.get('fetchedAt') if snapshot else None)
  last_read,last_error=saved_read,saved_error


def sync_canva(collection,force=False):
 ident=collection['id']
 if not CANVA_LOCK.acquire(blocking=False):return False
 jobs[ident]={'status':'running','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 def run():
  try:
   result=canva_sync.sync_collection(STORE,collection,DIST,CACHE,current()['barcodes'],force)
   jobs[ident]={'status':'done',**result}
  except Exception as error:
   message=str(error) if isinstance(error,(ValueError,canva_sync.CanvaError)) else 'Canva okunamadı; bağlantıyı ve tasarım izinlerini kontrol et.'
   # Fetch current membership before setting error, preserving concurrent edits.
   latest=next((c for c in STORE.state()['collections'] if c['id']==ident),collection)
   STORE.put_collection({**latest,'canvaError':message});jobs[ident]={'status':'error','error':message}
  finally:CANVA_LOCK.release()
 threading.Thread(target=run,daemon=True).start();return True

class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(DIST),**kwargs)
 def valid_host(self):return self.headers.get('Host','').split(':')[0] in ('127.0.0.1','localhost')
 def output(self,data,status=200):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if not self.valid_host():self.send_error(403);return
  url=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(url.query);path=url.path
  if path=='/api/health':self.output({'app':'NumuneTakip V2','port':PORT,'erpReadOnly':True,'pollSeconds':60})
  elif path=='/api/erp/snapshot':self.output(current())
  elif path=='/api/erp/delta':self.output(delta(query.get('since',[''])[0]))
  elif path=='/api/state':self.output({**STORE.state(),'jobs':jobs.copy()})
  elif path=='/api/analysis':self.output(current().get('analysis',{}))
  elif path=='/api/canva/designs':
   try:self.output({'designs':canva_sync.list_designs(query.get('query',[''])[0][:120])})
   except Exception as error:self.output({'error':str(error) if isinstance(error,canva_sync.CanvaError) else 'Canva listesi okunamadı.'},502)
  elif path.startswith('/api/') or path.startswith('/.') or path.lower().endswith('.bin') or '/../' in urllib.parse.unquote(path):self.send_error(404)
  else:super().do_GET()
 def do_POST(self):
  if not self.valid_host():self.send_error(403);return
  origin=self.headers.get('Origin')
  if origin and origin!=('http://'+self.headers.get('Host','')):self.send_error(403);return
  if not self.headers.get('Content-Type','').startswith('application/json'):self.send_error(415);return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<2_000_000:raise ValueError('İstek boyutu geçersiz.')
   data=json.loads(self.rfile.read(length))
   if self.path=='/api/collections':result=STORE.put_collection(data)
   elif self.path=='/api/groups':result=STORE.put_group(data)
   elif self.path=='/api/process-settings':
    if int(data.get('sampleRecId',0)) not in {r['erp']['recId'] for r in current()['barcodes']}:raise ValueError('Numune kapsamda yok.')
    result=STORE.put_process_setting(data);reproject_local()
   elif self.path=='/api/models/restore':
    models=data.get('models',[])
    if not isinstance(models,list) or len(models)>5000:raise ValueError('Geçersiz model yedeği.')
    for m in models:
     if not isinstance(m,dict) or not str(m.get('id','')).startswith('canva-'):raise ValueError('Geçersiz Canva modeli.')
     if m.get('photo') and (not m['photo'].startswith('canva-images/') or '..' in m['photo']):raise ValueError('Geçersiz görsel yolu.')
    STORE.put_models(models);result={'restored':len(models)}
   elif self.path=='/api/models/link':
    if data.get('erpModelKey') not in {r['modelKey'] for r in current()['barcodes']}:raise ValueError('ERP modeli bu kapsamda yok.')
    result=STORE.link_model(data['id'],data['erpModelKey'])
   elif self.path=='/api/canva/import':
    design=canva_sync.design_id(data.get('url'));row=STORE.put_collection({**data,'canvaDesignId':design,'canvaWatch':True});result={'collection':row,'started':sync_canva(row,True)}
   elif self.path=='/api/canva/sync':
    row=next((c for c in STORE.state()['collections'] if c['id']==data.get('id')),None)
    if not row or not row.get('canvaDesignId'):raise ValueError('Canva koleksiyonu bulunamadı.')
    result={'started':sync_canva(row,True)}
   else:self.send_error(404);return
   self.output(result)
  except (ValueError,KeyError):self.output({'error':'Alanları kontrol et. Koleksiyon adı, model veya Canva bağlantısı geçersiz.'},400)
  except Exception:self.output({'error':'İşlem kaydedilemedi.'},500)
 def log_message(self,fmt,*args):pass
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff')
  if not self.path.startswith('/api/'):self.send_header('Cache-Control','no-cache')
  super().end_headers()

PORT=int(os.environ.get('NUMUNE_PORT','8845'))
def poll():
 while True:
  started=time.monotonic();refresh();time.sleep(max(1,60-(time.monotonic()-started)))
def canva_poll():
 while True:
  for collection in STORE.state()['collections']:
   if collection.get('canvaDesignId') and collection.get('canvaWatch') and collection.get('status')!='archived':
    sync_canva(collection)
    while CANVA_LOCK.locked():time.sleep(1)
  time.sleep(60)
if __name__=='__main__':
 cached=CACHE/'snapshot-v2.json'
 if cached.exists():
  try:
   value=json.loads(cached.read_text(encoding='utf-8'));install_snapshot(value['barcodes'],value.get('analysis',{}),value.get('brands',[]),value['fetchedAt']);last_error=True
  except Exception:pass
 if (CACHE/'raw-v2.json').exists():
  try:reproject_local()
  except Exception:pass
 if '--refresh-only' in sys.argv:refresh();sys.exit(0 if not last_error else 1)
 threading.Thread(target=poll,daemon=True).start();threading.Thread(target=canva_poll,daemon=True).start()
 print(f'NumuneTakip V2: http://127.0.0.1:{PORT}',flush=True)
 http.server.ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()

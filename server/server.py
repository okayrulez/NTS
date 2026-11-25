"""NumuneTakip V2: read-only ERP integration, isolated local collection storage."""
import json,pathlib,subprocess,datetime,threading,time,http.server,urllib.parse,sys,os,shutil,hashlib
import period
import monthly
from uff_feed import UffFeed
from v2_projection import build_v2_records
from v2_store import Store
import canva_sync
import followups
from universe_feed import Feed, PendingCatalog, match as catalog_match, key as card_id
import ipaddress
ROOT=pathlib.Path(__file__).resolve().parent.parent
DIST=ROOT/'dist';CACHE=ROOT/'server'/'cache'/period.PERIOD_ID;CACHE.mkdir(parents=True,exist_ok=True)
MEDIA=CACHE/'media'
for media_type in ('erp-photos','canva-images'):(MEDIA/media_type).mkdir(parents=True,exist_ok=True)
STORE=Store(CACHE/'v2.sqlite3')
period.migrate_configuration(STORE,CACHE.parent/'v2.sqlite3')
UNIVERSE=Feed(CACHE/'universe-month.json')
UFF=UffFeed(CACHE/'uff-month.json')
PENDING_CATALOG=PendingCatalog()
LOCK=threading.Lock();STATE_LOCK=threading.RLock();CANVA_LOCK=threading.Lock()
snapshot=None;versions={};last_read=0;last_error=True;jobs={}
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def install_snapshot(rows,analysis,brands,when=None,limited=False,window=None):
 global snapshot,last_read,last_error
 value={'trackingSince':(window or monthly.since()).isoformat(),'days':monthly.DAYS,'partialArchive':limited,'schemaVersion':3,'barcodes':rows,'analysis':analysis,'brands':brands,'connected':True,'fetchedAt':when or datetime.datetime.now(datetime.timezone.utc).isoformat()}
 value['revision']=digest([rows,analysis,brands])
 with STATE_LOCK:
  versions[value['revision']]={r['id']:r for r in rows}
  while len(versions)>4:versions.pop(next(iter(versions)))
  snapshot=value;last_read=time.monotonic();last_error=False
 return value

def current():
 with STATE_LOCK:
  if not snapshot or snapshot.get('trackingSince')!=monthly.since().isoformat():return {'trackingSince':monthly.since().isoformat(),'days':monthly.DAYS,'barcodes':[],'connected':False,'revision':'','fetchedAt':None,'analysis':{},'brands':[],'error':'İlk ERP okuması hazırlanıyor.'}
  return {**snapshot,'connected':not last_error and time.monotonic()-last_read<180,'refreshing':LOCK.locked(),**({'error':'ERP okunamadı; son başarılı veri gösteriliyor.'} if last_error else {})}

def delta(since):
 data=current();rows=data.pop('barcodes');previous=versions.get(since)
 if previous is None:return {**data,'full':True,'updated':rows,'removed':[]}
 now={r['id']:r for r in rows}
 return {**data,'full':False,'updated':[r for ident,r in now.items() if previous.get(ident)!=r],'removed':[ident for ident in previous if ident not in now]}

def bridge(mode):
 shell=shutil.which('pwsh') or shutil.which('powershell.exe') or 'pwsh'
 # No secret appears on command line, in JSON output or under static assets.
 p=subprocess.run([shell,'-NoProfile','-NonInteractive','-File',str(ROOT/'server'/'erp_bridge.ps1'),'-Mode',mode,'-CacheDir',str(CACHE)],capture_output=True,encoding='utf-8-sig',timeout=75,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 if p.returncode:raise RuntimeError('ERP okuması başarısız.')
 return json.loads(p.stdout)
def convert_photos():
 from PIL import Image
 unsupported=CACHE/'unsupported-photos';unsupported.mkdir(exist_ok=True)
 for f in (MEDIA/'erp-photos').glob('*.bin'):
  try:
   with Image.open(f) as image:
    image=image.convert('RGB');image.thumbnail((800,800));image.save(f.with_suffix('.jpg'),quality=88)
   f.unlink()
  except Exception:
   # PDF/technical attachments are not product photos and are never static assets.
   target=(unsupported/f.name).resolve()
   f.with_suffix('.jpg').unlink(missing_ok=True)
   if f.resolve().is_relative_to((MEDIA/'erp-photos').resolve()) and target.is_relative_to(CACHE.resolve()):f.replace(target)
def publish_erp(raw,window):
 rows,analysis=build_v2_records(raw,[],lambda ident:(MEDIA/'erp-photos'/f'{ident}.jpg').exists())
 install_snapshot(rows,analysis,raw.get('brands',[]),raw['sourceReadAt'],window=window)
 return len(rows)

def refresh():
 global last_error
 if not LOCK.acquire(blocking=False):return
 try:
  window=monthly.since();raw=bridge('Snapshot');raw['sourceReadAt']=monthly.now().isoformat();convert_photos()
  raw['processSettings']=STORE.state()['processSettings']
  wanted={x for s in raw.get('serials',[]) for x in (s.get('AttachmentId'),s.get('MainAttachmentId')) if x}
  wanted.update(i.get('AttachmentId') for i in raw.get('items',[]) if i.get('AttachmentId'))
  missing={x for x in wanted if not (MEDIA/'erp-photos'/f'{x}.jpg').exists() and not (CACHE/'unsupported-photos'/f'{x}.bin').exists()}
  photo_stamps={str(i['AttachmentId']):i['PhotoChangeAt'] for i in raw.get('items',[]) if i.get('AttachmentId') and i.get('PhotoChangeAt')}
  versions_file=CACHE/'photo-versions.json'
  previous=json.loads(versions_file.read_text('utf8')) if versions_file.exists() else {}
  missing.update(int(k) for k,v in photo_stamps.items() if previous.get(k)!=v)
  tmp=CACHE/'erp-month.tmp';tmp.write_text(json.dumps(raw,ensure_ascii=False),encoding='utf-8');tmp.replace(CACHE/'erp-month.json')
  count=publish_erp(raw,window)
  print(f"ERP V2: {count} cards, {len(raw.get('movements',[]))} movements",flush=True)
  batch=sorted(missing,reverse=True)[:120]
  if batch:
   try:
    (CACHE/'photo-ids.json').write_text(json.dumps(batch),encoding='utf-8')
    bridge('Photos');convert_photos()
    versions={str(ident):photo_stamps[str(ident)] for ident in batch if str(ident) in photo_stamps}
    versions_file.write_text(json.dumps({**previous,**versions}),'utf8')
    publish_erp(raw,window)
   except (RuntimeError,OSError,ValueError,subprocess.SubprocessError):
    print('ERP photos deferred until the next update.',flush=True)
 except Exception as error:
  if not snapshot or snapshot.get('trackingSince')!=monthly.since().isoformat():restore_erp()
  last_error=True;print('ERP V2 read failed ('+type(error).__name__+'). Last snapshot preserved.',flush=True)
 finally:LOCK.release()

def restore_erp():
 # The older read covered a subset of ERP. Preserve its real observation time and identify it on screen.
 global last_read,last_error
 path=CACHE/'erp-month.json'
 limited=not path.exists()
 if limited:path=CACHE.parent/'raw-v2.json'
 try:
  raw=json.loads(path.read_text('utf8'))
  read_at=raw.get('sourceReadAt') if not limited else json.loads((path.parent/'snapshot-v2.json').read_text('utf8'))['fetchedAt']
  observed=monthly.moment(read_at)
  if observed is None:return
  end=monthly.now();start=monthly.since(end)
  raw=monthly.scope(raw,start,min(end,observed))
  raw['processSettings']=STORE.state()['processSettings']
  def has_photo(ident):
   if not str(ident).isdigit():return False
   name=str(ident)+'.jpg';target=MEDIA/'erp-photos'/name
   previous=DIST/'erp-photos'/name
   if limited and not target.is_file() and previous.is_file():shutil.copyfile(previous,target)
   return target.is_file()
  rows,analysis=build_v2_records(raw,[],has_photo)
  saved_read,saved_error=last_read,last_error
  install_snapshot(rows,analysis,raw.get('brands',[]),read_at,limited,start)
  last_read,last_error=saved_read,saved_error
 except (OSError,ValueError,KeyError,TypeError):
  print('ERP cached read unavailable.',flush=True)

def reproject_local():
 with LOCK:restore_erp()

def sync_canva(collection,force=False):
 ident=collection['id']
 if not CANVA_LOCK.acquire(blocking=False):return False
 jobs[ident]={'status':'running','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 def run():
  try:
   with canva_sync.use_account(collection.get('canvaAccount','original')):
    result=canva_sync.sync_collection(STORE,collection,MEDIA,CACHE,current()['barcodes'],force)
   jobs[ident]={'status':'done',**result}
  except Exception as error:
   message=str(error) if isinstance(error,(ValueError,canva_sync.CanvaError)) else 'Canva okunamadı; bağlantıyı ve tasarım izinlerini kontrol et.'
   # Fetch current membership before setting error, preserving concurrent edits.
   latest=next((c for c in STORE.state()['collections'] if c['id']==ident),collection)
   STORE.put_collection({**latest,'canvaError':message});jobs[ident]={'status':'error','error':message}
  finally:CANVA_LOCK.release()
 threading.Thread(target=run,daemon=True).start();return True

class NtsHttpServer(http.server.ThreadingHTTPServer):
 # The dashboard and its practice frame load scripts and thumbnails concurrently.
 request_queue_size=128

class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(DIST),**kwargs)
 def translate_path(self,path):
  static=pathlib.Path(super().translate_path(path))
  rel=static.relative_to(DIST)
  if rel.parts and rel.parts[0].lower() in ('erp-photos','canva-images'):
   return str(MEDIA/rel)
  if rel.parts and rel.parts[0].lower() in ('photos','data.js','erp-snapshot.js'):
   return str(CACHE/'unavailable')
  return str(static)
 def list_directory(self,path):
  self.send_error(404)
 def valid_host(self):
  host=self.headers.get('Host','').split(':')[0]
  network=getattr(self.server,'team_network',None)
  if network is None:return host in ('127.0.0.1','localhost')
  return host==self.server.server_address[0] and ipaddress.ip_address(self.client_address[0]) in network
 def do_HEAD(self):
  if not self.valid_host() or self.path.startswith('/api/'):self.send_error(403);return
  super().do_HEAD()
 def output(self,data,status=200):
  body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if not self.valid_host():self.send_error(403);return
  url=urllib.parse.urlsplit(self.path);query=urllib.parse.parse_qs(url.query);path=url.path
  if getattr(self.server,'team_network',None) is not None and path.startswith('/api/canva/'):
   self.output({'error':'Canva bağlantısı ana bilgisayardan yönetilir.'},403);return
  if path=='/api/health':self.output({'trackingSince':period.SINCE,'app':'NumuneTakip V2','port':PORT,'erpReadOnly':True,'pollSeconds':60,'sharedFollowup':True,'teamUrl':team_url()})
  elif path=='/api/universe/uff':self.output(UFF.get())
  elif path=='/api/universe/recent':
   erp=current()
   self.output({**UNIVERSE.get(erp['barcodes']),'erpReadAt':erp.get('fetchedAt'),'erpConnected':erp['connected']})
  elif path=='/api/universe/pending':
   erp=current()
   queue=PENDING_CATALOG.get(erp['barcodes'],STORE.followup_state())
   self.output({**queue,'erpReadAt':erp.get('fetchedAt'),'erpConnected':erp['connected']})
  elif path=='/api/universe/production':
   style=query.get('style',[''])[0];main=query.get('main',[''])[0]
   if len(style)>19 or not card_id(style) or (main and (len(main)>19 or not card_id(main))):
    self.output({'error':'Geçersiz ERP kart numarası.'},400);return
   erp=current()
   result=catalog_match([{'styleId':style,'mainId':main}],erp['barcodes'])[0]
   self.output({**result,'erpReadAt':erp.get('fetchedAt'),'erpConnected':erp['connected']})
  elif path=='/api/erp/snapshot':self.output(current())
  elif path=='/api/erp/delta':self.output(delta(query.get('since',[''])[0]))
  elif path=='/api/state':
   visible=period.visible_state(STORE.state())
   canva_sync.resolve_production_models(visible['models'],current()['barcodes'])
   self.output({**visible,'trackingSince':period.SINCE,'jobs':{k:v for k,v in jobs.copy().items() if not v.get('outsidePeriod')}})
  elif path=='/api/analysis':self.output(current().get('analysis',{}))
  elif path=='/api/canva/designs':
   try:
    with canva_sync.use_account(canva_sync.import_account()):
     self.output({'designs':canva_sync.list_designs(query.get('query',[''])[0][:120])})
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
   if getattr(self.server,'team_network',None) is not None and self.path in ('/api/team-listener','/api/models/restore','/api/canva/import','/api/canva/sync'):
    self.output({'error':'Bu işlem ana bilgisayardan yapılır.'},403);return
   if self.path!='/api/team-listener' and data.get('trackingSince')!=period.SINCE:
    self.output({'error':'Takip dönemi değişti. Sayfayı yeniden aç.'},409);return
   if self.path=='/api/team-listener':
    result={'url':enable_team(data['interface'])}
   elif self.path in ('/api/followups','/api/followups/import'):
    try:
     with STORE.connect() as db:
      result=followups.save(db,data) if self.path=='/api/followups' else followups.merge(db,data)
    except followups.Conflict as conflict:
     self.output({'error':'Aynı alan başka bir cihazda değişti.','current':conflict.row},409);return
    except (ValueError,KeyError,TypeError):
     self.output({'error':'Numune kimliği, hedef tarih veya takip alanlarını kontrol et.'},400);return
   elif self.path=='/api/collections':
    if data.get('fromBackup') and data.get('canvaDesignId'):
     if not period.active_stamp(data.get('canvaSourceAt')):raise ValueError('Canva dönemi geçersiz.')
     canva_sync.design_id(data['canvaDesignId'])
     result=STORE.put_collection(data)
    else:result=STORE.put_collection({k:v for k,v in data.items() if not k.startswith('canva')})
   elif self.path=='/api/groups':result=STORE.put_group(data)
   elif self.path=='/api/process-settings':
    if int(data.get('sampleRecId',0)) not in {r['erp']['recId'] for r in current()['barcodes']}:raise ValueError('Numune kapsamda yok.')
    result=STORE.put_process_setting(data);reproject_local()
   elif self.path=='/api/models/restore':
    models=data.get('models',[])
    if not isinstance(models,list) or len(models)>5000:raise ValueError('Geçersiz model yedeği.')
    for m in models:
     if not isinstance(m,dict) or not period.active_stamp(m.get('canvaSourceAt')) or not str(m.get('id','')).startswith('canva-'):raise ValueError('Geçersiz Canva modeli.')
     if m.get('photo') and (not m['photo'].startswith('canva-images/') or '..' in m['photo']):raise ValueError('Geçersiz görsel yolu.')
    STORE.put_models(models);result={'restored':len(models)}
   elif self.path=='/api/models/link':
    if data.get('erpModelKey') not in {r['modelKey'] for r in current()['barcodes']}:raise ValueError('ERP modeli bu kapsamda yok.')
    result=STORE.link_model(data['id'],data['erpModelKey'])
   elif self.path=='/api/models/handoff':
    key=data.get('erpModelKey')
    erp_rows=current()['barcodes']
    if not key or key not in {r['modelKey'] for r in erp_rows if r.get('recordType') in ('sample','barcode')}:
     self.output({'error':'Bağlı ERP modeli mevcut numune kapsamında bulunamadı.'},400);return
    try:result=STORE.handoff_model(data['id'],key,data.get('note'),erp_rows)
    except ValueError as error:self.output({'error':str(error)},400);return
   elif self.path=='/api/canva/import':
    design=canva_sync.design_id(data.get('url'))
    account=canva_sync.import_account()
    with canva_sync.use_account(account):
     metadata=canva_sync.api('/designs/'+design)['design']
    if not period.source_time(metadata):
     self.output({'error':'Canva sunumu takip başlangıcından sonra oluşturulmamış veya güncellenmemiş.'},400);return
    row=STORE.put_collection({**data,'canvaDesignId':design,'canvaWatch':True,'canvaAccount':account});result={'collection':row,'started':sync_canva(row,True)}
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
TEAM_LOCK=threading.Lock()
team_server=None

def team_url():
 server=team_server
 return f'http://{server.server_address[0]}:{PORT}' if server else None

def enable_team(interface):
 global team_server
 address=ipaddress.IPv4Interface(interface)
 if address.ip.is_unspecified or address.ip.is_loopback or address.ip.is_multicast or address.network.prefixlen==0:
  raise ValueError('Geçersiz Wi-Fi adresi.')
 with TEAM_LOCK:
  if team_server and team_server.server_address[0]==str(address.ip):
   team_server.team_network=address.network
   return team_url()
  listener=NtsHttpServer((str(address.ip),PORT),Handler)
  listener.team_network=address.network
  previous=team_server
  team_server=listener
  threading.Thread(target=listener.serve_forever,daemon=True).start()
  if previous:
   previous.shutdown();previous.server_close()
  return team_url()

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
 restore_erp()
 if '--refresh-only' in sys.argv:refresh();sys.exit(0 if not last_error else 1)
 threading.Thread(target=poll,daemon=True).start();threading.Thread(target=canva_poll,daemon=True).start()
 print(f'NumuneTakip V2: http://127.0.0.1:{PORT}',flush=True)
 NtsHttpServer(('127.0.0.1',PORT),Handler).serve_forever()

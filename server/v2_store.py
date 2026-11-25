"""Only V2 collections and imported designs are stored here; never ERP writes."""
import datetime,json,pathlib,sqlite3,uuid
from contextlib import contextmanager

class Store:
    def __init__(self,path):
        self.path=pathlib.Path(path);self.path.parent.mkdir(exist_ok=True,parents=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS sewing_groups (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS process_settings (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=20)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            with db:yield db
        finally:db.close()
    def followup_state(self):
        with self.connect() as db:
            return {key:json.loads(value) for key,value in db.execute('SELECT id,payload FROM followups')}
    def state(self):
        with self.connect() as db:
            return {'followups':{key:json.loads(value) for key,value in db.execute('SELECT id,payload FROM followups')},'collections':[json.loads(x[0]) for x in db.execute('SELECT payload FROM collections')],'models':[json.loads(x[0]) for x in db.execute('SELECT payload FROM models')],'groups':[json.loads(x[0]) for x in db.execute('SELECT payload FROM sewing_groups')],'processSettings':[json.loads(x[0]) for x in db.execute('SELECT payload FROM process_settings')]}
    def put_collection(self,data):
        if not isinstance(data,dict):raise ValueError('Geçersiz koleksiyon.')
        name=str(data.get('name','')).strip()
        if not name or len(name)>120:raise ValueError('Koleksiyon adı 1–120 karakter olmalı.')
        ident=str(data.get('id') or 'collection-'+uuid.uuid4().hex)
        if len(ident)>150:raise ValueError('Geçersiz kimlik.')
        with self.connect() as db:
            old=db.execute('SELECT payload FROM collections WHERE id=?',(ident,)).fetchone();old=json.loads(old[0]) if old else {}
            row={**old,'id':ident,'name':name,'brandId':str(data.get('brandId',old.get('brandId',''))),'branchId':str(data.get('branchId',old.get('branchId',''))),'status':data.get('status',old.get('status','auto')),'modelKeys':list(dict.fromkeys(str(x) for x in data.get('modelKeys',old.get('modelKeys',[])))),'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
            if row['status'] not in ('auto','active','paused','completed','archived'):raise ValueError('Geçersiz koleksiyon durumu.')
            if len(row['modelKeys'])>10000:raise ValueError('Çok fazla model seçildi.')
            for key in ('designer','modelhouseManager','canvaAccount','canvaDesignId','canvaUpdatedAt','canvaWatch','canvaError','canvaSyncedAt','canvaTitle','canvaSlides','canvaSourceAt','canvaFingerprints','canvaBaselineCandidate'):
                if key in data:row[key]=data[key]
            db.execute('INSERT OR REPLACE INTO collections VALUES (?,?)',(ident,json.dumps(row,ensure_ascii=False)))
        return row
    def put_models(self,models):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for row in models:
                existing=db.execute('SELECT payload FROM models WHERE id=?',(row['id'],)).fetchone()
                previous=json.loads(existing[0]) if existing else {}
                if previous.get('manualLink') and not row.get('manualLink'):row={**row,'erpModelKey':previous.get('erpModelKey'),'manualLink':True}
                if previous.get('handoff'):row={**row,'handoff':previous['handoff']}
                db.execute('INSERT OR REPLACE INTO models VALUES (?,?)',(row['id'],json.dumps(row,ensure_ascii=False)))
    def link_model(self,ident,key):
        if not isinstance(key,str) or not key.startswith('erp-model:'):raise ValueError('Bir ERP modeli seç.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT payload FROM models WHERE id=?',(ident,)).fetchone()
            if not old:raise ValueError('Model bulunamadı.')
            row=json.loads(old[0])
            if row.get('retired'):raise ValueError('Tasarım ürünü arşivlenmiş.')
            if row.get('erpModelKey')!=key:row.pop('handoff',None)
            row['erpModelKey']=key;row['manualLink']=True
            db.execute('UPDATE models SET payload=? WHERE id=?',(json.dumps(row,ensure_ascii=False),ident))
        return row

    def handoff_model(self, ident, key, note, erp_rows=None):
        note = str(note or '').strip()
        if len(note) > 2000:
            raise ValueError('Tasarım kararı en fazla 2000 karakter olabilir.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            item = db.execute('SELECT payload FROM models WHERE id=?', (ident,)).fetchone()
            model = json.loads(item[0]) if item else {}
            if erp_rows is not None and model:
                from canva_sync import resolve_production_models
                resolve_production_models([model], erp_rows)
            if model.get('retired') or model.get('erpModelKey') != key:
                raise ValueError('Önce tasarımı mevcut bir ERP modeliyle eşleştir.')
            previous = model.get('handoff') or {}
            if previous.get('erpModelKey') == key and previous.get('note') == note:
                return model
            model['handoff'] = {
                'erpModelKey': key, 'note': note,
                'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            model['manualLink'] = True
            db.execute('UPDATE models SET payload=? WHERE id=?', (json.dumps(model, ensure_ascii=False), ident))
            return model

    def put_group(self,data):
        name=str(data.get('name','')).strip()
        if not name or len(name)>100:raise ValueError('Grup adı 1–100 karakter olmalı.')
        ident=str(data.get('id') or 'group-'+uuid.uuid4().hex)
        if len(ident)>120:raise ValueError('Geçersiz grup kimliği.')
        row={'id':ident,'name':name,'manager':str(data.get('manager',''))[:100],'notes':str(data.get('notes',''))[:1500],'active':data.get('active',True) is True,'source':'local-definition','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with self.connect() as db:db.execute('INSERT OR REPLACE INTO sewing_groups VALUES (?,?)',(ident,json.dumps(row,ensure_ascii=False)))
        return row

    def put_process_setting(self,data):
        rec=int(data.get('sampleRecId',0))
        if rec<=0:raise ValueError('Numune kaydı geçersiz.')
        choice=data.get('intermediate','erp')
        if choice not in ('erp','none','print','embroidery','both'):raise ValueError('Ara işlem geçersiz.')
        row={'id':'sample:'+str(rec),'sampleRecId':rec,'intermediate':choice,'source':'V2 kullanıcı teyidi','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with self.connect() as db:db.execute('INSERT OR REPLACE INTO process_settings VALUES (?,?)',(row['id'],json.dumps(row,ensure_ascii=False)))
        return row

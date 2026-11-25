"""Read the same product API and Üniteks filter used by the UFF brand screens."""
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import monthly

ORIGIN=os.environ.get('NUMUNE_UFF_ORIGIN','').rstrip('/')
BRANDS={'hm':'H&M','zara':'Zara','bsk':'Bershka','ca':'C&A','mango':'Mango','primark':'Primark','reserved':'Reserved','massimo':'Massimo Dutti'}
ZARA_SUPPLIER_CODES={value.strip() for value in os.environ.get('NUMUNE_UFF_ZARA_SUPPLIER_CODES','').split(',') if value.strip()}

def supplier(value):
    name=unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode().upper()
    return bool(re.search(r'\b(?:UNITEKS|UNIT[ -]*X)\b',name))

def product(brand,row,start,end):
    created=row.get('created_at')
    if not monthly.in_range(created,start,end) or not row.get('id'):return None
    ident=str(row['id'])
    reference=row.get('display_reference') or row.get('display_ref') or row.get('reference') or row.get('code') or ''
    labels=[row.get('manufacturer'),row.get('supplier_name')]
    labels += [s.get('supplier_name') for s in row.get('suppliers') or [] if isinstance(s,dict)]
    if any(supplier(label) for label in labels):evidence='Üretici / tedarikçi adı'
    elif brand=='zara' and str(reference).split('/')[0].strip() in ZARA_SUPPLIER_CODES:evidence='Zara tedarikçi kodu'
    elif brand=='hm':evidence='UFF tedarikçi veya ERP sipariş eşleşmesi'
    else:evidence='ERP sipariş eşleşmesi'
    img=row.get('image') or row.get('image_url') or row.get('first_image')
    if isinstance(img,dict):img=img.get('url') or img.get('image_url')
    image=img if isinstance(img,str) and img.startswith('https://') else None
    page={'bsk':'bershka'}.get(brand,brand)
    return {'id':ident,'brand':BRANDS[brand],'brandKey':brand,'name':row.get('name') or row.get('title') or str(reference) or ident,
            'reference':str(reference),'addedAt':created,'evidence':evidence,'image':image,
            'url':ORIGIN+'/'+page+'/product/'+urllib.parse.quote(ident,safe='') if ORIGIN else ''}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never forward the server's bearer credential to a redirect destination.
    def redirect_request(self,*args):return None

def fetch_page(brand,params):
    origin=urllib.parse.urlsplit(ORIGIN)
    if origin.scheme!='https' or not origin.hostname or origin.path or origin.query or origin.fragment or origin.username:
        raise ValueError('NUMUNE_UFF_ORIGIN must be an HTTPS service origin.')
    token=os.environ.get('NUMUNE_UFF_TOKEN','').strip()
    file=os.environ.get('NUMUNE_UFF_TOKEN_FILE')
    if not token and file:token=Path(file).read_text('utf-8-sig').strip()
    headers={'Accept':'application/json','User-Agent':'NumuneTakip/2'}
    if token:headers['Authorization']='Bearer '+token
    url=ORIGIN+'/api/'+brand+'-products?'+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=8) as response:return json.load(response)

def read_brand(brand,start,end,page_reader=fetch_page):
    # Some endpoints parse calendar dates in their server timezone. Read a wider
    # range for them and apply the exact Istanbul window to every returned row.
    first=start.astimezone(dt.timezone.utc).date()
    last=end.astimezone(monthly.IST).date()
    params={
        'uniteks_only':'1','sort':'newest','limit':100,
        'created_after':first.isoformat(),
        'created_before':(last+dt.timedelta(days=1)).isoformat(),
        'from_date':first.isoformat(),'to_date':last.isoformat(),
    }
    products={};page=1;seen=set()
    while True:
        data=page_reader(brand,{**params,'page':page})
        rows=data['data'];pages=int(data['totalPages'])
        if not isinstance(rows,list) or int(data['page'])!=page or pages<0:raise ValueError('Invalid product page')
        signature=tuple(str(r['id']) for r in rows)
        if page>1 and (not signature or signature in seen):raise ValueError('Incomplete product pagination')
        seen.add(signature)
        for row in rows:
            value=product(brand,row,start,end)
            if value:products[value['id']]=value
        if page>=pages:break
        page+=1
    return list(products.values())

class UffFeed:
    def __init__(self,cache,reader=read_brand):
        self.cache=Path(cache);self.reader=reader;self.lock=threading.Lock()
        self.saved={};self.failures={};self.next=0
        try:self.saved=json.loads(self.cache.read_text('utf8'))['brands']
        except (OSError,ValueError,KeyError):pass

    def get(self):
        with self.lock:
            end=monthly.now();start=monthly.since(end)
            if time.monotonic()>=self.next:
                self.failures={}
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    jobs={pool.submit(self.reader,b,start,end):b for b in BRANDS}
                    for task,b in jobs.items():
                        try:self.saved[b]={'rows':task.result(),'readAt':end.isoformat()}
                        except urllib.error.HTTPError as e:
                            if e.code in (401,403):
                                self.saved.pop(b,None);self.failures[b]='auth'
                            elif e.code == 500 and e.fp and b'too many clients' in e.read(1024).lower():
                                self.failures[b]='capacity'
                            else:self.failures[b]='offline'
                        except (OSError,ValueError,KeyError,TypeError):self.failures[b]='offline'
                try:
                    tmp=self.cache.with_suffix('.tmp')
                    tmp.write_text(json.dumps({'brands':self.saved},ensure_ascii=False),'utf8');tmp.replace(self.cache)
                except OSError:pass
                self.next=time.monotonic()+60
            rows=[];sources=[]
            for brand,name in BRANDS.items():
                saved=self.saved.get(brand,{})
                sources.append({'brand':name,'status':self.failures.get(brand,'ok'),'readAt':saved.get('readAt')})
                rows.extend({**r,'cached':brand in self.failures} for r in saved.get('rows',[])
                            if monthly.in_range(r['addedAt'],start,end))
            rows.sort(key=lambda r:(monthly.moment(r['addedAt']),r['brand'],r['id']),reverse=True)
            return {'products':rows,'sources':sources,'available':not self.failures,'days':monthly.DAYS,'trackingSince':start.isoformat()}

"""Thirty Istanbul calendar days, including today. Independent of the Canva subscription epoch."""
import datetime as dt
from collections import Counter

IST = dt.timezone(dt.timedelta(hours=3))
DAYS = 30

def now():
    return dt.datetime.now(dt.timezone.utc)

def since(end=None):
    local=(end or now()).astimezone(IST)
    return dt.datetime.combine(local.date()-dt.timedelta(days=DAYS-1),dt.time.min,IST)

def moment(value, local=False):
    if not isinstance(value,str):return None
    try:stamp=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
    except ValueError:return None
    if stamp.tzinfo is None:return stamp.replace(tzinfo=IST) if local else None
    return stamp

def in_range(value,start,end,local=False):
    stamp=moment(value,local)
    return stamp is not None and start<=stamp<=end

def scope(raw,start,end):
    """Reconstruct just the eligible identities from a dated ERP read while offline."""
    def latest(row,*fields):
        stamps=[moment(row.get(f),True) for f in fields]
        return max((s for s in stamps if s and start<=s<=end),default=None)
    moves=[r for r in raw.get('movements',[]) if latest(r,'InsertedAt','UpdatedAt','DeletedAt')]
    changed_serials={r['SerialCardId'] for r in moves}
    serials=[]; counts=Counter()
    for r in raw.get('serials',[]):
        counts[r['SampleRecId']]+=1
        if r['SerialCardId'] in changed_serials or latest(r,'SerialCreatedAt','SerialUpdatedAt'):
            printed=latest(r,'SerialCreatedAt')
            serials.append({**r,'SerialCreatedAt':r.get('SerialCreatedAt') if printed else None,'EarlierBarcode':not printed})
    vouchers=[{**r,'TotalBarcodeCount':r.get('TotalBarcodeCount',counts[r['SampleRecId']])} for r in raw.get('vouchers',[])
              if latest(r,'ScopeChangedAt','HeaderInsertedAt','HeaderUpdatedAt','LineInsertedAt','LineUpdatedAt','ConfirmedTransferInsertedAt')]
    samples={s['SampleRecId'] for s in serials+vouchers}
    items={}
    source={i['RecId']:i for i in raw.get('items',[])}
    for i in source.values():
        stamp=latest(i,'InsertedAt','UpdatedAt','SampleStatusAt','ItemChangeAt','PhotoChangeAt')
        if stamp and (i.get('InventoryType')==100 or i.get('InventoryType')==99 and i.get('IsSample')):
            items[i['RecId']]={**i,'ItemChangeAt':stamp.isoformat()}
            if i.get('InventoryType')==99:samples.add(i['RecId'])
    for ident in samples:
        item=source.get(ident)
        if item:
            items.setdefault(ident,{**item,'ItemChangeAt':None})
            parent=source.get(item.get('MainStyleCardId'))
            if parent:items.setdefault(parent['RecId'],{**parent,'ItemChangeAt':None})
    return {**raw,'items':list(items.values()),'serials':serials,'movements':moves,'vouchers':vouchers,
            'routes':[r for r in raw.get('routes',[]) if r['SampleRecId'] in samples]}

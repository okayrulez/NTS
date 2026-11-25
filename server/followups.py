"""Shared sample follow-up, keyed by the immutable sample/barcode identity."""
import datetime as dt
import json
import re


DEFAULTS = {'userOwner': '', 'targetDate': '', 'userNote': '', 'approval': 'pending'}


class Conflict(Exception):
    def __init__(self, row):
        self.row = row


def checked(values):
    if not isinstance(values, dict) or values.keys() - DEFAULTS.keys():
        raise ValueError('Geçersiz takip alanı.')
    for key, value in values.items():
        if not isinstance(value, str) or len(value) > {'userOwner':100,'targetDate':10,'userNote':5000,'approval':8}[key]:
            raise ValueError('Alan uzunluğunu kontrol et.')
        if key == 'targetDate' and value and dt.date.fromisoformat(value).isoformat() != value:
            raise ValueError('Geçersiz hedef tarihi.')
        if key == 'approval' and value not in ('pending','approved','revise'):
            raise ValueError('Geçersiz onay durumu.')
    return values


def read_row(db, ident):
    if not isinstance(ident, str) or not re.fullmatch(r'erp-(?:bc-\d+-\d+|sample-\d+)|canva-[\w.-]{1,180}', ident):
        raise ValueError('Geçersiz numune kimliği.')
    payload = db.execute('SELECT payload FROM followups WHERE id=?', (ident,)).fetchone()
    return json.loads(payload[0]) if payload else dict(id=ident, **DEFAULTS, versions={}, history=[], version=0)


def persist(db,row):
    db.execute('INSERT OR REPLACE INTO followups VALUES (?,?)',(row['id'],json.dumps(row,ensure_ascii=False)))


def record(row, changes):
    row['version'] += 1
    row['history'].append({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'changes':changes,
                           'before':{k:row[k] for k in changes}})
    row.update(changes)
    row['versions'].update(dict.fromkeys(changes,row['version']))


def save(db,data):
    db.execute('BEGIN IMMEDIATE')
    row = read_row(db,data['id'])
    changes = {k:v for k,v in checked(data['changes']).items() if row[k]!=v}
    baseline = data.get('versions')
    if not isinstance(baseline,dict): raise ValueError('Kart sürümü eksik.')
    if any(row['versions'].get(k,0)!=baseline.get(k,0) for k in changes):
        raise Conflict(row)
    if changes:
        record(row,changes)
        persist(db,row)
    return row


def merge(db,data):
    """Import old browsers/backups without resurrecting cleared fields or losing other revisions."""
    db.execute('BEGIN IMMEDIATE')
    row = read_row(db,data['id'])
    values = checked(data['values'])
    entries = data.get('history',[])
    if not isinstance(entries,list): raise ValueError('Geçersiz revizyon geçmişi.')
    known = {json.dumps(h,sort_keys=True,ensure_ascii=False) for h in row['history']}
    def add(entry):
        token=json.dumps(entry,sort_keys=True,ensure_ascii=False)
        if token not in known:
            row['history'].append(entry)
            known.add(token)
    for entry in entries:
        if not isinstance(entry,dict): raise ValueError('Geçersiz revizyon.')
        at=entry.get('at','')
        if not isinstance(at,str) or len(at)>45: raise ValueError('Geçersiz revizyon tarihi.')
        if 'changes' in entry:
            restored={'at':at,'changes':checked(entry['changes'])}
            if 'before' in entry:restored['before']=checked(entry['before'])
            add(restored)
        elif isinstance(entry.get('note'),str):
            add({'at':at,'note':entry['note'][:5500]})
    missing={k:v for k,v in values.items() if k not in row['versions']}
    if missing and data.get('fromBackup') is True and entries:
        row['version']+=1
        row.update(missing)
        row['versions'].update(dict.fromkeys(missing,row['version']))
        missing={}
    competing={k:v for k,v in values.items() if k not in missing and row[k]!=v}
    if competing:
        add({'at':'','changes':competing})
    if missing:
        record(row,missing)
    else:
        # Version orders snapshots, including history-only imports.
        previous=read_row(db,row['id'])
        if previous['history']!=row['history'] and previous['version']==row['version']:row['version']+=1
    if row['version']:persist(db,row)
    return row

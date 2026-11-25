"""Recent catalogue creations, joined to the current NTS ERP snapshot by card identity."""
import datetime as dt
import json
import os
import pathlib
import shutil
import subprocess
import threading
import time
from collections import defaultdict
import monthly


def key(value):
    value = str(value or '').strip()
    return value if value.isascii() and value.isdecimal() and int(value) > 0 else None


def match(products, records):
    samples, models = defaultdict(list), defaultdict(list)
    for row in records:
        erp = row.get('erp', {})
        if row.get('recordType') not in ('sample', 'barcode'):
            continue
        sample, main = key(erp.get('recId')), key(erp.get('mainRecId'))
        if sample:
            samples[sample].append(row)
        if main:
            models[main].append(row)
    result = []
    for p in products:
        style, main = key(p.get('styleId')), key(p.get('mainId'))
        if not style:
            continue
        rows = samples.get(style, [])
        parents = {key(r['erp'].get('mainRecId')) for r in rows} - {None}
        if len(parents) > 1 or (main and parents and main not in parents):
            level, rows = 'conflict', []
        elif rows:
            level = 'sample'
        else:
            rows = models.get(main, [])
            level = 'model' if rows else 'outside'
        result.append({**p, 'match': level, 'recordIds': [r['id'] for r in rows]})
    return result


def read_catalog(style_ids=None):
    script = pathlib.Path(__file__).with_name('universe-read.ps1')
    args = [shutil.which('pwsh') or 'powershell.exe','-NoProfile','-NonInteractive','-File',str(script)]
    if style_ids is not None:
        args.append('-Membership')
    proc = subprocess.run(args, input=json.dumps(style_ids) if style_ids is not None else None, capture_output=True, encoding='utf-8', timeout=58,
                          creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0), check=True)
    rows = json.loads(proc.stdout.lstrip('\ufeff'))
    if not isinstance(rows,list):
        raise ValueError('Invalid catalogue response')
    return rows


class Feed:
    def __init__(self, cache, reader=read_catalog):
        self.cache, self.reader = pathlib.Path(cache), reader
        self.lock = threading.Lock()
        self.next_read = 0
        self.available = False
        self.saved = {'readAt': None, 'products': []}
        try:
            saved = json.loads(self.cache.read_text('utf-8'))
            if saved.get('days')==monthly.DAYS and isinstance(saved['products'],list) and saved['readAt']:
                self.saved = saved
        except (OSError, ValueError, KeyError, TypeError):
            pass

    def get(self, records):
        with self.lock:
            if time.monotonic() >= self.next_read:
                try:
                    rows = self.reader()
                    self.saved = {'days':monthly.DAYS, 'readAt':dt.datetime.now(dt.timezone.utc).isoformat(), 'products':rows}
                    self.available = True
                    temp = self.cache.with_suffix('.tmp')
                    try:
                        temp.write_text(json.dumps(self.saved, ensure_ascii=False), 'utf-8')
                        os.replace(temp,self.cache)
                    except OSError:
                        pass
                except (OSError, ValueError, subprocess.SubprocessError):
                    self.available = False
                finally:
                    self.next_read = time.monotonic()+60
            saved, available = self.saved, self.available
        end=monthly.now();start=monthly.since(end)
        products=[p for p in saved['products'] if monthly.in_range(p.get('changedAt'),start,end)]
        return {'readAt':saved['readAt'], 'available':available, 'trackingSince':monthly.since().isoformat(),'days':monthly.DAYS,
                'products':match(products,records)}


class PendingCatalog:
    def __init__(self, reader=read_catalog):
        self.reader = reader
        self.lock = threading.Lock()
        self.ids = None
        self.next_read = 0
        self.members = None
        self.read_at = None

    def lookup(self, ids):
        with self.lock:
            if (ids,monthly.since()) != self.ids or time.monotonic() >= self.next_read:
                try:
                    members = defaultdict(set)
                    for row in self.reader(ids):
                        members[key(row['styleId'])].add(key(row.get('mainId')))
                    self.members = members
                    self.read_at = dt.datetime.now(dt.timezone.utc).isoformat()
                except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                    self.members = self.read_at = None
                self.ids, self.next_read = (ids,monthly.since()), time.monotonic()+60
            return self.members, self.read_at

    def get(self, records, followups):
        by_id = {r['id']:r for r in records if r.get('recordType') in ('sample','barcode')}
        parents = defaultdict(set)
        for row in by_id.values():
            erp = row.get('erp') or {}
            if key(erp.get('mainRecId')):
                parents[key(erp.get('recId'))].add(key(erp['mainRecId']))
        groups, unresolved = {}, []
        for ident, followup in followups.items():
            if followup.get('approval') != 'approved' or not ident.startswith(('erp-sample-', 'erp-bc-')):
                continue
            row = by_id.get(ident, {})
            style = key((row.get('erp') or {}).get('recId'))
            if not style:
                unresolved.append({'styleId':None, 'recordIds':[ident], 'state':'identity'})
                continue
            groups.setdefault(style, []).append(ident)
        ids = tuple(sorted(groups))
        members, read_at = self.lookup(ids) if ids else ({}, None)
        waiting, present = [], 0
        for style, row_ids in groups.items():
            item = {'styleId':style, 'recordIds':sorted(row_ids)}
            known = members.get(style, set()) if members is not None else set()
            if len((known - {None}) | parents[style]) > 1:
                unresolved.append({**item, 'state':'conflict'})
            elif members is None:
                unresolved.append({**item, 'state':'unavailable'})
            elif known:
                present += 1
            else:
                waiting.append(item)
        return {'trackingSince':monthly.since().isoformat(),'days':monthly.DAYS,'pending':waiting, 'unresolved':unresolved, 'catalogued':present,
                'approved':len(groups)+sum(r['state']=='identity' for r in unresolved),
                'readAt':read_at, 'available':members is not None}

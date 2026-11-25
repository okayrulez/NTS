"""Durable source-time boundary for this installation."""
import datetime as dt
import json
import pathlib
import sqlite3
from contextlib import closing

SINCE = json.loads(pathlib.Path(__file__).with_name('period.json').read_text('utf8'))['since']
START = dt.datetime.fromisoformat(SINCE.replace('Z','+00:00'))
PERIOD_ID = START.strftime('%Y%m%dT%H%M%S%fZ')


def source_time(metadata):
    values = [v for v in (metadata.get('created_at'),metadata.get('updated_at'))
              if type(v) in (float,int) and START.timestamp() < v <= dt.datetime.now(dt.timezone.utc).timestamp()]
    return max(values, default=None)


def active_stamp(stamp):
    return source_time({'updated_at':stamp}) is not None


def active_iso(stamp):
    if not isinstance(stamp,str):
        return False
    try:
        value=dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
        return value.tzinfo is not None and START < value <= dt.datetime.now(dt.timezone.utc)
    except ValueError:
        return False


def migrate_configuration(store, previous):
    """Carry local definitions and watch subscriptions once. Imported content stays in the former database."""
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('CREATE TABLE IF NOT EXISTS period_setup (id TEXT PRIMARY KEY)')
        if db.execute('SELECT 1 FROM period_setup WHERE id=?',(SINCE,)).fetchone():
            return
        if previous.is_file():
            with closing(sqlite3.connect(previous.resolve().as_uri()+'?mode=ro',uri=True)) as old:
                for ident,payload in old.execute('SELECT id,payload FROM sewing_groups'):
                    db.execute('INSERT OR IGNORE INTO sewing_groups VALUES (?,?)',(ident,payload))
                for ident,payload in old.execute('SELECT id,payload FROM collections'):
                    c=json.loads(payload)
                    if c.get('canvaDesignId') and not c.get('canvaWatch'):
                        continue
                    config={k:c[k] for k in ('id','name','brandId','branchId','status','designer','modelhouseManager','canvaAccount','canvaDesignId','canvaWatch') if k in c}
                    config['modelKeys']=[]
                    # Only comparison hashes can cross the boundary. Verify the version with Canva first.
                    if c.get('canvaDesignId') and type(c.get('canvaUpdatedAt')) in (int,float) and c['canvaUpdatedAt']<=START.timestamp():
                        hashes={s['id']:pathlib.PurePosixPath(s['photo']).stem.rsplit('-',1)[-1]
                                for s in c.get('canvaSlides',[]) if s.get('id') and s.get('photo')}
                        if hashes:config['canvaBaselineCandidate']={'version':c['canvaUpdatedAt'],'hashes':hashes}
                    db.execute('INSERT OR IGNORE INTO collections VALUES (?,?)',(ident,json.dumps(config)))
        db.execute('INSERT INTO period_setup VALUES (?)',(SINCE,))


def visible_state(state):
    state['collections']=[c for c in state['collections'] if not c.get('canvaDesignId') or active_stamp(c.get('canvaSourceAt'))]
    designs={c['canvaDesignId'] for c in state['collections'] if c.get('canvaDesignId')}
    state['models']=[m for m in state['models'] if m.get('canvaDesignId') in designs and active_stamp(m.get('canvaSourceAt'))]
    for collection in state['collections']:
        collection.pop('canvaBaselineCandidate',None)
    return state

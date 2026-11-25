import concurrent.futures
import http.client
import http.server
import json
import pathlib
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
import server
from process_rules import select_stage
from v2_store import Store


class TeamApiTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.db=pathlib.Path(temp.name)/'state.sqlite3'
        swap=patch.object(server,'STORE',Store(self.db))
        swap.start()
        self.addCleanup(swap.stop)
        self.http=http.server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=self.http.serve_forever,daemon=True).start()
        self.addCleanup(self.http.server_close)
        self.addCleanup(self.http.shutdown)

    def request(self,path,data=None):
        conn=http.client.HTTPConnection(*self.http.server_address,timeout=5)
        try:
            conn.request('GET' if data is None else 'POST',path,
                         body=json.dumps({**data,"trackingSince":server.period.SINCE}) if data is not None else None,
                         headers={'Content-Type':'application/json'})
            reply=conn.getresponse()
            return reply.status,json.load(reply)
        finally:
            conn.close()

    def test_independent_clients_concurrency_retries_and_clear(self):
        key='erp-bc-1-2'
        def save(changes,versions=None):
            return self.request('/api/followups',dict(id=key,changes=changes,versions=versions or {}))
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            replies=list(pool.map(save,[{'userOwner':'Elif'},{'targetDate':'2026-11-23'}]))
        self.assertEqual([status for status,_ in replies],[200,200])
        _,state=self.request('/api/state')
        row=state['followups'][key]
        self.assertEqual((row['userOwner'],row['targetDate']),('Elif','2026-11-23'))
        self.assertEqual(save({'userOwner':'Başka kişi','userNote':'Kaydedilmemeli'})[0],409)
        self.assertEqual(save({'userOwner':'Elif'})[1]['version'],row['version'])
        self.assertEqual(save({'userOwner':''},row['versions'])[0],200)
        stale=dict(id=key,values={'userOwner':'Eski kişi'},history=[{'at':'','note':'Eski revizyon'}])
        first=self.request('/api/followups/import',stale)[1]
        self.assertEqual(first,self.request('/api/followups/import',stale)[1])
        self.assertEqual(first['userOwner'],'')
        self.assertTrue(any(h.get('changes',{}).get('userOwner')=='Eski kişi' for h in first['history']))
        self.assertEqual(Store(self.db).state()['followups'][key],first)
        self.assertEqual(save({'targetDate':'2026-02-30'})[0],400)


class StageEntryTests(unittest.TestCase):
    def test_repeat_exit_reentry_and_uncertain_history(self):
        def scan(n,day,kind):
            return dict(MovementId=n,EventAt=f'2026-11-{day:02}T12:30:00',ProcessName='Dikim',InOut=kind)
        def entry(events):
            latest=select_stage({}, {},events,[],{'selected':None})[3]
            return (latest or {}).get('entry')
        events=[scan(1,10,0),scan(2,11,0)]
        self.assertEqual(entry(events)['id'],1)
        events.extend([scan(3,12,1),scan(4,14,0),scan(5,15,0)])
        self.assertEqual(entry(events)['id'],4)
        self.assertIsNone(entry([scan(1,10,1),scan(2,10,0),scan(3,11,0)]))
        self.assertIsNone(entry([dict(scan(1,10,1),EventAt=None)]))
        cut=dict(scan(1,10,100),ProcessName='Kesim')
        self.assertNotIn('entry',select_stage({}, {},[cut],[],{'selected':False,'choice':'none'})[3])
        receipt=dict(ReceiptType=132,ReceiptItemId=55,LinkLevel='barcode',EventAt='2026-11-18T13:20:00')
        self.assertEqual(select_stage({}, {},events,[receipt],{'selected':None})[3]['entry']['source'],'receipt')

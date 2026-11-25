import pathlib
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'server'))
from universe_feed import Feed, PendingCatalog, match


class CatalogTests(unittest.TestCase):
    def test_identity_level_and_distinct_barcodes(self):
        def record(i, sample, main):
            return {'id': i, 'recordType': 'barcode', 'erp': {'recId': sample, 'mainRecId': main}}
        def product(style, main):
            return {'styleId': style, 'mainId': main, 'name': 'Aynı isim'}
        rows = [record('v1', 10, 1), record('v2', 10, 1), record('other', 12, 1)]
        products = [product('10','1'), product('11','1'), product('10','2'),
                    product('13','7'), product(None,'1')]
        found = match(products, rows)
        self.assertEqual([p['match'] for p in found], ['sample','model','conflict','outside'])
        self.assertEqual(found[0]['recordIds'], ['v1','v2'])
        self.assertEqual(found[1]['recordIds'], ['v1','v2','other'])
        self.assertEqual(found[2]['recordIds'], [])
        self.assertEqual(found[3]['recordIds'], [])

    def test_concurrent_refresh_offline_recovery_and_empty_catalog(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = pathlib.Path(directory) / 'catalog.json'
            calls = []
            def read():
                calls.append(True)
                from datetime import datetime,timezone
                return [{'styleId':'10', 'mainId':'1','changedAt':datetime.now(timezone.utc).isoformat()}]
            feed = Feed(cache, read)
            with ThreadPoolExecutor(max_workers=4) as pool:
                responses = list(pool.map(feed.get, [[],[],[],[]]))
            self.assertEqual(len(calls), 1)
            self.assertTrue(all(r['available'] for r in responses))
            def offline():
                raise OSError()
            restored = Feed(cache, offline)
            stale = restored.get([])
            self.assertFalse(stale['available'])
            self.assertEqual(stale['readAt'], responses[0]['readAt'])
            self.assertEqual(stale['products'], responses[0]['products'])
            empty = Feed(cache, lambda: []).get([])
            self.assertEqual(empty['products'], [])
            self.assertTrue(empty['available'])


class PendingTests(unittest.TestCase):
    def test_only_shared_approved_cards_and_exact_historical_membership(self):
        rows=[{'id':'erp-bc-'+i+'-1','recordType':'barcode','erp':{'recId':v,'mainRecId':'20'}}
              for i,v in [('1','10'),('2','10'),('3','11'),('4','12'),('5','13')]]
        approvals={r['id']:{'approval':'approved'} for r in rows}
        approvals['erp-bc-5-1']['approval']='revise'
        approvals['erp-sample-404']={'approval':'approved'}
        approvals['canva-only']={'approval':'approved'}
        catalog=[{'styleId':'10','mainId':'20'},{'styleId':'12','mainId':'21'}]
        calls=[]
        def read(ids):
            calls.append(ids)
            return catalog
        queue=PendingCatalog(read)
        state=queue.get(rows,approvals)
        self.assertEqual(state['approved'],4)
        self.assertEqual(state['catalogued'],1)
        self.assertEqual(state['pending'],[{'styleId':'11','recordIds':['erp-bc-3-1']}])
        self.assertEqual({r['state'] for r in state['unresolved']},{'identity','conflict'})
        self.assertEqual(calls,[('10','11','12')])
        catalog.append({'styleId':'11','mainId':'20'})
        queue.next_read=0
        self.assertEqual(queue.get(rows,approvals)['pending'],[])
        approvals['erp-bc-3-1']['approval']='revise'
        self.assertEqual(queue.get(rows,approvals)['catalogued'],1)

    def test_unavailable_is_not_absence_and_no_approval_does_not_query(self):
        def offline(ids):
            raise OSError()
        q=PendingCatalog(offline)
        r={'id':'erp-sample-8','recordType':'sample','erp':{'recId':8}}
        state=q.get([r],{r['id']:{'approval':'approved'}})
        self.assertFalse(state['available'])
        self.assertEqual(state['pending'],[])
        self.assertEqual(state['unresolved'][0]['state'],'unavailable')
        self.assertEqual(q.get([r],{})['approved'],0)

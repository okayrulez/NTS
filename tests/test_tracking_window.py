import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
import canva_sync
import period
import monthly
from universe_feed import Feed
from v2_store import Store
from v2_projection import build_v2_records

BEFORE=period.START-dt.timedelta(seconds=1)
AFTER=period.START+dt.timedelta(microseconds=1)

class TrackingWindowTests(unittest.TestCase):
    def test_catalog_filters_source_dates_and_rejects_legacy_cache(self):
        with tempfile.TemporaryDirectory() as d:
            cache=pathlib.Path(d)/'feed.json'
            cache.write_text(json.dumps({'readAt':dt.datetime.now(dt.timezone.utc).isoformat(),'products':[{'styleId':'80'}]}))
            def unavailable():raise OSError()
            self.assertEqual(Feed(cache,unavailable).get([])['products'],[])
            start=monthly.since()
            dates=[start-dt.timedelta(microseconds=1),start,start+dt.timedelta(seconds=1),monthly.now()+dt.timedelta(days=2)]
            result=Feed(cache,lambda:[{'styleId':str(i+1),'changedAt':t.isoformat()} for i,t in enumerate(dates)]).get([])
            self.assertEqual([p['styleId'] for p in result['products']],['2','3'])
            self.assertEqual(result['trackingSince'],start.isoformat())
            self.assertEqual(Feed(cache,unavailable).get([])['products'],result['products'])

    def test_canva_pagination_stops_before_old_content_and_forced_sync_is_gated(self):
        old=int(BEFORE.timestamp());recent=int(period.START.timestamp())+1
        pages=[{'items':[{'id':'DNEW001','created_at':old,'updated_at':recent}],'continuation':'next'},
               {'items':[{'id':'DOLD001','updated_at':old}],'continuation':'older'}]
        with patch.object(canva_sync,'api',side_effect=pages) as api:
            self.assertEqual([d['id'] for d in canva_sync.list_designs()],['DNEW001'])
            self.assertEqual(api.call_count,2)
        with patch.object(canva_sync,'api',return_value={'design':{'created_at':old,'updated_at':old}}) as api:
            with self.assertRaises(canva_sync.CanvaError):
                canva_sync.sync_collection(None,{'canvaDesignId':'DOLD001'},None,None,[],True)
            self.assertEqual(api.call_count,1)

    def test_slide_level_no_backfill_even_on_reorder_and_first_observation(self):
        current,eligible=canva_sync.slide_window({},False)
        self.assertFalse(eligible('page-a','unchanged'))
        self.assertFalse(eligible('page-b','old'))
        next_version,eligible=canva_sync.slide_window({'canvaFingerprints':current},False)
        self.assertFalse(eligible('page-a','unchanged'))
        self.assertTrue(eligible('page-b','edited'))
        self.assertTrue(eligible('page-c','new'))
        _,eligible=canva_sync.slide_window({'canvaFingerprints':{'number-1':'old','number-2':'older'}},False)
        self.assertFalse(eligible('number-3','older'))
        self.assertTrue(eligible('number-1','addition'))
        _,eligible=canva_sync.slide_window({},True)
        self.assertTrue(eligible('page-a','new'))

    def test_legacy_store_and_new_main_cards(self):
        with tempfile.TemporaryDirectory() as d:
            d=pathlib.Path(d);old=Store(d/'old.db');new=Store(d/'new.db')
            old.put_collection({'id':'deck','name':'Watched','canvaDesignId':'DOLD001','canvaWatch':True,'modelKeys':['old'],'canvaSlides':[{'id':'p'}]})
            old.put_models([{'id':'old','canvaDesignId':'DOLD001'}])
            period.migrate_configuration(new,old.path)
            self.assertEqual(period.visible_state(new.state())['collections'],[])
            self.assertEqual(new.state()['models'],[])
            self.assertTrue(new.state()['collections'][0]['canvaWatch'])
        raw={'items':[{'RecId':8,'InventoryType':100,'ItemChangeAt':AFTER.isoformat(),'InventoryCode':'NEW'},{'RecId':9,'InventoryType':100}]}
        cards,analysis=build_v2_records(raw,[],lambda _:False)
        self.assertEqual(cards,[])
        self.assertEqual([m['id'] for m in analysis['mainModels']],[8])

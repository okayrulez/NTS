import datetime as dt
import io
import pathlib,sys,tempfile,unittest
from unittest.mock import patch
from urllib.error import HTTPError
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
import monthly
from uff_feed import UffFeed,read_brand

class MonthlyTests(unittest.TestCase):
 def test_offline_scope_preserves_identity_and_stock_ambiguity(self):
  end=dt.datetime(2026,11,22,10,tzinfo=monthly.IST);start=monthly.since(end)
  self.assertEqual(start.date(),dt.date(2026,10,24))
  old='2026-10-23T23:59:59';new='2026-10-24T00:00:00'
  serials=[dict(SerialCardId=i,SampleRecId=1,SerialCreatedAt=old) for i in (1,2)]
  raw={'items':[dict(RecId=1,InventoryType=99,IsSample=True,MainStyleCardId=3,UpdatedAt=old),dict(RecId=3,InventoryType=100),dict(RecId=4,InventoryType=100,UpdatedAt=new)],
       'serials':serials,'movements':[dict(SerialCardId=1,InsertedAt=new),dict(SerialCardId=2,InsertedAt=old)],
       'vouchers':[dict(SampleRecId=1,ConfirmedTransferInsertedAt=new)]}
  result=monthly.scope(raw,start,end)
  self.assertEqual([s['SerialCardId'] for s in result['serials']],[1])
  self.assertTrue(result['serials'][0]['EarlierBarcode'])
  self.assertEqual(result['vouchers'][0]['TotalBarcodeCount'],2)
  self.assertEqual({i['RecId'] for i in result['items']},{1,3,4})
 def test_uff_pages_use_filtered_source_and_real_creation_time(self):
  end=monthly.now();start=monthly.since(end)
  def read(brand,query):
   self.assertEqual(query['uniteks_only'],'1');self.assertEqual(query['from_date'],start.astimezone(dt.timezone.utc).date().isoformat())
   n=query['page'];self.assertLessEqual(n,2)
   return {'page':n,'totalPages':2,'data':[{'id':n,'created_at':(start if n==2 else start-dt.timedelta(seconds=1)).isoformat(),'display_reference':'DEMO/611'}]}
  with patch('uff_feed.ZARA_SUPPLIER_CODES',{'DEMO'}):
   out=read_brand('zara',start,end,read)
  self.assertEqual([(r['id'],r['evidence']) for r in out],[('2','Zara tedarikçi kodu')])
 def test_uff_date_filters_cover_full_istanbul_window(self):
  end=dt.datetime(2026,11,23,10,30,tzinfo=monthly.IST)
  start=monthly.since(end)
  def page(brand,query):
   self.assertEqual(query['created_after'],'2026-10-24')
   self.assertEqual(query['created_before'],'2026-11-24')
   self.assertEqual(query['from_date'],'2026-10-24')
   self.assertEqual(query['to_date'],'2026-11-23')
   return {'page':1,'totalPages':1,'data':[
    {'id':'first','created_at':start.isoformat()},
    {'id':'today','created_at':(end-dt.timedelta(minutes=1)).isoformat()},
    {'id':'future','created_at':(end+dt.timedelta(seconds=1)).isoformat()},
   ]}
  self.assertEqual([p['id'] for p in read_brand('zara',start,end,page)],['first','today'])
 def test_uff_reports_database_capacity_errors(self):
  def capacity(*args):
   raise HTTPError('',500,'server error',None,io.BytesIO(b'{"details":"sorry, too many clients already"}'))
  with tempfile.TemporaryDirectory() as d:
   result=UffFeed(pathlib.Path(d)/'cache.json',capacity).get()
   self.assertFalse(result['available'])
   self.assertTrue(all(s['status']=='capacity' for s in result['sources']))
 def test_uff_partial_and_revoked_access(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'cache.json'
   def read(b,start,end):
    if b!='hm':raise OSError()
    return [{'id':'p','brand':'H&M','addedAt':end.isoformat()}]
   feed=UffFeed(path,read);self.assertFalse(feed.get()['available'])
   def offline(*args):raise OSError()
   self.assertTrue(UffFeed(path,offline).get()['products'][0]['cached'])
   def denied(*args):raise HTTPError('',403,'denied',None,None)
   result=UffFeed(path,denied).get()
   self.assertFalse(result['products']);self.assertTrue(all(s['status']=='auth' for s in result['sources']))

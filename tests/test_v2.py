import unittest,sys,pathlib,tempfile,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'server'));sys.path.insert(0,str(ROOT/'tests'))
from test_barcode_tracking import serial,event
from v2_projection import build_v2_records
from v2_store import Store
import canva_sync as C

class V2Tests(unittest.TestCase):
 def rows(self,pattern='',events=None,serials=None,items=None):
  s=serial();s['PatternNo']=pattern
  return build_v2_records({'serials':serials if serials is not None else [s],'movements':events or [],'items':items or []},[],lambda _:False)[0]
 def test_barcode_card_means_cutting_by_approved_rule(self):
  r=self.rows()[0];self.assertEqual(r['erp']['stage'],'cutting_in');self.assertIn('Barkod kartı',r['erp']['reason'])
 def test_pattern_number_means_pattern_done(self):self.assertEqual(self.rows('KP123',serials=[{**serial(),'Barcode':'','PatternNo':'KP123'}])[0]['erp']['stage'],'pattern_done')
 def test_movement_precedes_filled_pattern(self):self.assertEqual(self.rows('KP123',[event(1,0,'2026-11-16T10:00:00')])[0]['erp']['stage'],'sewing')
 def test_conflict_and_missing_time_stay_review(self):
  self.assertEqual(self.rows('KP',[event(1,0,None)])[0]['erp']['issue'],'missing_time')
  self.assertEqual(self.rows('KP',[event(1,0,'2026-11-17T10:00:00'),event(2,1,'2026-11-17T10:00:00')])[0]['erp']['issue'],'conflicting_time')
 def test_unknown_operation_not_claimed_as_pattern_complete(self):self.assertEqual(self.rows('KP',[event(1,0,'2026-11-17T10:00:00','Bilinmeyen')])[0]['erp']['issue'],'unknown_operation')
 def test_employee_and_creator_remain_distinct(self):
  e=event(1,0,'2026-11-17T10:00:00');e.update(EmployeeDisplayName='Modelhane Grup 1',CreatedByName='Kullanıcı A')
  r=self.rows('KP',[e])[0];m=r['erp']['milestones']['sewing'];self.assertEqual(m['employeeName'],'Modelhane Grup 1');self.assertEqual(m['createdByName'],'Kullanıcı A')
 def test_unbarcoded_true_sample_included_and_deduped_after_barcode(self):
  item=dict(RecId=91,InventoryType=99,IsSample=True,InventoryName='UWM-6118',InventoryCode='DSG55802-001',MainStyleCardId=10,PatternNo='KP')
  rows=self.rows(serials=[],items=[item,{**item,'RecId':92,'InventoryType':6}]);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['id'],'erp-sample-91')
  self.assertEqual(len(self.rows(items=[item])),1)
 def test_model_key_groups_versions_without_merging_barcodes(self):
  rows=self.rows(serials=[serial(1,1),serial(2,2)]);self.assertEqual(len({r['modelKey'] for r in rows}),1);self.assertEqual(len({r['id'] for r in rows}),2)
 def test_store_collection_members_deduplicate_and_manual_link_persists(self):
  with tempfile.TemporaryDirectory() as temp:
   db=Store(pathlib.Path(temp)/'v2.db');c=db.put_collection({'name':'K','modelKeys':['erp-model:1','erp-model:1']});self.assertEqual(len(c['modelKeys']),1)
   db.put_models([{'id':'canva-test'}]);self.assertTrue(db.link_model('canva-test','erp-model:1')['manualLink']);self.assertEqual(Store(pathlib.Path(temp)/'v2.db').state()['collections'][0]['name'],'K')
 def test_canva_only_accepts_valid_design_urls(self):
  self.assertEqual(C.design_id('https://www.canva.com/design/DExample001/view'),'DExample001')
  for url in ['https://evil.example/design/DExample001','../../private','http://canva.com.evil.test/design/DExample001']:
   with self.assertRaises(ValueError):C.design_id(url)
 def test_canva_duplicate_code_is_ambiguous_and_decorative_x_not_model(self):
  import pymupdf
  with tempfile.TemporaryDirectory() as temp:
   d=pymupdf.open();p=d.new_page();p.insert_text((20,40),'Model Kodu: ABC123');content=d.tobytes()
   rows=C.parse_pdf(content,'DExample001',1,pathlib.Path(temp),{'erp-model:1':{'ABC123'},'erp-model:2':{'ABC123'}});self.assertIsNone(rows[0]['erpModelKey'])
   rows=C.parse_pdf(content,'DExample001',1,pathlib.Path(temp),{'erp-model:1':{'ABC123'}});self.assertEqual(rows[0]['erpModelKey'],'erp-model:1')
   d=pymupdf.open();d.new_page().insert_text((20,40),'X');self.assertEqual(C.parse_pdf(d.tobytes(),'DExample001',1,pathlib.Path(temp),{}),[])
 def test_delta_add_update_remove_and_unchanged(self):
  import server as S
  S.versions.clear();a=S.install_snapshot([{'id':'1','v':1},{'id':'2','v':2}],{},[])
  S.install_snapshot([{'id':'1','v':3},{'id':'3','v':1}],{},[]);d=S.delta(a['revision']);self.assertEqual({r['id'] for r in d['updated']},{'1','3'});self.assertEqual(d['removed'],['2'])
  self.assertEqual(S.delta(S.current()['revision'])['updated'],[]);self.assertTrue(S.delta('old')['full'])
if __name__=='__main__':unittest.main()

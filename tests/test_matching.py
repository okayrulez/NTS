import unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
import matching
class MatchingTests(unittest.TestCase):
 def test_bpr_spaces_match_compact_erp_name(self):
  self.assertEqual(len(matching.candidates({'model':'BPR 616 B'},[{'InventoryName':'BPR616B','InventoryCode':'DSG54521'}])),1)
 def test_numeric_article_is_matched_with_a_token_boundary(self):
  rows=[{'InventoryName':'2273458 Fashion hoody dogs brushback','InventoryCode':'C&A05364'},{'InventoryName':'22734589 other','InventoryCode':'x'}]
  self.assertEqual(len(matching.candidates({'model':'2273458 DOG PRINT HOODY'},rows)),1)
 def test_multiple_revisions_inhibit_automatic_stage(self):
  items=[{'RecId':1,'InventoryName':'BO4059','InventoryCode':'D1','InventoryType':100}, {'RecId':2,'InventoryName':'BO4059','InventoryCode':'D1-1','InventoryType':99,'StyleSampleTypeId':32,'StyleSampleRevisionNo':1},{'RecId':3,'InventoryName':'BO4059','InventoryCode':'D1-2','InventoryType':99,'StyleSampleTypeId':32,'StyleSampleRevisionNo':2}]
  tasks=[{'RecId':1,'InventoryId':1,'StyleSampleTypeId':32,'ActivityName':'P19-Dikim','TranStatus':3}]
  result=matching.build_matches([{'id':'r','model':'BO4059','sample':'Collection sample - 1'}],items,tasks,lambda _:False)['r']
  self.assertIsNone(result['liveStatus']);self.assertIn('revizyon',result['matchNote'])
 def test_exact_model_precedes_alias(self):
  row={'model':'5584-400(UMC-SP-1390)','sample':'FIT'}
  matches=matching.candidates(row,[{'InventoryName':'UMC-SP-1390','InventoryCode':'x'},{'InventoryName':row['model'],'InventoryCode':'y'}])
  self.assertEqual(len(matches),1);self.assertEqual(matches[0]['InventoryCode'],'y')
 def test_sewing_study_does_not_mean_sewing(self):
  self.assertIsNone(matching.stage_for_activity('P02-Dikim Etüt'))
 def test_planned_sewing_does_not_move_card(self):
  self.assertIsNone(matching.live_status([{'ActivityName':'P19-Dikim','TranStatus':2,'RecId':1}]))
 def test_started_sewing_moves_card(self):
  self.assertEqual(matching.live_status([{'ActivityName':'P19-Dikim','TranStatus':3,'RecId':1}]),'ERP · dikimde')
 def test_parallel_stages_are_not_forced_into_one(self):
  self.assertIsNone(matching.live_status([{'ActivityName':'P19-Dikim','TranStatus':3,'RecId':1},{'ActivityName':'P11-Kesim','TranStatus':3,'RecId':2}]))
 def test_old_shipping_does_not_override_new_work(self):
  self.assertIsNone(matching.live_status([{'ActivityName':'P25-Numune Gönderim','TranStatus':4,'RecId':1},{'ActivityName':'P11-Kesim','TranStatus':2,'RecId':2}]))
if __name__=='__main__':unittest.main()

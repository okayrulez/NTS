import unittest,sys,pathlib,tempfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
from process_rules import select_stage,intermediate
from v2_store import Store
T1='2026-11-17T09:00:00';T2='2026-11-17T10:00:00';T3='2026-11-17T11:00:00'
def event(ident,kind,when=T1,process='Dikim',**extra):return dict(MovementId=ident,InOut=kind,EventAt=when,ProcessName=process,**extra)
def plan(value):return {'selected':value}
def voucher(kind,when=T2,**extra):return {**dict(ReceiptItemId=20,ReceiptType=kind,EventAt=when,LinkLevel='sample'),**extra}
class ProcessTests(unittest.TestCase):
 def test_pattern_without_barcode(self):
  self.assertEqual(select_stage(None,{'PatternNo':''},[],[],plan(None))[0],'pattern')
  self.assertEqual(select_stage(None,{'PatternNo':'P1'},[],[],plan(None))[0],'pattern_done')
 def test_barcode_print_proxy_has_explicit_reason(self):
  stage,reason,_,e=select_stage({'Barcode':'00001','SerialCreatedAt':T1},{},[],[],plan(None));self.assertEqual(stage,'cutting_in');self.assertIn('Ayrı baskı',reason);self.assertEqual(e['source'],'barcode-card')
 def test_cut_exit_routes_by_actual_selection(self):
  cut=[event(1,100,process='Kesim')]
  self.assertEqual(select_stage({}, {},cut,[],plan(True))[0],'external')
  self.assertEqual(select_stage({}, {},[event(2,0,process='Parça Baskı (Placement Print)',ProcessId=4)],[],plan(None))[0],'external')
  self.assertEqual(select_stage({}, {},cut,[],plan(False))[0],'queue')
  self.assertEqual(select_stage({}, {},cut,[],plan(None))[2],'intermediate_unknown');self.assertEqual(select_stage({}, {},cut,[],plan(None))[0],'intermediate_review')
 def test_sewing_and_return_mean_in_progress_and_quality(self):
  self.assertEqual(select_stage({}, {},[event(1,0)],[],plan(True))[0],'sewing')
  self.assertEqual(select_stage({}, {},[event(1,1)],[],plan(True))[0],'quality')
 def test_deletion_reveals_previous_evidence(self):
  rows=[event(1,0),event(2,1,T2,IsDeleted=True)];self.assertEqual(select_stage({}, {},rows,[],plan(None))[0],'sewing')
 def test_unknown_process_and_missing_timestamp_need_review(self):
  self.assertEqual(select_stage({}, {},[event(1,0,process='Bilinmeyen')],[],plan(None))[2],'unknown_operation')
  self.assertEqual(select_stage({}, {},[event(1,1,None)],[],plan(None))[2],'missing_time')
 def test_conflicting_latest_stage_needs_review(self):
  self.assertEqual(select_stage({}, {},[event(1,0),event(2,1)],[],plan(None))[2],'conflicting_time')
 def test_receipts_and_later_resewing_follow_chronology(self):
  self.assertEqual(select_stage({}, {},[event(1,1)],[voucher(135)],plan(None))[0],'warehouse')
  self.assertEqual(select_stage({}, {},[event(1,1)],[voucher(132)],plan(None))[0],'shipping')
  self.assertEqual(select_stage({}, {},[event(1,0,T3)],[voucher(132)],plan(None))[0],'sewing')
 def test_deleted_cancelled_unlinked_receipts_cannot_move(self):
  for override in [dict(IsDeleted=True),dict(IsCancelled=True),dict(Reversed=True),dict(LinkLevel='main-model')]:
   self.assertEqual(select_stage({}, {},[event(1,1)],[voucher(132,**override)],plan(None))[0],'quality')
 def test_plan_route_vs_blank_unknown_and_local_override(self):
  self.assertIsNone(intermediate({})['selected'])
  self.assertTrue(intermediate({'routePlan':{'IntermediatePlanState':'selected-planned','PlannedPrint':1}})['selected'])
  self.assertFalse(intermediate({'routePlan':{'IntermediatePlanState':'selected-planned','PlannedPrint':0,'PlannedEmbroidery':0}})['selected'])
  self.assertFalse(intermediate({},dict(intermediate='none'))['selected'])
 def test_local_definitions_persist_without_touching_erp(self):
  with tempfile.TemporaryDirectory() as temp:
   store=Store(pathlib.Path(temp)/'v2.db');store.put_group(dict(name='Teyit edilen grup',manager='Sorumlu',active=True));store.put_process_setting(dict(sampleRecId=123,intermediate='both'))
   self.assertEqual(store.state()['processSettings'][0]['sampleRecId'],123);self.assertEqual(store.state()['groups'][0]['name'],'Teyit edilen grup')
   with self.assertRaises(ValueError):store.put_process_setting(dict(sampleRecId=123,intermediate='random'))
class VoucherTests(unittest.TestCase):
 def source(self,**extra):return {**dict(ReceiptId=1,ReceiptItemId=2,ReceiptType=135,SampleRecId=91,LinkLevel='sample',Quantity=0,InWarehouseId=80,ConfirmedTransferQuantity=2,ConfirmedTransferAt=T2),**extra}
 def test_zero_source_quantity_can_have_real_counterpart(self):
  from voucher_rules import normalize_vouchers
  v=normalize_vouchers([self.source()],[dict(SerialCardId=1,SampleRecId=91)])[0]
  self.assertTrue(v['AutomaticEligible']);self.assertEqual(v['EventAt'],T2)
 def test_sample_receipt_never_moves_every_barcode(self):
  from voucher_rules import normalize_vouchers
  v=normalize_vouchers([self.source()],[dict(SerialCardId=1,SampleRecId=91),dict(SerialCardId=2,SampleRecId=91)])[0]
  self.assertFalse(v['AutomaticEligible']);self.assertIn('fiziksel barkod',v['PendingReason'])
  self.assertEqual(select_stage({}, {},[event(1,1)],[v],plan(None))[0],'quality')
 def test_wrong_depot_and_no_arrival_not_automatic(self):
  from voucher_rules import normalize_vouchers
  for source in [self.source(InWarehouseId=345),self.source(ConfirmedTransferQuantity=0)]:
   self.assertFalse(normalize_vouchers([source],[])[0]['AutomaticEligible'])
 def test_cancel_return_or_negative_receipt_keeps_prior_stage(self):
  from voucher_rules import normalize_vouchers
  for extra in [dict(HeaderIsCancelled=1),dict(LineHasNegativeEffect=1),dict(ReturnedQuantity=1),dict(ReturnReceiptItemId=99)]:
   self.assertFalse(normalize_vouchers([self.source(**extra)],[])[0]['AutomaticEligible'])

if __name__=='__main__':unittest.main()

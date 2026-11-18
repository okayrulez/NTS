import unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'server'))
import barcode_tracking as B

def serial(id=1,version=1):
 return dict(SerialCardId=id,Barcode='0000'+str(id),SampleRecId=90+version,Version=version,ModelName='UWM-6118',SampleCode='DSG55802-00'+str(version),MainRecId=10,MainCode='DSG55802',SampleTypeId=32,SampleTypeName='Collection sample',Brand='ZARA',Department='Chica 2',Quantity=1,OrderNo='PLM1',Color='Yellow',BodyName='S',AttachmentId=None,MainAttachmentId=None)
def event(id,kind,date,process='Dikim',deleted=0):
 return dict(SerialCardId=1,MovementId=id,InOut=kind,EventAt=date,ProcessName=process,IsDeleted=deleted,ResourceName='Grup2',FactoryName='Zara bandı')
class BarcodeTests(unittest.TestCase):
 def test_creator_and_assigned_employee_are_distinct_in_movement_history(self):
  e=event(1,0,'2026-11-12T10:00:00');e.update(EmployeeId=4692,CreatedById=1292,CreatedByName='Yeliz Atıcı',UpdatedById=None,UpdatedByName=None)
  m=B.build_barcode_records([serial()],[e],[],[],lambda _:False)[0]['erp']['movements'][0]
  self.assertEqual(m['createdByName'],'Yeliz Atıcı');self.assertEqual(m['createdById'],1292);self.assertEqual(m['employeeId'],4692)
 def test_distinct_serials_versions_and_leading_zeroes(self):
  out=B.build_barcode_records([serial(1,1),serial(2,2)],[],[],[],lambda _:False)
  self.assertEqual(len(out),2);self.assertNotEqual(out[0]['id'],out[1]['id']);self.assertEqual(out[0]['barcode'],'00001');self.assertEqual(out[1]['version'],2)
 def test_movement_sequence_and_recuts_are_chronological(self):
  stages=[(100,'Kesim','cutting'),(0,'Dikim','sewing'),(1,'Dikim','returned'),(0,'Dikim','sewing'),(100,'Kesim','cutting')]
  events=[]
  for n,(kind,proc,stage) in enumerate(stages,1):
   events.append(event(n,kind,f'2026-11-12T10:0{n}:00',proc))
   self.assertEqual(B.build_barcode_records([serial()],events,[],[],lambda _:False)[0]['erp']['stage'],stage)
 def test_deleted_return_reveals_sewing_and_unrelated_operations_do_not_move(self):
  events=[event(1,0,'2026-11-12T10:00:00'),event(2,1,'2026-11-12T11:00:00',deleted=1),event(3,1,'2026-11-12T12:00:00',process='Baskı')]
  out=B.build_barcode_records([serial()],events,[],[],lambda _:False)[0]
  self.assertEqual(out['erp']['stage'],'sewing');self.assertEqual(len(out['erp']['movements']),2)
 def test_no_movement_does_not_claim_cutting(self):
  self.assertEqual(B.build_barcode_records([serial()],[],[],[],lambda _:False)[0]['erp']['stage'],'review')
 def test_duplicate_rows_deduplicate_and_missing_dates_need_review(self):
  e=event(1,0,None)
  out=B.build_barcode_records([serial(),serial()],[e,e],[],[],lambda _:False)
  self.assertEqual(len(out),1);self.assertEqual(out[0]['erp']['stage'],'review');self.assertEqual(len(out[0]['erp']['movements']),1)
 def test_same_time_conflicting_events_need_review(self):
  out=B.build_barcode_records([serial()],[event(1,0,'2026-11-12T10:00:00'),event(2,1,'2026-11-12T10:00:00')],[],[],lambda _:False)[0]
  self.assertEqual(out['erp']['stage'],'review')
 def test_source_edits_are_not_inherited_and_house_is_not_guessed(self):
  sources=[dict(id='s1',model='UWM-6118',house='m1',sample='COLLECTION',hidden=False,override={'stage':'quality'}),dict(id='s2',model='UWM-6118',house='m3',sample='COLLECTION',hidden=False)]
  out=B.build_barcode_records([serial()],[],sources,[],lambda _:False)[0]
  self.assertEqual(out['house'],'erp');self.assertNotIn('override',out);self.assertEqual(set(out['linkedSourceIds']),{'s1','s2'})
if __name__=='__main__':unittest.main()

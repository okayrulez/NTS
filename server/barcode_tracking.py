"""Barcode event projection sourced from the joins of ERP custom report 211."""
from collections import defaultdict
from matching import candidates,norm

STAGES={'cutting':'ERP · kesim hareketi','sewing':'ERP · dikime çıktı','returned':'ERP · dikimden döndü','review':'ERP · hareket kontrol gerekli'}
def event_stage(e):
 name=norm(e.get('ProcessName'))
 if e.get('InOut')==100 and name=='kesim':return 'cutting'
 if e.get('InOut')==0 and name=='dikim':return 'sewing'
 if e.get('InOut')==1 and name=='dikim':return 'returned'
 return None

def project(events):
 active={e['MovementId']:e for e in events if not e.get('IsDeleted')}
 ordered=sorted(active.values(),key=lambda e:(e.get('EventAt') or '',e['MovementId']))
 relevant=[e for e in ordered if event_stage(e)]
 if not relevant:return 'review','Kesim veya dikim hareketi henüz yok.',ordered
 if any(not e.get('EventAt') for e in relevant):return 'review','Tarih/saat bilgisi eksik hareket var.',ordered
 last=relevant[-1];same_time={event_stage(e) for e in relevant if e['EventAt']==last['EventAt']}
 if len(same_time)>1:return 'review','Aynı anda farklı hareketler var; işlem sırası doğrulanmalı.',ordered
 return event_stage(last),'Son geçerli barkod hareketinden hesaplandı.',ordered

def build_barcode_records(serials,events,sources,items,photo_exists):
 by=defaultdict(list)
 for e in events:by[e['SerialCardId']].append(e)
 out=[];seen=set()
 for s in serials:
  # Database IDs preserve manual edits even if barcode text/version is corrected.
  key=(s['SerialCardId'],s['SampleRecId'])
  if key in seen:continue
  seen.add(key);stage,reason,history=project(by[s['SerialCardId']])
  item={'InventoryName':s['ModelName'],'InventoryCode':s['SampleCode']}
  linked=[r for r in sources if candidates(r,[item])]
  active=[r for r in linked if not r.get('hidden')];houses={r['house'] for r in active or linked}
  house=next(iter(houses)) if len(houses)==1 else 'erp'
  photoid=next((id for id in [s.get('AttachmentId'),s.get('MainAttachmentId')] if id and photo_exists(id)),None)
  wanted=s.get('AttachmentId') or s.get('MainAttachmentId')
  photo=f'erp-photos/{photoid}.jpg' if photoid else None
  movements=[{'id':e['MovementId'],'at':e.get('EventAt'),'kind':e['InOut'],'process':e.get('ProcessName'),'resource':e.get('ResourceName'),'band':e.get('FactoryName'),'employeeId':e.get('EmployeeId'),'createdById':e.get('CreatedById'),'createdByName':e.get('CreatedByName'),'updatedById':e.get('UpdatedById'),'updatedByName':e.get('UpdatedByName'),'insertedAt':e.get('InsertedAt'),'updatedAt':e.get('UpdatedAt'),'repair':bool(e.get('IsRepair')),'stage':event_stage(e)} for e in history]
  erp={'recId':s['SampleRecId'],'serialCardId':s['SerialCardId'],'code':s['SampleCode'],'mainCode':s.get('MainCode'),'stage':stage,'liveStatus':STAGES[stage],'reason':reason,'photo':photo,'attachmentId':wanted,'photoLevel':'numune' if photoid==s.get('AttachmentId') else 'ana model','matchNote':'Barkod ve numune ERP kayıt kimliğiyle bağlı; versiyon ayrı izlenir.','movements':movements,'activities':[],'studyMinutes':s.get('StudyMinutes')}
  out.append({'id':f"erp-bc-{s['SerialCardId']}-{s['SampleRecId']}",'recordType':'barcode','model':s['ModelName'],'barcode':str(s.get('Barcode') or ''),'version':s.get('Version'),'sampleCode':s['SampleCode'],'mainCode':s.get('MainCode'),'orderNo':s.get('OrderNo'),'sample':s.get('SampleTypeName') or 'Belirtilmemiş','brand':s.get('Brand') or 'Belirtilmemiş','department':s.get('Department') or '', 'house':house,'hidden':bool(linked) and not bool(active),'source':'ERP · Barkodlu Hareket Raporu','sheet':'Rapor 211','row':s['SerialCardId'],'status':STAGES[stage],'photo':'','erpPhoto':photo,'owner':movements[-1].get('resource') if movements else '', 'quantity':s.get('Quantity'),'body':s.get('BodyName'),'color':s.get('Color'),'fabric':'','accessory':'','pattern':'','date':'','notes':'','erp':erp,'linkedSourceIds':[r['id'] for r in linked],'raw':{'SerialCardId':s['SerialCardId'],'SampleRecId':s['SampleRecId'],'Barcode':s.get('Barcode'),'Version':s.get('Version'),'OrderNo':s.get('OrderNo'),'Color':s.get('Color'),'SupplyGroup':s.get('SupplyGroup'),'BodyName':s.get('BodyName')}})
 return out

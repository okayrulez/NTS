import re,unicodedata
def norm(s):
 return ''.join(c for c in unicodedata.normalize('NFD',str(s or '').lower().replace('ı','i')) if not unicodedata.combining(c)).strip()
def candidates(row,items):
 model=norm(row['model']);exact=[i for i in items if model in [norm(i['InventoryName']),norm(i['InventoryCode'])]]
 if exact:return exact
 if re.match(r'^bpr\s*\d',model):
  compact=re.sub(r'\s+','',model)
  matches=[i for i in items if re.sub(r'\s+','',norm(i['InventoryName']))==compact]
  if matches:return matches
 article=re.match(r'^(\d{7})\b',model)
 if article:
  matches=[i for i in items if re.match(r'^'+article[1]+r'\b',norm(i['InventoryName']))]
  if matches:return matches
 aliases={norm(x) for x in re.findall(r'\(([^)]+)\)',row['model'])}
 if re.match(r'^[\w-]+\s',row['model']):aliases.add(norm(row['model'].split()[0]))
 return [i for i in items if norm(i['InventoryName']) in aliases or norm(i['InventoryCode']) in aliases]
def sample_id(label):
 s=norm(label)
 if 'collection' in s or 'collectıon' in s:return 32
 if '+' in s or '&' in s:return None
 for token,id in [('size set',64),('colorway',33),('quality',80),('bulk',71),('fit',42),('test',65),('buyer',30),('style',74),('pp sample',51)]:
  if token in s:return id
 return None
def stage_for_activity(activity):
 s=norm(activity)
 if re.match(r'^p19\s*[- ]\s*dikim$',s):return 'dikimde'
 if re.match(r'^p11\s*[- ]\s*kesim$',s):return 'kesimde'
 if re.match(r'^p01\s*[- ]\s*kalip hazirlama$',s):return 'kalıpta'
 # Generic study, approval, risk and planned tasks are not production stages.
 return None
def live_status(activities):
 started={stage_for_activity(a.get('ActivityName')) for a in activities if a.get('TranStatus')==3}
 started.discard(None)
 if len(started)==1:return 'ERP · '+next(iter(started))
 if len(started)>1:return None
 latest=max((a.get('RecId',0) for a in activities),default=0)
 if any(a.get('TranStatus')==4 and a.get('RecId')==latest and norm(a.get('ActivityName'))=='p25-numune gonderim' for a in activities):return 'ERP · gönderildi'
 return None
LABELS={0:'Belirtilmemiş',1:'Bekliyor',2:'Planlandı',3:'Başladı',4:'Gerçekleşti',5:'Ertelendi',6:'İptal Edildi'}
def build_matches(records,items,tasks,photo_exists):
 out={}
 for r in records:
  cs=candidates(r,items)
  if not cs:continue
  mains=[i for i in cs if i['InventoryType']==100]
  model=mains[0] if len(mains)==1 else (cs[0] if len(cs)==1 else None)
  if not model:
   out[r['id']]={'code':'Eşleştirme gerekli','matchNote':f'{len(cs)} olası ERP kaydı var. Otomatik görsel / durum atanmadı.','candidates':len(cs),'activities':[]};continue
  sid=sample_id(r['sample'])
  task_ids={model['RecId']}
  if model.get('MainStyleCardId'):task_ids.add(model['MainStyleCardId'])
  acts=[a for a in tasks if a['InventoryId'] in task_ids and sid and a['StyleSampleTypeId']==sid]
  revisions={i.get('StyleSampleRevisionNo') for i in cs if i.get('InventoryType')==99 and i.get('StyleSampleTypeId')==sid and i.get('StyleSampleRevisionNo') is not None}
  revision_ambiguous=len(revisions)>1
  photoid=model.get('AttachmentId')
  status=live_status(acts) if sid and not revision_ambiguous else None
  out[r['id']]={'recId':model['RecId'],'code':model['InventoryCode'],'name':model['InventoryName'],'updatedAt':model.get('UpdatedAt'),'sampleTypeId':sid,'candidates':len(cs),'revisionAmbiguous':revision_ambiguous,'matchNote':'Model kodu eşleşti. Görsel ana model kartına aittir.'+(' Birden fazla revizyon var; otomatik durum uygulanmaz.' if revision_ambiguous else ' Numune türü eşleşti.' if sid else ' Numune türü belirsiz; otomatik durum uygulanmaz.'),'photo':f'erp-photos/{photoid}.jpg' if photoid and photo_exists(photoid) else None,'attachmentId':photoid,'liveStatus':status,'activities':[{'id':a['RecId'],'activity':a.get('ActivityName'),'label':LABELS.get(a['TranStatus'],str(a['TranStatus'])),'status':a['TranStatus'],'plannedDate':a.get('PlannedDate'),'actualDate':a.get('ActualDate'),'actualEndDate':a.get('ActualEndDate')} for a in sorted(acts,key=lambda x:x['RecId'],reverse=True)]}
 return out

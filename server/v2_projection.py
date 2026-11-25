"""V2 production vocabulary; no new ERP events are inferred from barcode creation."""
from barcode_tracking import build_barcode_records,project,event_stage
from matching import candidates,norm
from collections import Counter
from monthly import moment
from process_rules import project_row
from voucher_rules import normalize_vouchers

STAGE_LABELS={'pattern':'Kalıp sırası','pattern_done':'Kalıp tamamlandı','cutting_in':'Kesime alındı','cutting':'Kesimden döndü','sewing':'Dikime alındı','returned':'Dikimden döndü','review':'Kayıt kontrolü'}

def fallback(pattern_no):
    if str(pattern_no or '').strip():return 'pattern_done','Numune kartındaki Kalıp No alanı dolu.'
    return 'pattern','Numune kartında Kalıp No henüz boş; fiilî kalıp başlangıcı anlamına gelmez.'

def enrich(row,pattern_no,history):
    stage=row['erp']['stage'];reason=row['erp']['reason'];issue=None
    byid={e['MovementId']:e for e in history}
    for movement in row['erp'].get('movements',[]):
        event=byid.get(movement['id'],{})
        movement['employeeName']=event.get('EmployeeDisplayName') or event.get('EmployeeName')
        movement['employeeLabelType']='person_or_resource'
    relevant=[e for e in history if not e.get('IsDeleted') and event_stage(e)]
    if stage=='review' and not relevant:
        unknown=[e for e in history if not e.get('IsDeleted') and not event_stage(e)]
        if unknown:issue='unknown_operation';reason='Tanımlı kesim/dikim akışı dışında hareket var; operasyonu kontrol et.'
        else:stage,reason=fallback(pattern_no)
    elif stage=='review':issue='missing_time' if any(not e.get('EventAt') for e in relevant) else 'conflicting_time'
    row['erp'].update(stage=stage,reason=reason,patternNo=str(pattern_no or '').strip(),issue=issue)
    row.update(patternNo=str(pattern_no or '').strip(),status='ERP · '+STAGE_LABELS.get(stage,stage),modelKey='erp-model:'+str(row['erp'].get('mainRecId') or row['erp']['recId']))
    row['erp']['liveStatus']=row['status']
    milestones={}
    for movement in row['erp'].get('movements',[]):
        if movement.get('stage'):
            milestones[movement['stage']]={'at':movement.get('at'),'employeeId':movement.get('employeeId'),'employeeName':movement.get('employeeName'),'createdByName':movement.get('createdByName'),'createdById':movement.get('createdById'),'movementId':movement['id']}
    row['erp']['milestones']=milestones
    return row

def build_v2_records(raw,sources,photo_exists):
    serials=raw.get('serials',[]);events=raw.get('movements',[])
    rows=build_barcode_records(serials,events,sources,raw.get('items',[]),photo_exists)
    serial_by={(s['SerialCardId'],s['SampleRecId']):s for s in serials}
    history={}
    for event in events:history.setdefault(event['SerialCardId'],[]).append(event)
    for row in rows:
        s=serial_by[(row['erp']['serialCardId'],row['erp']['recId'])]
        row['erp'].update(mainRecId=s.get('MainRecId'),mainCode=s.get('MainCode'))
        row['brandId']=s.get('MarkId');row['departmentId']=s.get('DepartmentId')
        enrich(row,s.get('PatternNo'),history.get(s['SerialCardId'],[]))
    present={s['SampleRecId'] for s in serials}
    items={i['RecId']:i for i in raw.get('items',[])}
    for item in items.values():
        if item.get('InventoryType')!=99 or not item.get('IsSample') or item['RecId'] in present:continue
        parent=items.get(item.get('MainStyleCardId'),{})
        linked=[s for s in sources if candidates(s,[item,parent] if parent else [item])]
        active=[s for s in linked if not s.get('hidden')];houses={s['house'] for s in active or linked}
        attachment=next((i for i in [item.get('AttachmentId'),parent.get('AttachmentId')] if i and photo_exists(i)),None)
        row={'id':'erp-sample-'+str(item['RecId']),'recordType':'sample','model':item['InventoryName'],'sampleCode':item['InventoryCode'],'mainCode':parent.get('InventoryCode'),'barcode':'','version':item.get('StyleSampleRevisionNo'),'sample':item.get('SampleTypeName') or 'Numune','brand':item.get('Brand') or parent.get('Brand') or 'Atanmamış','brandId':item.get('MarkId'),'department':item.get('Department') or parent.get('Department') or '', 'departmentId':item.get('DepartmentId'),'house':next(iter(houses)) if len(houses)==1 else 'erp','hidden':bool(linked) and not active,'source':'ERP numune kartı','sheet':'Numune kartları','row':item['RecId'],'quantity':1,'linkedSourceIds':[s['id'] for s in linked],'photo':'','erpPhoto':f'erp-photos/{attachment}.jpg' if attachment else None,'raw':{'SampleRecId':item['RecId'],'PatternNo':item.get('PatternNo')},'erp':{'recId':item['RecId'],'mainRecId':item.get('MainStyleCardId'),'code':item['InventoryCode'],'stage':'review','reason':'Henüz barkod hareketi yok.','movements':[],'photo':f'erp-photos/{attachment}.jpg' if attachment else None,'photoLevel':'numune','activities':[]}}
        enrich(row,item.get('PatternNo'),[]);rows.append(row)
    routeplans={r['SampleRecId']:r for r in raw.get('routes',[])}
    settings={s['sampleRecId']:s for s in raw.get('processSettings',[])}
    vouchers=normalize_vouchers(raw.get('vouchers',[]),serials)
    bysample={};byserial={}
    for v in vouchers:
        if v.get('LinkLevel')=='barcode':byserial.setdefault(v.get('SerialCardId'),[]).append(v)
        elif v.get('LinkLevel')=='sample':bysample.setdefault(v.get('SampleRecId'),[]).append(v)
    for row in rows:
        rec=row['erp']['recId'];serial=serial_by.get((row['erp'].get('serialCardId'),rec))
        item={**items.get(rec,{}),'routePlan':routeplans.get(rec)}
        # Preserve PatternNo from serial query when the item select did not contain it.
        if serial:item={**item,'PatternNo':serial.get('PatternNo',item.get('PatternNo'))}
        project_row(row,item,serial,history.get(row['erp'].get('serialCardId'),[]),bysample.get(rec,[])+byserial.get(row['erp'].get('serialCardId'),[]),settings.get(rec))
        # Use the latest source edit for ordering, independently of the duration of this stage.
        ref=row['erp'].get('serialCardId')
        stamp_fields=[item.get(k) for k in ('ItemChangeAt','InsertedAt','UpdatedAt','SampleStatusAt')]
        stamp_fields.extend((serial or {}).get(k) for k in ('SerialCreatedAt','SerialUpdatedAt'))
        stamp_fields.extend(e.get(k) for e in history.get(ref,[]) for k in ('InsertedAt','UpdatedAt','DeletedAt','EventAt'))
        stamp_fields.extend(v.get(k) for v in bysample.get(rec,[])+byserial.get(ref,[]) for k in ('ScopeChangedAt','LineUpdatedAt','HeaderUpdatedAt','ConfirmedTransferInsertedAt','LineInsertedAt','HeaderInsertedAt'))
        newest=max((t for stamp in stamp_fields if (t:=moment(stamp,True)) is not None),default=None)
        row['erp']['activityAt']=newest.isoformat() if newest else None
    analysis={'workflowVersion':3,'stages':dict(Counter(r['erp']['stage'] for r in rows)),
      'issues':dict(Counter(r['erp']['issue'] for r in rows if r['erp'].get('issue'))),
      'barcodePrintPolicy':'Barkod kartı varlığı kesim başlangıcı kabul edilir. ERP içinde ayrı baskı zamanı kaydı doğrulanmadı.',
      'cuttingEvidence':'Kesim okutma InOut=100 → ara işlem seçiliyse Baskı–Nakış, yoksa Dikim sırası. Dikim Giden → Dikimde, Dikim Gelen → Kalitede.',
      'intermediateUnknown':sum(r['erp']['intermediateSelected'] is None for r in rows),
      'receiptPendingCount':sum(not v['AutomaticEligible'] for v in vouchers),'receiptEligibleCount':sum(v['AutomaticEligible'] for v in vouchers),'receiptCount':len(vouchers),'receiptLinkedCount':sum(len(r['erp']['vouchers']) for r in rows),
      'employeeNamesAvailable':any(e.get('EmployeeDisplayName') for e in events)}
    photo_changes={f"erp-photos/{i['AttachmentId']}.jpg":str(i['PhotoChangeAt']) for i in items.values()
                  if i.get('AttachmentId') and i.get('PhotoChangeAt')}
    for row in rows:
        path=row.get('erpPhoto')
        if path in photo_changes:
            version=''.join(c for c in photo_changes[path] if c.isdigit())
            row['erpPhoto']=row['erp']['photo']=path+'?v='+version
    period_models={row['erp'].get('mainRecId') for row in rows}
    analysis['mainModels']=[{'id':i['RecId'],'model':i.get('InventoryName') or i.get('InventoryCode'),
      'code':i.get('InventoryCode'),'brand':i.get('Brand'),'brandId':i.get('MarkId'),'department':i.get('Department'),
      'changedAt':i['ItemChangeAt']} for i in items.values()
      if i.get('InventoryType')==100 and i.get('ItemChangeAt') and i['RecId'] not in period_models]
    return rows,analysis

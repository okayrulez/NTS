"""User-approved 17 November workflow. ERP remains read-only.
Barkod card existence is the business proxy for print; it is not a print audit.
"""
from datetime import datetime,timezone
import re
from matching import norm

LABELS={'design':'Tasarım','pattern':'Kalıp sırası','pattern_done':'Kalıp tamamlandı','material':'Kumaş','cutting_in':'Kesimde','external':'Baskı – Nakış','queue':'Dikim sırası','sewing':'Dikimde','quality':'Kalitede','warehouse':'Numune Depo','shipping':'Gönderi','review':'Kayıt kontrolü','intermediate_review':'Ara işlem teyidi'}
INTERMEDIATE={'erp':'ERP bilgisi','none':'Ara işlem yok','print':'Baskı','embroidery':'Nakış','both':'Baskı + Nakış'}

def intermediate(item,setting=None):
    choice=(setting or {}).get('intermediate','erp')
    if choice!='erp':return {'selected':choice!='none','label':INTERMEDIATE[choice],'source':'V2 kullanıcı teyidi','choice':choice}
    # Only the dedicated, verified field is read. Missing extraction is unknown.
    route=item.get('routePlan') or {}
    if route.get('IntermediatePlanState')=='selected-planned':
        yes=bool(route.get('PlannedPrint') or route.get('PlannedEmbroidery'))
        label='Baskı + Nakış' if route.get('PlannedPrint') and route.get('PlannedEmbroidery') else 'Baskı' if route.get('PlannedPrint') else 'Nakış' if route.get('PlannedEmbroidery') else 'Ara işlem seçilmemiş'
        return {'selected':yes,'label':label,'source':'ERP numune rotası: '+str(route.get('RouteName') or route.get('RouteId'))+' (plan)','choice':'erp'}
    value=item.get('IntermediateProcessSelection')
    if value is None:return {'selected':None,'label':'Ara işlem teyidi gerekli','source':'ERP alanı henüz doğrulanmadı','choice':'erp'}
    text=str(value).strip()
    return {'selected':bool(text),'label':text or 'Ara işlem seçilmemiş','source':item.get('IntermediateProcessSource') or 'ERP numune kartı','choice':'erp'}

def event_stage(e,selected):
    process=norm(e.get('ProcessName'));kind=e.get('InOut')
    if process=='dikim' and kind==0:return 'sewing'
    if process=='dikim' and kind==1:return 'quality'
    if process=='kesim' and kind==100:return 'external' if selected is True else 'queue' if selected is False else 'intermediate_review'
    if e.get('ProcessId') in (4,5) or process in ('baski','nakis','baski-nakis','baski nakis'):return 'external'
    return None

def time_key(value):
    try:
        dt=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return dt.replace(tzinfo=None).isoformat(timespec='microseconds')
    except (ValueError,TypeError):return None

def select_stage(serial,item,events,vouchers,inter):
    active={e['MovementId']:e for e in events if not e.get('IsDeleted')}
    evidence=[];unknown=[]
    for e in active.values():
        target=event_stage(e,inter['selected'])
        if target:
            evidence.append({'id':e['MovementId'],'stage':target,'at':e.get('EventAt'),'source':'barcode','event':e})
        else:unknown.append(e)
    for v in vouchers:
        if v.get('AutomaticEligible') is False:continue
        if v.get('IsDeleted') or v.get('IsCancelled') or v.get('Reversed'):continue
        target={135:'warehouse',132:'shipping'}.get(v.get('ReceiptType'))
        if target and v.get('LinkLevel') in ('barcode','sample'):
            evidence.append({'id':v['ReceiptItemId'],'stage':target,'at':v.get('EventAt'),'source':'receipt','event':v})
    if evidence:
        if any(not time_key(e['at']) for e in evidence):return 'review','Hareket veya fişte geçerli tarih-saat yok.','missing_time',None
        evidence.sort(key=lambda e:(time_key(e['at']),e['id']))
        latest=evidence[-1];same=[e for e in evidence if time_key(e['at'])==time_key(latest['at'])]
        if len({e['stage'] for e in same})>1:return 'review','Son anda çelişen aşamalar var; hareket sırası teyit edilmeli.','conflicting_time',None
        if latest['stage']=='intermediate_review':return 'intermediate_review','Kesim okutulmuş; Baskı–Nakış / Dikim sırası ayrımı için ara işlem teyidi gerekli.','intermediate_unknown',latest
        if latest['source']=='receipt':return latest['stage'],str(latest['event']['ReceiptType'])+' fiş hareketi numuneye kesin bağlandı. Daha yeni üretim hareketi önceliklidir.',None,latest
        if latest['stage']=='queue':reason='Kesim operasyonu okutuldu; ara işlem yok → Dikim sırası.'
        elif latest['stage']=='external':reason='Kesim okutuldu ve ara işlem seçili veya baskı/nakış hareketi var.'
        elif latest['stage']=='sewing':reason='Dikime giden barkod okutuldu (Dikim / InOut=0).'
        else:reason='Dikimden gelen barkod okutuldu (Dikim / InOut=1) → Kalitede. Kalite onayı değildir.'
        return latest['stage'],reason,None,latest
    if unknown:return 'review','Tanımlı üretim akışı dışında hareket var; operasyon kontrol edilmeli.','unknown_operation',None
    if serial and str(serial.get('Barcode') or '').strip():
        return 'cutting_in','Barkod kartı mevcut → Kesimde (onaylanan iş kuralı). Ayrı baskı zamanı kaydı yok; kart oluşturma tarihi ayrıca gösterilir.',None,{'source':'barcode-card','at':serial.get('SerialCreatedAt'),'id':serial.get('SerialCardId')}
    if str(item.get('PatternNo') or '').strip():return 'pattern_done','Numune kartındaki Kalıp No alanı dolu.',None,None
    return 'pattern','Numune kartında Kalıp No boş; fiilî kalıp başlangıcı anlamına gelmez.',None,None

def project_row(row,item,serial,events,vouchers,setting=None):
    inter=intermediate(item,setting);target,reason,issue,evidence=select_stage(serial,item,events,vouchers,inter)
    row['erp'].update(stage=target,reason=reason,issue=issue,workflowVersion=3,intermediateSelected=inter['selected'],intermediateLabel=inter['label'],intermediateSource=inter['source'],intermediateChoice=inter['choice'],barcodeCreatedAt=(serial or {}).get('SerialCreatedAt'),barcodePrintEvidence='ERP barkod kartı varlığı; ayrı basım teyidi yok' if serial else None,stageEvidence={k:v for k,v in (evidence or {}).items() if k!='event'},vouchers=vouchers)
    byid={e['MovementId']:e for e in events}
    milestones={}
    for movement in row['erp'].get('movements',[]):
        movement['workflowStage']=event_stage(byid.get(movement['id'],{}),inter['selected'])
        if movement.get('workflowStage'):
            milestones[movement['workflowStage']]=movement
    row['erp']['workflowMilestones']=milestones
    row['status']='ERP · '+LABELS[target];row['erp']['liveStatus']=row['status']
    sample=norm(row.get('sample'))
    row['sampleNature']='original' if re.search(r'\b(orijinal|original)\b',sample) else 'trial' if re.search(r'\bdeneme\b',sample) else ''
    return row

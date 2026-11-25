"""Exact sample-version vouchers; never spread partial stock movements over barcodes."""
from collections import Counter

def normalize_vouchers(vouchers,serials):
    counts=Counter(s['SampleRecId'] for s in {s['SerialCardId']:s for s in serials}.values())
    result=[]
    for source in vouchers:
        v=dict(source);v['ReceiptEventAt']=v.get('EventAt');reasons=[]
        if any(v.get(k) for k in ('HeaderIsDeleted','LineIsDeleted','HeaderIsCancelled','LineIsCancelled','HeaderHasNegativeEffect','LineHasNegativeEffect')):reasons.append('Silinmiş, iptal veya negatif etkili fiş.')
        if (v.get('ReturnedQuantity') or 0)>0 or v.get('ReturnReceiptItemId') or v.get('ReturnReceiptItemIdP'):reasons.append('İade/ters hareket incelemesi gerekli.')
        effective=(v.get('Quantity') or 0)>0 or v.get('ReceiptType')==135 and (v.get('ConfirmedTransferQuantity') or 0)>0
        if not effective:reasons.append('Pozitif çıkış veya bağlı transfer girişi yok.')
        if v.get('ReceiptType')==135:
            # Warehouse 80 was verified as Uniteks Modelhane Mamul Deposu.
            if v.get('InWarehouseId')!=80:reasons.append('135 genel transfer: hedef, doğrulanan modelhane numune deposu 80 değil.')
            if (v.get('ConfirmedTransferQuantity') or 0)<=0:reasons.append('135 çıkışın karşı 17 depo girişi doğrulanmadı.')
            elif not v.get('ConfirmedTransferAt'):reasons.append('Karşı depo girişinin tarih/saati eksik.')
            else:v['EventAt']=v['ConfirmedTransferAt']
        total=v.get('TotalBarcodeCount',counts[v.get('SampleRecId')])
        if v.get('LinkLevel')=='sample' and total>1:reasons.append('Aynı numune versiyonunda '+str(total)+' barkod var; fiziksel barkod bağı yok.')
        v['AutomaticEligible']=not reasons;v['PendingReason']=' '.join(reasons);v['SampleBarcodeCount']=total
        v['WarehouseName']=v.get('InWarehouseName') or v.get('OutWarehouseName')
        result.append(v)
    return result

(() => {
  'use strict';
  const fields = {userOwner:'detailOwner', targetDate:'detailDate', userNote:'detailNote', approval:'detailApproval'};
  const defaults = {userOwner:'', targetDate:'', userNote:'', approval:'pending'};
  const labels = {userOwner:'Takip sorumlusu', targetDate:'Hedef bitiş', userNote:'Revizyon / not', approval:'Onay durumu'};
  const approvals = {pending:'Onay bekliyor', approved:'Onaylandı', revise:'Revize istendi'};
  const tz = {timeZone:'Europe/Istanbul'};
  const dateLabel = new Intl.DateTimeFormat('tr-TR',{...tz, dateStyle:'medium',timeStyle:'short'});
  function instant(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value))return NaN;
    // SQL Server movement times are local factory times (Türkiye).
    return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value)?value:value+'+03:00');
  }
  function waiting(row,asOf){
    const entry=row.erp?.stageEntry;
    if(!entry||row.override||row.stage!==row.erpStage||entry.stage!==row.stage||
       !['barcode','receipt'].includes(entry.source))return null;
    const start=instant(entry.at),end=instant(asOf);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return null;
    const day=ms=>Math.floor((ms+3*3600000)/86400000);
    const days=day(end)-day(start);
    return {days,entered:dateLabel.format(start),asOf:dateLabel.format(end),
      source:entry.source==='receipt'?'ERP fişi':'ERP barkod hareketi'};
  }
  function legacy(edit){
    const values={};
    for(const key of Object.keys(fields)){
      if(typeof edit[key]==='string'&&edit[key]!==defaults[key])values[key]=edit[key];
    }
    const history=(edit.history||[]).filter(h=>h.type==='note'||h.type==='detail')
      .map(h=>({at:h.at||'',note:h.note||''}));
    return {id:edit.id,values,history};
  }
  window.TeamFollowup={fields,defaults,labels,approvals,waiting,legacy};
})();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/engine.js'),'utf8'),ctx);
const api=()=>ctx.Tracker;
test('backup restoration retains removed barcode identity and notes after reload',()=>{
 const live=api().reconcileERP([],{connected:true,matches:{},barcodes:[barcode('sewing')]});
 const state=api().restoreBackup([],[{id:live[0].id,userNote:'Eksik kart notu',override:{stage:'quality',baseStage:'sewing',baseStatus:live[0].status},card:{model:'UWM-6118',barcode:'00001',version:1,house:'m3',sample:'Collection'}}]);
 assert.equal(state[0].barcode,'00001');assert.equal(state[0].userNote,'Eksik kart notu');assert.equal(state[0].erpMissing,true);assert.equal(state[0].stage,'quality');assert.equal(state[0].conflict,true);
});
test('restoration evaluates manual overrides against current barcode evidence',()=>{
 const live=api().reconcileERP([],{connected:true,matches:{},barcodes:[barcode('returned')]});
 const state=api().restoreBackup(live,[{id:live[0].id,override:{stage:'quality',baseStage:'cutting',baseStatus:'cutting',conflict:false},userNote:'Korunsun'}]);
 assert.equal(state[0].conflict,true);assert.equal(state[0].erpStage,'returned');
 const edited=api().saveDetail(state[0],'quality','external','Son not');
 const refreshed=api().reconcileERP([edited],{connected:true,matches:{},barcodes:[barcode('sewing')]});
 assert.equal(refreshed[0].userNote,'Son not');assert.equal(refreshed[0].stage,'external');
});
const barcode=(stage='cutting',id='erp-bc-1-90',version=1)=>({id,recordType:'barcode',model:'UWM-6118',barcode:'00001',version,status:'ERP · hareket',erp:{stage,liveStatus:'ERP · '+stage,photo:null,movements:[]}});
test('barcode snapshots add new cards and keep versions distinct',()=>{
 const source={id:'src-a',status:'kalitede'};
 const rows=api().reconcileERP([source],{connected:true,matches:{},barcodes:[barcode(),barcode('sewing','erp-bc-2-91',2)]});
 assert.equal(rows.length,3);assert.equal(rows[1].stage,'cutting');assert.equal(rows[2].stage,'sewing');assert.equal(rows[2].version,2);
});
test('barcode movement updates preserve manual corrections and independent source edits',()=>{
 const source=api().move({id:'src-a',status:'kesimde'},'quality','source note');
 let rows=api().reconcileERP([source],{connected:true,matches:{},barcodes:[barcode()]});
 assert.ok(!rows[1].override);
 rows[1]=api().move(rows[1],'external','Nakışta');
 rows=api().reconcileERP(rows,{connected:true,matches:{},barcodes:[barcode('sewing')]});
 assert.equal(rows[1].stage,'external');assert.equal(rows[1].erpStage,'sewing');assert.equal(rows[1].conflict,true);
 assert.equal(rows[0].stage,'quality');
 rows[1]=api().acceptERP(rows[1]);assert.equal(rows[1].stage,'sewing');
});
test('return, later resewing and deletion of a barcode are reflected',()=>{
 let rows=api().reconcileERP([],{connected:true,matches:{},barcodes:[barcode('returned')]});
 assert.equal(rows[0].stage,'returned');
 rows=api().reconcileERP(rows,{connected:true,matches:{},barcodes:[barcode('sewing')]});assert.equal(rows[0].stage,'sewing');
 rows=api().reconcileERP(rows,{connected:true,matches:{},barcodes:[]});assert.equal(rows[0].stage,'review');assert.equal(rows[0].erpMissing,true);
});
test('disconnected response cannot invalidate a barcode and saved notes can restore after discovery',()=>{
 const live=api().reconcileERP([],{connected:true,barcodes:[barcode()],matches:{}});
 const offline=api().reconcileERP(live,{connected:false,matches:{}});assert.equal(offline[0].stage,'cutting');
 const restored=api().restoreEdits(live,[{id:'erp-bc-1-90',userNote:'Barkod notu',override:{stage:'quality',baseStatus:live[0].status}}]);
 assert.equal(restored[0].stage,'quality');assert.equal(restored[0].userNote,'Barkod notu');
});
test('saving only a note does not undo an ERP move while detail is open',()=>{
 const current=api().decorate({id:'a',status:'dikimde'});
 const saved=api().saveDetail(current,'cutting','cutting','Yeni not');
 assert.equal(saved.stage,'sewing');assert.ok(!saved.override);assert.equal(saved.userNote,'Yeni not');
 const moved=api().saveDetail(current,'cutting','quality','Kaliteye alındı');
 assert.equal(moved.stage,'quality');assert.equal(moved.override.stage,'quality');
});
test('authoritative ERP evidence withdrawal removes old stage and photo',()=>{
 const r=api().decorate({id:'a',status:'kesimde',photo:'photos/source.jpg'});
 const live=api().reconcileERP([r],{connected:true,matches:{a:{liveStatus:'dikimde',photo:'erp-photos/a.jpg'}}})[0];
 assert.equal(live.stage,'sewing');
 const next=api().reconcileERP([live],{connected:true,matches:{a:{liveStatus:null,photo:null}}})[0];
 assert.equal(next.stage,'review');assert.equal(next.erpPhoto,null);assert.equal(next.photo,'photos/source.jpg');
 const manual=api().move(live,'quality','');
 const kept=api().reconcileERP([manual],{connected:true,matches:{}})[0];
 assert.equal(kept.stage,'quality');assert.equal(kept.conflict,true);
});
test('classifies Turkish source statuses and separates sewing queue',()=>{
 assert.ok(api(),'Tracker engine must exist');
 for(const [raw,stage] of [['ORJINAL-KALİTEDE','quality'],['DİKİM SIRASINDA','queue'],['deneme dikimde','sewing'],['KESİMDE BASKIYA GİDECEK','cutting'],['KUMAŞ BEKLİYOR','material'],['DIŞ İŞLEME GİDECEK','review'],['dış işleme gitti','external'],['BİTTİ','done'],['revize gelecek','review'],['kalıpta','pattern'],['DHL','shipping'],['gitti','review']])assert.equal(api().classify(raw).stage,stage,raw);
});
test('past shipments do not override current stage in comments',()=>{
 assert.equal(api().classify('16.07 gönderildi, ps dikimde').stage,'sewing');
 assert.equal(api().classify('01.09 gönderildi, ilk renk ps kalitede').stage,'quality');
});
test('a blocking accessory preserves sewing stage',()=>{
 const r=api().decorate({id:'a',status:'DİKİMDE',accessory:'FERMUAR BEKLER'});
 assert.equal(r.stage,'sewing');assert.ok(r.blockers.length);
});
test('manual correction survives changed ERP status with explicit conflict',()=>{
 let r=api().move({id:'a',status:'kesimde'},'sewing','Dikime alındı');
 assert.equal(r.stage,'sewing');assert.equal(r.override.stage,'sewing');
 let updated=api().applyUpdates([r],[{id:'a',status:'kalitede'}])[0];
 assert.equal(updated.stage,'sewing');assert.equal(updated.erpStage,'quality');assert.equal(updated.conflict,true);
 updated=api().acceptERP(updated);assert.equal(updated.stage,'quality');assert.equal(updated.conflict,false);assert.equal(updated.override,null);
});
test('ERP matching a manual correction clears the override',()=>{
 const r=api().move({id:'a',status:'kesimde'},'sewing','');
 const updated=api().applyUpdates([r],[{id:'a',status:'dikimde'}])[0];
 assert.equal(updated.stage,'sewing');assert.equal(updated.override,null);assert.equal(updated.conflict,false);
});
test('ERP automatic changes move cards without override',()=>{
 const r=api().applyUpdates([{id:'a',status:'kesimde'}],[{id:'a',status:'kalitede'}])[0];
 assert.equal(r.stage,'quality');assert.equal(r.history.length,1);
});
test('invalid batches reject atomically and do not mutate source',()=>{
 const rows=[{id:'a',status:'kesimde'}];
 assert.throws(()=>api().applyUpdates(rows,[{id:'a',status:'kalitede'},{id:'missing',status:'dikimde'}]));
 assert.equal(rows[0].status,'kesimde');
 assert.throws(()=>api().applyUpdates(rows,[{id:'a',status:'x',photo:'javascript:alert(1)'}]));
 assert.throws(()=>api().applyUpdates(rows,[{id:'a',status:'x'},{id:'a',status:'y'}]));
 assert.throws(()=>api().move(rows[0],'invalid',''));
});

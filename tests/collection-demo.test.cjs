const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({JSDOM} = require('jsdom')); }
catch { ({JSDOM} = require('../../v2-test-runtime/node_modules/jsdom')); }
const dist = path.resolve(__dirname,'../dist');
const code = name => fs.readFileSync(path.join(dist,name),'utf8');

function boot(search) {
  const w = new JSDOM('', {url:'http://localhost/'+search,runScripts:'outside-only'}).window;
  w.structuredClone = structuredClone;
  w.eval(code('collection-demo.js'));
  return w;
}
test('only the explicit collection demo activates the offline transport', () => {
  const w=boot('');
  try { assert.equal(w.NTSCollectionDemo,undefined); }
  finally { w.close(); }
});
test('ten illustrative sample images, one design identity through handoff, scans and reload', async () => {
  const w=boot('?demo=koleksiyon');
  try {
    const demo=w.NTSCollectionDemo;
    const state=await demo.request('/api/state');
    const rows=async()=> (await demo.request('/api/erp/delta?since=')).updated;
    const designs=state.models, draft=designs[0];
    assert.equal(designs.length,10);
    assert.equal(new Set(designs.map(m=>m.erpModelKey)).size,10);
    for(const model of designs) assert.ok(fs.statSync(path.join(dist,model.photo)).size>1000);
    assert.equal((await rows()).length,6);
    const handoff={id:draft.id,erpModelKey:draft.erpModelKey,note:'Yaka ölçüsü onaylandı'};
    await demo.request('/api/models/handoff',handoff);
    await demo.request('/api/models/handoff',handoff);
    assert.equal((await rows()).length,7);
    const getRow=async()=> (await rows()).find(r=>r.modelKey===draft.erpModelKey);
    const first=await getRow();
    assert.equal(first.erp.stage,'pattern');
    assert.equal(first.erpPhoto,draft.photo);
    for(const stage of ['pattern','pattern_done','cutting_in','queue','sewing','quality']) demo.advance(draft.erpModelKey,stage);
    const final=await getRow();
    assert.equal(final.erp.stage,'done');
    assert.equal(final.erp.movements.length,7);
    assert.equal(final.id,first.id);
    assert.equal(final.barcode,first.barcode);
    assert.equal(final.version,first.version);
    assert.equal(w.localStorage.length,0);
    w.eval(code('collection-demo.js'));
    const saved=await w.NTSCollectionDemo.request('/api/state');
    assert.equal(saved.models[0].handoff.note,handoff.note);
    assert.equal(w.NTSCollectionDemo.nextStep(draft.erpModelKey),undefined);
  } finally { w.close(); }
});
test('adding an image creates only a draft and rejects duplicate nine-digit references', async () => {
  const w=boot('?demo=koleksiyon');
  try {
    const demo=w.NTSCollectionDemo,entry={ref:'900000001',name:'Gömlek',line:'Gömlek',color:'Mavi',photo:'data:image/jpeg;base64,AA=='};
    const page=demo.add(entry);
    assert.throws(()=>demo.add(entry),/zaten var/);
    const state=await demo.request('/api/state');
    const model=state.models.find(m=>m.slideId===page);
    assert.equal(model.photo,entry.photo);
    assert.equal(model.handoff,undefined);
    assert.equal(state.collections[0].canvaSlides.length,11);
    assert.equal((await demo.request('/api/erp/delta?since=')).updated.length,6);
    await demo.request('/api/models/handoff',{id:model.id,erpModelKey:model.erpModelKey,note:''});
    const row=(await demo.request('/api/erp/delta?since=')).updated.find(r=>r.modelKey===model.erpModelKey);
    assert.equal(row.erpPhoto,entry.photo);
    assert.equal(row.mainCode,entry.ref);
  } finally { w.close(); }
});

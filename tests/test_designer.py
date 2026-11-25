import pathlib
import sys
import tempfile
import unittest

import pymupdf

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'server'))
from canva_sync import parse_pdf, production_brief, recover_cached_slides, resolve_production_models
from v2_store import Store


def presentation(first, last):
    with pymupdf.open() as document:
        for number in range(first, last + 1):
            page = document.new_page(width=320, height=180)
            if number != 2:
                page.insert_text((20, 30), f'Collection edit {number}')
                page.insert_text((20, 52), 'Model code: SAMPLE-DEMO')
                page.insert_text((20, 75), 'Product line: Jersey')
        return document.tobytes()


class DesignerTests(unittest.TestCase):
    def test_production_brief_resolves_current_erp_without_guessing(self):
        with tempfile.TemporaryDirectory() as directory, pymupdf.open() as doc:
            page=doc.new_page()
            page.insert_text((30,40),'ERP: 012345678')
            page.insert_text((30,65),'Dikim')
            models=parse_pdf(doc.tobytes(),'DTEST01',1,pathlib.Path(directory),{},[])
        model=models[0]
        self.assertEqual(model['productionBrief'],{'code':'012345678','operation':'Dikim'})
        erp={'modelKey':'erp-model:1','sampleCode':'012345678'}
        resolve_production_models(models,[erp,erp])
        self.assertEqual(model['erpModelKey'],'erp-model:1')
        resolve_production_models(models,[erp,{**erp,'modelKey':'erp-model:2'}])
        self.assertIsNone(model['erpModelKey'])
        self.assertEqual(model['matchState'],'ambiguous')
        model.update(manualLink=True,erpModelKey='erp-model:2')
        resolve_production_models(models,[erp])
        self.assertEqual(model['erpModelKey'],'erp-model:2')
        for text in ('Dikim 0123456789','Dikim ABC012345678','012345678\nDikimden döndü',
                     'Dikim 012345678 987654321','012345678\nDikim\nKesim'):
            self.assertIsNone(production_brief(text))
        self.assertEqual(production_brief('KALIP · 123456789')['operation'],'Kalıp')
        self.assertEqual(production_brief('Aşama: KESİM\n012345678')['operation'],'Kesim')

    def test_slide_import_keeps_empty_pages_and_repeated_product_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            dist = pathlib.Path(directory)
            slides = []
            catalog = {'erp-model:10': {'SAMPLE-DEMO'}}
            models = parse_pdf(presentation(1, 60), 'DDEMO01', 1, dist, catalog, slides)
            models += parse_pdf(presentation(61, 120), 'DDEMO01', 2, dist, catalog, slides, ids={120: 'stable-id'})
            self.assertEqual(len(slides), 120)
            self.assertEqual(len({m['id'] for m in models}), 119)
            self.assertEqual(slides[1]['title'], 'Slayt 2')
            self.assertEqual(slides[-1]['title'], 'Collection edit 120')
            self.assertEqual(slides[-1]['productLine'], 'Jersey')
            self.assertTrue(slides[-1]['id'].startswith('page-'))
            self.assertEqual(models[-1]['slideId'], slides[-1]['id'])
            self.assertEqual(models[-1]['erpModelKey'], 'erp-model:10')
            self.assertTrue((dist / slides[-1]['photo']).is_file())

    def test_recover_cached_slides_keeps_existing_collection_membership(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)
            store = Store(path / 'v2.sqlite3')
            store.put_collection({'id': 'c', 'name': 'Deck', 'modelKeys': ['old-model'], 'canvaDesignId': 'DDEMO01'})
            (path / 'DDEMO01-1.pdf').write_bytes(presentation(1, 1))
            (path / 'DDEMO01-2.pdf').write_bytes(presentation(2, 2))
            recover_cached_slides(store, path, path)
            collection = store.state()['collections'][0]
            self.assertEqual(collection['modelKeys'], ['old-model'])
            self.assertEqual([slide['number'] for slide in collection['canvaSlides']], [1, 2])

    def test_handoff_preserves_explicit_link_and_decision_during_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(pathlib.Path(directory) / 'v2.sqlite3')
            model = {'id': 'canva-test-product', 'erpModelKey': 'erp-model:10'}
            store.put_models([model])
            with self.assertRaises(ValueError):
                store.handoff_model(model['id'], 'erp-model:11', 'Wrong model')
            first = store.handoff_model(model['id'], 'erp-model:10', 'Use revised collar')
            self.assertEqual(store.handoff_model(model['id'], 'erp-model:10', 'Use revised collar'), first)
            store.put_models([{**model, 'erpModelKey': 'erp-model:99'}])
            saved = store.state()['models'][0]
            self.assertEqual(saved['erpModelKey'], 'erp-model:10')
            self.assertEqual(saved['handoff']['note'], 'Use revised collar')
            self.assertNotIn('handoff', store.link_model(model['id'], 'erp-model:11'))

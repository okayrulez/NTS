"""Apply the explicitly supplied ERP brand relationships without changing ERP data."""
import copy
import json
from pathlib import Path


def normal(value):
    return ' '.join(str(value).casefold().split())


def apply_brand_overrides(taxonomy):
    result = copy.deepcopy(taxonomy)
    config = json.loads(Path(__file__).with_name('brand-parent-overrides.json').read_text(encoding='utf-8'))
    roots = result['brands']

    def find(name, aliases=()):
        wanted = {normal(value) for value in [name, *aliases]}
        for brand in roots:
            if normal(brand['name']) in wanted:
                return brand
        raise ValueError('Brand missing from taxonomy: ' + name)

    for row in config['relationships']:
        parent = find(row['parent'], row['aliases'] if row['brand'] == row['parent'] else ())
        parent.setdefault('directErpAliases', list(parent.get('erpAliases', [parent['name']])))
        if row['brand'] == row['parent']:
            parent['name'] = row['parent']
            parent['erpAliases'] = sorted(set(parent.get('erpAliases', []) + row['aliases']))
            continue
        child = next((node for node in parent.get('children', []) if node.get('kind') == 'erp-brand' and node['name'] == row['brand']), None)
        if child is None:
            child = find(row['brand'], row['aliases'])
            roots.remove(child)
            parent.setdefault('children', []).append(child)
        parent['name'] = row['parent']
        child.update(name=row['brand'], kind='erp-brand', parentBrandId=parent['id'], relationshipSource=config['source'])
        child['erpAliases'] = sorted(set(child.get('erpAliases', []) + row['aliases']))
        parent['erpAliases'] = sorted(set(parent.get('erpAliases', []) + child['erpAliases']))
        parent['erpMarkIds'] = sorted(set(parent.get('erpMarkIds', []) + child.get('erpMarkIds', [])))
    result['schemaVersion'] = 2
    result['brandParentOverrides'] = config
    return result


if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1])
    data = apply_brand_overrides(json.loads(target.read_text(encoding='utf-8')))
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

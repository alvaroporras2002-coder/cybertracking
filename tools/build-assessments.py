#!/usr/bin/env python3
"""Build a small readiness index; question banks load only when needed."""
from pathlib import Path
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]


def build(check=False):
    weeks = []
    for number in range(1, 53):
        path = ROOT / f'data/assessments/week-{number:02}.json'
        bank = json.loads(path.read_text(encoding='utf-8'))
        assert bank['week'] == number, f'Wrong week: {path.name}'
        weeks.append({'week': number, 'file': path.name, 'dayIds': [day['dayId'] for day in bank['days']]})
    payload = {'version': '1.5.0', 'weekCount': 52, 'sessionCount': 364, 'weeks': weeks}
    target = ROOT / 'data/assessments/index.json'
    encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n'
    if check:
        assert target.read_text(encoding='utf-8') == encoded, 'Rebuild data/assessments/index.json from its weekly sources.'
    else:
        target.write_text(encoded, encoding='utf-8')
    print(json.dumps({'compiledWeeks': len(weeks), 'bytes': len(encoded.encode('utf-8')), 'check': check}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)

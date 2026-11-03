#!/usr/bin/env python3
"""Valida contenido local sin dependencias. Uso: python tools/validate-content.py [HTML_ORIGEN]"""
from pathlib import Path
from html.parser import HTMLParser
import json, re, sys

ROOT=Path(__file__).resolve().parents[1]
def validate(source=None):
 c=json.loads((ROOT/'data/curriculum.json').read_text())
 weeks=c['weeks']; assert len(weeks)==52,'Se requieren 52 semanas'
 ids=[]; resource_ids=[]; qids=[]; prompts=[]; qcount=0;challenges=0;ready=[]
 for expected,w in enumerate(weeks,1):
  assert w['number']==expected
  assert len(w['days'])==7
  for dno,d in enumerate(w['days'],1):
   assert d['id']==f'w{expected:02d}d{dno}'
   assert d['week']==expected and d['day']==dno
   assert d['title'] and d['topics'] and d['task'] and d['evidence']
   assert d['resources'] and any(r['required'] for r in d['resources'])
   ids.append(d['id'])
   for r in d['resources']:
    resource_ids.append(r['id']);assert r['url'].startswith('https://')
    assert r['type'] in ['video','playlist','article','tool']
    assert r['description'] and isinstance(r['required'],bool)
  bankpath=ROOT/f'data/assessments/week-{expected:02d}.json'
  if not bankpath.exists():continue
  b=json.loads(bankpath.read_text()); assert b['week']==expected
  assert [d['dayId'] for d in b['days']]==[d['id'] for d in w['days']]
  for dno,day in enumerate(b['days'],1):
   qs=day['questions']; assert len(qs)>=(20 if dno==7 else 8)
   for q in [*qs,day['challenge']]:
    qids.append(q['id']);prompts.append(q['prompt'].strip().casefold())
    assert q['prompt'] and q['explanation'] and q['reference'].startswith('https://')
    os=q['options']; oi=[o['id'] for o in os]; assert len(oi)==len(set(oi)) and len(oi)>=2
    assert len({o['text'].strip().casefold() for o in os})==len(os)
    assert q['correct'] and set(q['correct'])<=set(oi)
   qcount+=len(qs);challenges+=1
  ready.append(expected)
 assert len(ids)==364 and len(ids)==len(set(ids))
 assert len(resource_ids)==len(set(resource_ids))
 assert len(qids)==len(set(qids))
 assert len(prompts)==len(set(prompts)),'Hay enunciados exactamente repetidos'
 if source:
  sourceids=re.findall(r'<article[^>]+id="(w\d{2}d\d)"',Path(source).read_text())
  assert sourceids==ids,'Los IDs no coinciden con el documento de origen'
 status=json.loads((ROOT/'data/content-status.json').read_text())
 assert status['readyWeeks']==ready
 assert status['sessionCount']==364
 print(json.dumps({'weeks':len(weeks),'sessions':len(ids),'readyWeeks':ready,'questions':qcount,'challenges':challenges,'uniqueResourceIds':len(resource_ids),'checks':'passed','scope':'Validación estructural y duplicados exactos; revisión pedagógica manual complementaria.'},ensure_ascii=False,indent=2))
if __name__=='__main__':validate(sys.argv[1] if len(sys.argv)>1 else None)

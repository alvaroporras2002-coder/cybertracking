#!/usr/bin/env python3
"""Validate curriculum, source banks and explicit spaced-review provenance."""
from pathlib import Path
import argparse,json,re
ROOT=Path(__file__).resolve().parents[1]
def validate(source=None,partial=False):
 weeks=json.loads((ROOT/'data/curriculum.json').read_text())['weeks']
 assert len(weeks)==52
 ids=[];resources=[];qids=set();originals={};prompts={};ready=[];index_rows=[]
 qcount=review_count=original_count=challenges=0
 for number,week in enumerate(weeks,1):
  assert week['number']==number and len(week['days'])==7
  for dno,day in enumerate(week['days'],1):
   assert day['id']==f'w{number:02}d{dno}' and day['week']==number and day['day']==dno
   assert all(day.get(k)for k in('title','topics','task','evidence'))
   assert day['resources'] and any(r['required']for r in day['resources'])
   ids.append(day['id'])
   for r in day['resources']:
    resources.append(r['id']);assert r['url'].startswith('https://')
    assert r['type']in('video','playlist','article','tool')and r['description']and isinstance(r['required'],bool)
  path=ROOT/f'data/assessments/week-{number:02}.json'
  if not path.exists():
   assert partial,f'Falta {path.name}'
   continue
  bank=json.loads(path.read_text());assert bank['week']==number
  assert [d['dayId']for d in bank['days']]==[d['id']for d in week['days']]
  for dno,day in enumerate(bank['days'],1):
   questions=day['questions'];assert len(questions)>=(20 if dno==7 else 8),day['dayId']
   for q in [*questions,day['challenge']]:
    qid=q['id'];assert qid not in qids,f'ID repetido: {qid}'
    qids.add(qid);assert qid.startswith(day['dayId']+'-'),qid
    assert q['prompt']and q['explanation']and q['reference'].startswith('https://'),qid
    opts=q['options'];oi=[o['id']for o in opts]
    assert len(oi)==len(set(oi))and len(oi)>=2,qid
    assert len({o['text'].strip().casefold()for o in opts})==len(opts),qid
    assert q['correct']and set(q['correct'])<=set(oi),qid
    if q.get('reviewOf'):
     ref=q['reviewOf'];assert dno==7 and re.match(rf'^w{number:02}d[1-6]-',ref),qid
     origin=originals.get(ref);assert origin,f'Repaso sin origen: {qid}'
     for k in('prompt','options','correct','explanation','reference'):assert q[k]==origin[k],f'Repaso modificado: {qid}/{k}'
     review_count+=1
    else:
     prompt=q['prompt'].strip().casefold()
     assert prompt not in prompts,f'Enunciado repetido: {qid}/{prompts.get(prompt)}: {q["prompt"]}'
     prompts[prompt]=qid;originals[qid]=q
     if q in questions:original_count+=1
   qcount+=len(questions);challenges+=1
  ready.append(number);index_rows.append({'week':number,'file':path.name,'dayIds':[d['dayId']for d in bank['days']]})
 assert len(ids)==len(set(ids))==364 and len(resources)==len(set(resources))
 if source:assert re.findall(r'<article[^>]+id="(w\d{2}d\d)"',Path(source).read_text())==ids
 if not partial:
  status=json.loads((ROOT/'data/content-status.json').read_text())
  assert status['readyWeeks']==ready==list(range(1,53))
  assert status['sessionCount']==status['assessmentReadySessions']==364 and status['contentOnlySessions']==0
  index=json.loads((ROOT/'data/assessments/index.json').read_text())
  assert index['weeks']==index_rows and index['sessionCount']==364
 report={'weeks':52,'sessions':364,'readyWeeks':ready,'questions':qcount,'originalQuestions':original_count,'explicitSpacedReviews':review_count,'challenges':challenges,'uniqueResourceIds':len(resources),'checks':'passed','scope':'Validación estructural, origen del repaso y duplicados; no acredita preparación para un examen externo.'}
 print(json.dumps(report,ensure_ascii=False,indent=2));return report
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',nargs='?');parser.add_argument('--partial',action='store_true')
 args=parser.parse_args();validate(args.source,args.partial)

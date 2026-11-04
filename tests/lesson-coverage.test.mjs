import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLessonLibrary} from '../assets/js/lessons.js';
import {renderProfessorLesson} from '../assets/js/lessons-ui.js';
import {lessonPhotos} from '../assets/js/lesson-photos.js';

test('all shipped classes satisfy the browser loader and render every original topic and visual',async()=>{
  const curriculum=JSON.parse(await readFile(new URL('../data/curriculum.json',import.meta.url),'utf8'));
  const library=createLessonLibrary(curriculum,{fetcher:async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))})});
  let lessons=0,topics=0,visuals=0;
  const questions=new Set();
  for(const week of curriculum.weeks){
    const material=await library.loadWeek(week.number);
    for(const original of week.days){
      const lesson=library.getDay(original.id);
      assert.ok(lesson,original.id);
      const html=renderProfessorLesson(lesson,{week:week.number,sources:material.sources});
      assert.ok(html.includes(`data-professor-day="${original.id}"`));
      const count=(html.match(/class="lesson-diagram diagram-/g)||[]).length;
      assert.equal(count,original.topics.length+1,original.id);
      assert.ok(html.includes(`#day/${original.id}/resources`),'the lesson must retain the original session resources');
      assert.ok(!questions.has(lesson.check.question),'formative questions must be distinct across the course');
      questions.add(lesson.check.question);
      lessons++;topics+=lesson.sections.length;visuals+=count;
    }
  }
  assert.deepEqual({lessons,topics,visuals},{lessons:364,topics:369,visuals:733});
});

test('teaching photos exist as WebP files and give every week a captioned, accessible scene',async()=>{
  const assigned=new Set();
  for(const photo of lessonPhotos){
    assert.ok(photo.alt&&photo.caption);
    assert.match(photo.src,/^\.\/assets\/images\/lessons\/[a-z-]+\.webp$/);
    const bytes=await readFile(new URL('../'+photo.src,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
    for(const number of photo.weeks){assert.ok(!assigned.has(number),'weekly context photos must have an unambiguous mapping');assigned.add(number);}
  }
  assert.deepEqual([...assigned].sort((a,b)=>a-b),Array.from({length:52},(_,index)=>index+1));
});

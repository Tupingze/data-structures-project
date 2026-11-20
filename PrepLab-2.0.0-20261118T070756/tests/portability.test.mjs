import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackup,parseBackup,validateState,validateQuestion} from '../dist/portability.js';
import {DEFAULT_QUESTIONS,DEFAULT_PROFILE} from '../dist/domain.js';
function fixture(){const q=structuredClone(DEFAULT_QUESTIONS[0]);const s={id:'session-1',profile:{...DEFAULT_PROFILE},questions:[q],index:0,elapsed:41,paused:false,startedAt:'2026-11-17T00:00:00.000Z',finishedAt:'2026-11-17T00:01:00.000Z',answers:[{questionId:q.id,text:'繁體中文 🙂\nint a = 1;\n',code:'if (x < 3) {\n  return "<>";\n}',followupText:'補充',aiFeedback:{data:{summary:'回答摘要',strengths:[],improvements:[],unassessed:[]},meta:{model:'test-model'}}}],drafts:{[q.id]:{text:'未清除草稿'}},customMetadata:{version:'future-compatible'}};return {profile:{...DEFAULT_PROFILE},questions:structuredClone(DEFAULT_QUESTIONS),history:[s],active:null};}
test('full data and binary audio roundtrip preserves every supported value',async()=>{const state=fixture(),r={id:'audio-1',sessionId:'session-1',questionId:state.questions[0].id,slot:'main',createdAt:'2026-11-17T00:00:00Z',blob:new Blob([new Uint8Array([0,255,10,128])],{type:'audio/webm'})};const parsed=await parseBackup(JSON.stringify(await createBackup(state,[r])));assert.deepEqual(parsed.state,state);assert.deepEqual(new Uint8Array(await parsed.recordings[0].blob.arrayBuffer()),new Uint8Array([0,255,10,128]));assert.equal(parsed.recordings[0].blob.type,'audio/webm');});
test('unfinished session drafts and empty recordings roundtrip',async()=>{const state=fixture();state.active=state.history.shift();delete state.active.finishedAt;assert.deepEqual((await parseBackup(await createBackup(state))).state,state);});
test('corruption is rejected before any storage writes',async()=>{const b=await createBackup(fixture());b.state.history[0].answers[0].text='modified';await assert.rejects(()=>parseBackup(b),/完整性/);});
test('future formats rejected explicitly',async()=>{const b=await createBackup(fixture());b.formatVersion=999;await assert.rejects(()=>parseBackup(b),/版本/);});
test('legacy supported state preserves metadata',async()=>{const s=fixture();const r=await parseBackup(JSON.stringify(s));assert.equal(r.legacy,true);assert.deepEqual(r.state,s);});
test('prototype names, secret fields and orphan recordings rejected',async()=>{const s=fixture();s.authorization='secret';assert.throws(()=>validateState(s),/憑證/);await assert.rejects(()=>parseBackup('{"__proto__":{"polluted":true}}'),/不安全/);const r={id:'audio',sessionId:'missing',questionId:'missing',createdAt:new Date().toISOString(),blob:new Blob(['audio'],{type:'audio/webm'})};await assert.rejects(()=>createBackup(fixture(),[r]),/不存在/);assert.equal({}.polluted,undefined);});
test('invalid progress, duplicate sessions and excessive text are rejected',()=>{const s=fixture();s.history[0].index=9;assert.throws(()=>validateState(s),/進度/);s.history[0].index=0;s.history.push(s.history[0]);assert.throws(()=>validateState(s),/重複/);const big=fixture();big.extra='a'.repeat(4*1024*1024);assert.throws(()=>validateState(big),/3 MB/);});

test('legacy backup rejects malformed AI feedback before reports can render it',async()=>{
  for(const corrupt of [false,[],{}, {data:{},meta:{model:'test'}}, {data:{summary:'s',strengths:null,improvements:[],unassessed:[]},meta:{model:'test'}}, {data:{summary:'s',strengths:[{point:'p',evidence:{}}],improvements:[],unassessed:[]},meta:{model:'test'}}, {data:{summary:'s',strengths:[],improvements:[{point:'p',evidence:''}],unassessed:[]},meta:{model:'test'}}, {data:{summary:'s',strengths:[],improvements:[],unassessed:[42]},meta:{model:'test'}}]){
    const state=fixture();state.history[0].answers[0].aiFeedback=corrupt;await assert.rejects(()=>parseBackup(JSON.stringify(state)),/AI 回饋/);
  }
});
test('AI comparison and metadata fields are validated in answers and unfinished drafts',async()=>{
  const valid={data:{summary:'s',changes:[{point:'p',before:'原回答',after:'新回答'}],remaining:['驗證方法']},meta:{model:'test',promptVersion:'2',generatedAt:'2026-11-18T00:00:00Z',usage:{input_tokens:10,output_tokens:5,total_tokens:15}}};
  for(const mutate of [v=>{v.data.changes='wrong';},v=>{v.data.changes[0].after=1;},v=>{v.data.remaining={};},v=>{v.meta=null;},v=>{v.meta.model=42;},v=>{v.meta.generatedAt='invalid';},v=>{v.meta.usage.input_tokens=-1;},v=>{v.meta.usage=[];}]){
    const state=fixture(),result=structuredClone(valid);mutate(result);state.history[0].drafts[state.questions[0].id].aiComparison=result;await assert.rejects(()=>parseBackup(JSON.stringify(state)),/AI 重答比較/);
  }
  const state=fixture();state.history[0].answers[0].aiComparison=valid;state.history[0].answers[0].aiFeedback.data.futureDetails={reviewer:'team'};state.history[0].answers[0].aiComparison.meta.futureModelDetails={revision:3};assert.deepEqual((await parseBackup(await createBackup(state))).state,state);
});
test('shared question import validation preserves extensions and rejects unsafe or malformed questions',()=>{
  const q={...structuredClone(DEFAULT_QUESTIONS[0]),futureDetails:{source:'team'}};assert.equal(validateQuestion(q),q);assert.deepEqual(q.futureDetails,{source:'team'});
  for(const patch of [{id:'__proto__'},{title:''},{checks:[{label:'x',keywords:[12]}]},{level:'unsupported'}])assert.throws(()=>validateQuestion({...q,...patch}));
  assert.throws(()=>validateQuestion(JSON.parse('{"__proto__":{},"id":"q"}')),/不安全/);
});

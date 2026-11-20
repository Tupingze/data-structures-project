import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiHandler} from '../server/api.mjs';

const profile={role:'韌體工程師',resume:'我寫過 C++',count:1};
const question={id:'q1',title:'邊界',category:'C++',level:'基礎',prompt:'如何測試？',code:'',followup:'舉例？',hint:'檢查邊界',checks:[]};
const body={action:'followup',requestId:'request-1',profile,question,answer:{text:'我會測試空陣列'}};
const responseData=data=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(data)}]}],usage:{input_tokens:20,output_tokens:10,total_tokens:30}}));
const request=(data=body,headers={},url='http://127.0.0.1:4173/api/interview')=>new Request(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)});
const handler=(extra={},fetchImpl=async()=>responseData({followup:'空陣列應有什麼結果？'}))=>createApiHandler({env:{OPENAI_API_KEY:'fake-test-key',...extra},fetchImpl});

test('health discloses configuration but never key, and missing key does not fake AI',async()=>{
  const api=createApiHandler();const health=await(await api(new Request('http://localhost/api/health'))).json();assert.equal(health.configured,false);assert.equal(health.version,'2.0.0');const r=await api(request());assert.equal(r.status,503);assert.equal((await r.json()).error.code,'AI_NOT_CONFIGURED');
});
test('structured Responses request uses developer instructions, disabled storage and metadata',async()=>{
  let upstream;const api=handler({},async(url,options)=>{upstream={url,options,body:JSON.parse(options.body)};return responseData({followup:'空陣列應有什麼結果？'});});const r=await api(request());assert.equal(r.status,200);const output=await r.json();assert.equal(output.data.followup,'空陣列應有什麼結果？');assert.equal(output.meta.usage.total_tokens,30);assert.equal(upstream.body.store,false);assert.equal(upstream.body.text.format.strict,true);assert.equal(upstream.body.model,'gpt-4.1');assert.equal(upstream.url,'https://api.openai.com/v1/responses');assert.ok(!JSON.stringify(output).includes('fake-test-key'));
});
test('concurrent identical requests share one paid upstream call; changed contents conflict',async()=>{
  let calls=0;const api=handler({},async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return responseData({followup:'空陣列呢？'});});const results=await Promise.all([api(request()),api(request())]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(calls,1);assert.equal((await api(request({...body,answer:{text:'不同內容'}}))).status,409);assert.equal(calls,1);
});
test('failed in-flight requests are deduplicated but a later explicit retry can succeed',async()=>{
  let calls=0;const api=handler({},async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return calls===1?new Response('temporary failure',{status:503}):responseData({followup:'重試成功的追問'});});
  const failed=await Promise.all([api(request()),api(request())]);assert.deepEqual(failed.map(r=>r.status),[502,502]);assert.equal(calls,1);
  const retried=await api(request());assert.equal(retried.status,200);assert.equal((await retried.json()).data.followup,'重試成功的追問');assert.equal(calls,2);
  assert.equal((await api(request())).status,200);assert.equal(calls,2);
});
test('bearer auth protects remote access and cross-origin requests are rejected',async()=>{
  const api=handler({APP_ACCESS_TOKEN:'test-access'});assert.equal((await api(request())).status,401);assert.equal((await api(request(body,{authorization:'Bearer test-access',origin:'https://evil.example'}))).status,403);assert.equal((await api(request(body,{authorization:'Bearer test-access'}))).status,200);assert.equal((await handler()(request(body,{},'https://public.example/api/interview'))).status,503);
});
test('private hosted gate can be explicitly selected; provider errors do not disclose secrets',async()=>{
  const api=handler({TRUST_SITES_GATE:'true'},async()=>new Response('fake-test-key private error',{status:401}));const r=await api(request(body,{},'https://private.example/api/interview'));assert.equal(r.status,502);assert.ok(!(await r.text()).includes('fake-test-key'));
});
test('bad action, empty answer, oversized fields, prototype names and too many questions are refused before network',async()=>{
  let calls=0;const api=handler({},async()=>{calls++;return responseData({});});for(const data of [{...body,action:'__proto__'},{...body,answer:{text:''}},{...body,profile:{...profile,resume:'x'.repeat(20001)}},{...body,action:'plan',profile:{...profile,count:6}}])assert.equal((await api(request(data))).status,400);assert.equal(calls,0);
});
test('invalid or unfinished model output never reaches the report as feedback',async()=>{
  for(const value of [new Response(JSON.stringify({status:'incomplete',output:[]})),responseData({unexpected:'yes'}),new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]}))]){const r=await handler({},async()=>value)(request());assert.ok([422,502].includes(r.status));}
});
test('feedback rejects fabricated quoted evidence',async()=>{
  const data={summary:'摘要',strengths:[{point:'測試',evidence:'未曾說過的話'}],improvements:[],unassessed:[]};const api=handler({},async()=>responseData(data));const r=await api(request({...body,action:'feedback'}));assert.equal(r.status,502);assert.equal((await r.json()).error.code,'INVALID_MODEL_OUTPUT');
});
test('feedback accepts exact answer evidence and missing-detail suggestions',async()=>{
  const data={summary:'摘要',strengths:[{point:'測試',evidence:'空陣列'}],improvements:[{point:'尚未提及預期結果',evidence:'',suggestion:'補充回傳值'}],unassessed:['效能']};assert.equal((await handler({},async()=>responseData(data))(request({...body,action:'feedback'}))).status,200);
});
test('plan enforces question count and unique identifiers',async()=>{
  const api=handler({},async()=>responseData({questions:[question,question]}));assert.equal((await api(request({...body,action:'plan',profile:{...profile,count:2},questions:[]}))).status,502);
});
test('generated question IDs are safe and editable question lengths are enforced without truncation',async()=>{
  const invalid=[{id:'__proto__'},{id:'constructor'},{id:'prototype'},{id:'a/b'},{id:'含中文'},{id:'q'.repeat(151)},{title:'t'.repeat(101)},{category:'c'.repeat(51)},{prompt:'p'.repeat(10001)},{code:'c'.repeat(30001)},{followup:'f'.repeat(1001)},{hint:'h'.repeat(3001)},{title:'  '}];
  for(const patch of invalid){const api=handler({},async()=>responseData({questions:[{...question,...patch}]}));assert.equal((await api(request({...body,action:'plan',questions:[]}))).status,502,JSON.stringify(Object.keys(patch)));}
  assert.equal((await handler({},async()=>responseData({questions:[{...question,id:'q_1-abc'}]}))(request({...body,action:'plan',questions:[]}))).status,200);
});
test('JD accepts the same 12000 character limit exposed by the interface',async()=>{
  const api=handler();assert.equal((await api(request({...body,profile:{...profile,jd:'職'.repeat(12000)}}))).status,200);assert.equal((await api(request({...body,requestId:'overlong-jd',profile:{...profile,jd:'職'.repeat(12001)}}))).status,400);
});
test('rate limit applies before new paid calls while cached request remains available',async()=>{
  const api=handler({MAX_REQUESTS_PER_MINUTE:'1'});assert.equal((await api(request())).status,200);assert.equal((await api(request())).status,200);assert.equal((await api(request({...body,requestId:'request-2'}))).status,429);
});
test('Realtime creates native audio session with manual turns and returns only ephemeral credential',async()=>{
  let sent;const api=handler({},async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({value:'ek_example',expires_at:123456789,session:{internal:'not-returned'}}));});const r=await api(request({requestId:'voice-1',profile,question},{},'http://localhost/api/realtime-token'));assert.equal(r.status,200);assert.deepEqual(await r.json(),{value:'ek_example',expiresAt:123456789,model:'gpt-realtime'});assert.equal(sent.url,'https://api.openai.com/v1/realtime/client_secrets');assert.equal(sent.body.session.audio.input.turn_detection,null);assert.deepEqual(sent.body.session.output_modalities,['audio']);assert.equal(sent.body.expires_after.seconds,120);
});
test('malformed JSON and oversized body return bounded client errors',async()=>{
  const api=handler();const malformed=new Request('http://localhost/api/interview',{method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal((await api(malformed)).status,400);assert.equal((await api(request({...body,extra:'x'.repeat(260000)}))).status,413);
});

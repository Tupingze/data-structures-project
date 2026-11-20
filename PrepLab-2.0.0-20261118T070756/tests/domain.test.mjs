import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUESTIONS, DEFAULT_PROFILE, buildQueue,
  analyzeAnswer, compareAnswers, summarizeSession, ensureDraft,
} from '../dist/domain.js';

test('question seed has five unique editable scenarios, three with code', () => {
  assert.equal(DEFAULT_QUESTIONS.length, 5);
  assert.equal(new Set(DEFAULT_QUESTIONS.map((question) => question.id)).size, 5);
  assert.equal(DEFAULT_QUESTIONS.filter((question) => question.code).length, 3);
  assert.match(DEFAULT_PROFILE.jd, /非聯發科真實題庫/);
  for (const question of DEFAULT_QUESTIONS) {
    assert.ok(['基礎', '進階'].includes(question.level));
    assert.ok(question.prompt && question.followup && question.hint);
  }
});

test('queue takes a bounded count and clones editable checks', () => {
  const queue = buildQueue(DEFAULT_QUESTIONS, 3);
  assert.deepEqual(queue.map((q) => q.id), DEFAULT_QUESTIONS.slice(0, 3).map((q) => q.id));
  queue[0].title = 'Changed';
  queue[0].checks[0].keywords.push('new keyword');
  assert.notEqual(DEFAULT_QUESTIONS[0].title, 'Changed');
  assert.ok(!DEFAULT_QUESTIONS[0].checks[0].keywords.includes('new keyword'));
  assert.equal(buildQueue(DEFAULT_QUESTIONS, 99).length, 5);
  assert.equal(buildQueue(DEFAULT_QUESTIONS, -2).length, 0);
  assert.equal(buildQueue(DEFAULT_QUESTIONS, 'invalid').length, 3);
  assert.deepEqual(buildQueue(null, 3), []);
});

test('wordCount counts non-whitespace Unicode code points rather than UTF-16 units', () => {
  assert.equal(analyzeAnswer('中文 😀 A\nB\t').wordCount, 5);
  assert.equal(analyzeAnswer('   \n').wordCount, 0);
  assert.equal(analyzeAnswer(null).wordCount, 0);
});

test('empty answers explicitly disclose non-AI behavior and absent transcription', () => {
  const report = analyzeAnswer('', DEFAULT_QUESTIONS[0]);
  assert.ok(report.checks.every((check) => !check.matched));
  assert.match(report.suggestion, /非 AI/);
  assert.match(report.suggestion, /不會自動轉成文字/);
});

test('literal keyword detection is not represented as correctness or a score', () => {
  const question = { checks: [{ label: '測試方式', keywords: ['test', ''] }] };
  const result = analyzeAnswer('I did NOT TEST this.', question);
  assert.equal(result.checks[0].matched, true);
  assert.match(result.suggestion, /不代表內容正確/);
  assert.ok(!('score' in result));
  assert.ok(!('correct' in result));
  assert.equal(analyzeAnswer('其他內容', question).checks[0].matched, false);
});

test('comparison reports only newly detected topics without guaranteeing improvement', () => {
  const q = DEFAULT_QUESTIONS[0];
  const result = compareAnswers('目標是完成工具', '目標是完成工具，我負責介面並進行測試', q);
  assert.deepEqual(result.newlyMentioned, ['個人貢獻', '驗證方式']);
  assert.deepEqual(compareAnswers('測試', '需求', q).newlyMentioned, ['問題背景']);
  assert.deepEqual(compareAnswers('', '', q).newlyMentioned, []);
});

test('summaries count legitimate answered questions and distinguish retakes', () => {
  const session = {
    questions: DEFAULT_QUESTIONS.slice(0, 3),
    answers: [
      { questionId: 'project-story', text: '我做測試', followupText: '原因', retakeText: '重新說明' },
      { questionId: 'array-boundary', text: '', code: 'return 0;', retakeCode: 'return 1;' },
      { questionId: 'pointer-lifetime', text: '  ', code: '' },
      { questionId: 'unknown', text: '不應計算' },
    ],
  };
  const before = JSON.stringify(session);
  assert.deepEqual(summarizeSession(session), { answered: 2, total: 3, retakes: 2, totalChars: 10 });
  assert.equal(JSON.stringify(session), before);
  assert.deepEqual(summarizeSession(), { answered: 0, total: 0, retakes: 0, totalChars: 0 });
});

test('summary uses most recent record and does not double-count duplicate answers', () => {
  assert.deepEqual(summarizeSession({
    questions: [DEFAULT_QUESTIONS[0]],
    answers: [
      { questionId: 'project-story', text: '舊回答' },
      { questionId: 'project-story', text: '新版' },
    ],
  }), { answered: 1, total: 1, retakes: 0, totalChars: 2 });
});

test('imported prototype-like question IDs create own draft records without prototype pollution', () => {
  const drafts = {};
  const originalPrototype = Object.getPrototypeOf(drafts);
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const draft = ensureDraft(drafts, key, 'int value = 1;');
    assert.ok(Object.hasOwn(drafts, key));
    assert.notEqual(draft, Object.prototype);
    assert.equal(draft.text, '');
    assert.equal(draft.code, 'int value = 1;');
    draft.text = `answer for ${key}`;
    assert.equal(ensureDraft(drafts, key, 'replacement').text, `answer for ${key}`);
  }
  assert.equal(Object.getPrototypeOf(drafts), originalPrototype);
  assert.equal(Object.hasOwn(Object.prototype, 'text'), false);
  const restored = JSON.parse(JSON.stringify(drafts));
  assert.equal(ensureDraft(restored, '__proto__').text, 'answer for __proto__');
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
});

test('draft helper preserves saved edits and repairs invalid records', () => {
  const drafts = { existing: { text: 'saved', code: 'edited', followupText: 'more' }, bad: null };
  assert.equal(ensureDraft(drafts, 'existing', 'original'), drafts.existing);
  assert.equal(ensureDraft(drafts, 'existing').code, 'edited');
  assert.equal(ensureDraft(drafts, 'bad').text, '');
  drafts.partial={text:'saved',extension:'keep'};
  assert.deepEqual(ensureDraft(drafts,'partial','seed'),{text:'saved',code:'seed',followupText:'',followupShown:false,followupPrompt:'',extension:'keep'});
  assert.throws(() => ensureDraft([], 'question'), TypeError);
});

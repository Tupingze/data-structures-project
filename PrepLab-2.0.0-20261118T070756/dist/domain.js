/**
 * PrepLab demo domain. These rules detect literal wording only.
 * They are not AI evaluation and cannot establish technical correctness.
 */
export const DEFAULT_PROFILE = {
  name: '',
  role: '系統軟體／韌體工程師',
  difficulty: '基礎',
  count: 3,
  resume: '',
  jd: '以聯發科公開系統軟體職缺為情境參考：C／C++ 程式設計、作業系統、多執行緒、平台驗證與問題分析。以下題目由本專案設計，並非聯發科真實題庫或內部評分標準。',
};

export const DEFAULT_QUESTIONS = [
  {
    id: 'project-story',
    title: '把專案經驗說清楚',
    category: '專案經驗',
    level: '基礎',
    prompt: '請介紹一個你參與過的程式專案。當時想解決什麼問題？你實際負責哪些工作，又如何確認成果？',
    code: '',
    followup: '如果重新做一次這個專案，你最想調整哪個決定？請說明原因。',
    hint: '可以依「問題、自己的工作、驗證方式」整理回答。還沒完成的部分也可以如實說明。',
    checks: [
      { label: '問題背景', keywords: ['問題', '需求', '目標', '目的', '背景'] },
      { label: '個人貢獻', keywords: ['我負責', '我實作', '我設計', '我開發', '我完成', '我的工作'] },
      { label: '驗證方式', keywords: ['測試', '驗證', '量測', '比較', 'test'] },
    ],
  },
  {
    id: 'array-boundary',
    title: '找出陣列邊界問題',
    category: 'C++ 基礎',
    level: '基礎',
    prompt: '這段程式想計算陣列的總和。請說明可能的問題、你會如何修改，以及會用哪些輸入測試。可以直接編輯程式並解釋你的修改。',
    code: 'int sum(const int* values, int count) {\n    int total = 0;\n    for (int i = 0; i <= count; ++i) {\n        total += values[i];\n    }\n    return total;\n}',
    followup: '如果輸入是空陣列，你的修改會如何處理？你會如何定義 count 的有效範圍？',
    hint: '先說明索引可以取哪些值，再考慮一般輸入與邊界情況。此原型不會執行或驗證程式。',
    checks: [
      { label: '索引與邊界', keywords: ['邊界', '索引', '越界', '超出', 'index', 'count - 1', 'count-1'] },
      { label: '修改理由', keywords: ['小於', '改成', '修改', '條件', 'i < count'] },
      { label: '測試案例', keywords: ['測試', '空陣列', '零個', '一個元素', 'test'] },
    ],
  },
  {
    id: 'pointer-lifetime',
    title: '指標指向的資料還在嗎',
    category: '記憶體管理',
    level: '進階',
    prompt: '請閱讀這段函式，說明回傳的指標可能有什麼問題。你會如何修改介面，讓呼叫端能安全取得結果？',
    code: 'const int* makeValue() {\n    int result = 42;\n    return &result;\n}\n\nint main() {\n    const int* value = makeValue();\n    // 呼叫端接下來會使用 value\n}',
    followup: '如果結果是一組較大的資料，你會如何描述資料的擁有者與使用期限？',
    hint: '從 result 的生命週期開始分析，並說明你的修改由誰管理資料。',
    checks: [
      { label: '資料生命週期', keywords: ['生命週期', '區域變數', '作用域', '失效', 'lifetime', '懸空'] },
      { label: '介面修改', keywords: ['回傳值', '傳值', '值回傳', '改成', '修改', '容器', 'vector'] },
      { label: '所有權', keywords: ['所有權', '擁有者', '呼叫端', '管理', 'ownership'] },
    ],
  },
  {
    id: 'system-buffer',
    title: '資料來不及處理時怎麼辦',
    category: '系統思考',
    level: '進階',
    prompt: '裝置持續收到資料，但處理速度偶爾跟不上。你會如何設計資料緩衝與處理流程？請先提出需要釐清的條件，再描述你的方案。',
    code: '',
    followup: '現在加上一個條件：可用記憶體有上限。緩衝區滿了之後，你會採用什麼策略，為什麼？',
    hint: '可以先確認資料能否遺失、延遲需求與記憶體限制，再討論方案的取捨。',
    checks: [
      { label: '需求釐清', keywords: ['需求', '釐清', '確認', '延遲', '遺失'] },
      { label: '緩衝策略', keywords: ['緩衝', '佇列', 'queue', 'buffer', '背壓'] },
      { label: '限制與取捨', keywords: ['限制', '上限', '取捨', '丟棄', '等待', '記憶體'] },
    ],
  },
  {
    id: 'duplicate-search',
    title: '資料量變大後的效能',
    category: '問題分析',
    level: '進階',
    prompt: '這段程式檢查是否有重複的數字。資料量變大後可能發生什麼事？請提出一個調整方向，並說明你會如何比較修改前後的表現。',
    code: 'bool hasDuplicate(const std::vector<int>& values) {\n    for (size_t i = 0; i < values.size(); ++i) {\n        for (size_t j = i + 1; j < values.size(); ++j) {\n            if (values[i] == values[j]) return true;\n        }\n    }\n    return false;\n}',
    followup: '如果不能使用太多額外記憶體，你會重新選擇哪種方法？請解釋時間與空間的取捨。',
    hint: '先估計目前需要多少次比較，再說明替代方法、額外成本與測試方式。',
    checks: [
      { label: '複雜度分析', keywords: ['複雜度', '平方', 'n²', 'n^2', 'o(n', '比較次數'] },
      { label: '替代方法', keywords: ['排序', '雜湊', 'hash', 'set', 'sort'] },
      { label: '量測與取捨', keywords: ['量測', '測試', '記憶體', '空間', '取捨', '資料量'] },
    ],
  },
];

const asText = (value) => typeof value === 'string' ? value : '';
const nonBlank = (value) => asText(value).trim().length > 0;
// Counts non-whitespace Unicode code points, not words or API tokens.
const textLength = (value) => Array.from(asText(value).replace(/\s/gu, '')).length;

export function ensureDraft(drafts, key, code = '') {
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) {
    throw new TypeError('Draft storage must be an object');
  }
  if (!Object.hasOwn(drafts, key) || !drafts[key] || typeof drafts[key] !== 'object' || Array.isArray(drafts[key])) {
    Object.defineProperty(drafts, key, {
      value: { text: '', code: asText(code), followupText: '', followupShown: false, followupPrompt: '' },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  const value = drafts[key];
  for (const [field, fallback] of Object.entries({text:'', code:asText(code), followupText:'', followupShown:false, followupPrompt:''})) {
    if (value[field] === undefined) value[field] = fallback;
  }
  return value;
}

export function buildQueue(questions = DEFAULT_QUESTIONS, count = 3) {
  const available = Array.isArray(questions) ? questions : [];
  const number = Number(count);
  const take = Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 3;
  return available.slice(0, take).map((question) => ({
    ...question,
    checks: Array.isArray(question.checks)
      ? question.checks.map((check) => ({ ...check, keywords: [...(check.keywords ?? [])] }))
      : [],
  }));
}

export function analyzeAnswer(answer, question = {}) {
  const text = asText(answer);
  const searchable = text.normalize('NFKC').toLocaleLowerCase('zh-TW');
  const checks = (Array.isArray(question?.checks) ? question.checks : []).map((check) => ({
    label: asText(check.label),
    matched: (Array.isArray(check.keywords) ? check.keywords : []).some((keyword) => {
      const normalized = asText(keyword).trim().normalize('NFKC').toLocaleLowerCase('zh-TW');
      return normalized.length > 0 && searchable.includes(normalized);
    }),
  }));
  const missing = checks.find((check) => !check.matched);
  let suggestion;
  if (!nonBlank(text)) {
    suggestion = '尚未輸入文字回答。此處是非 AI 的規則式示範，請先補上你的說明；錄音內容不會自動轉成文字。';
  } else if (missing) {
    suggestion = `示範檢核：尚未找到「${missing.label}」的設定關鍵詞。可以檢查是否需要補充相關說明；這不代表你沒有回答，也不是技術正確性的判定。`;
  } else {
    suggestion = '示範檢核：已找到各項設定關鍵詞。關鍵詞出現不代表內容正確或完整，仍需人工或後續 AI 評估。';
  }
  return {
    wordCount: textLength(text),
    checks,
    suggestion,
    followup: asText(question?.followup) || '請補充一個具體例子，以及你會如何確認結果。',
  };
}

export function compareAnswers(before, after, question = {}) {
  const first = analyzeAnswer(before, question);
  const second = analyzeAnswer(after, question);
  return {
    before: first,
    after: second,
    newlyMentioned: second.checks
      .filter((check, index) => check.matched && !first.checks[index]?.matched)
      .map((check) => check.label),
  };
}

export function summarizeSession(session = {}) {
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const validIds = new Set(questions.map((question) => question.id));
  const answers = Array.isArray(session?.answers) ? session.answers : [];
  const latestAnswers = new Map();
  for (const answer of answers) {
    if (answer && validIds.has(answer.questionId)) latestAnswers.set(answer.questionId, answer);
  }
  const records = [...latestAnswers.values()];
  return {
    answered: records.filter((answer) => nonBlank(answer.text) || nonBlank(answer.code)).length,
    total: questions.length,
    retakes: records.filter((answer) => nonBlank(answer.retakeText) || nonBlank(answer.retakeCode)).length,
    totalChars: records.reduce((total, answer) => total + textLength(answer.text) + textLength(answer.followupText) + textLength(answer.retakeText), 0),
  };
}

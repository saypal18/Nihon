import { extractUniqueKanji, isKanji, filterSentenceByAllowedKanji } from '../lib/kanji';
import { Sentence } from '../lib/types';

console.log('--- TESTING KANJI UTILITIES AND FILTERING ---');

// Test 1: isKanji
console.log('Test 1: isKanji detection');
if (!isKanji('猫')) throw new Error('猫 should be kanji');
if (!isKanji('日')) throw new Error('日 should be kanji');
if (isKanji('あ')) throw new Error('あ should not be kanji');
if (isKanji('ア')) throw new Error('ア should not be kanji');
if (isKanji('!')) throw new Error('! should not be kanji');
console.log('✓ Test 1 Passed: isKanji accurately differentiates Kanji from Kana and punctuation');

// Test 2: extractUniqueKanji
console.log('Test 2: extractUniqueKanji');
const sample = '吾輩は猫である。名前はまだ無い。猫！';
const extracted = extractUniqueKanji(sample);
const expected = ['吾', '輩', '猫', '名', '前', '無'];
if (JSON.stringify(extracted) !== JSON.stringify(expected)) {
  throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(extracted)}`);
}
console.log('✓ Test 2 Passed: extractUniqueKanji returned unique kanji in order:', extracted);

// Test 3: filterSentenceByAllowedKanji
console.log('Test 3: filterSentenceByAllowedKanji');
const testSentence: Sentence = {
  id: 1,
  original: '吾輩は猫である。名前はまだ無い。',
  hiragana: 'わがはいはねこである。なまえはまだない。',
  katakana: 'ワガハイハネコデアル。ナマエハマダナイ。',
  translation: 'I am a cat. I have no name yet.',
  tokens: [
    { surface: '吾輩', reading: 'ワガハイ', hiragana: 'わがはい', is_punctuation: false },
    { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false },
    { surface: '猫', reading: 'ネコ', hiragana: 'ねこ', is_punctuation: false },
    { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false },
    { surface: 'ある', reading: 'アル', hiragana: 'ある', is_punctuation: false },
    { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
    { surface: '名前', reading: 'ナマエ', hiragana: 'なまえ', is_punctuation: false },
    { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false },
    { surface: 'まだ', reading: 'マダ', hiragana: 'まだ', is_punctuation: false },
    { surface: '無い', reading: 'ナイ', hiragana: 'ない', is_punctuation: false },
    { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
  ],
};

const allowedSet = new Set(['猫']);
const filtered = filterSentenceByAllowedKanji(testSentence, allowedSet);

if (filtered.original !== 'わがはいは猫である。なまえはまだない。') {
  throw new Error(`Unexpected filtered original: ${filtered.original}`);
}
console.log('Filtered original:', filtered.original);
console.log('✓ Test 3 Passed: unallowed kanji converted to hiragana while allowed kanji retained');

console.log('=== ALL KANJI TESTS PASSED! ===');

import { weakItemsManager, calculateStatus } from '../lib/weakItemsManager';
import { Sentence } from '../lib/types';
import { isKanji, alignTokenCharacters } from '../lib/kanji';

console.log('--- TESTING WEAK WORDS & CHARACTERS DETECTOR ---');

// Mock test sentence
const mockSentence: Sentence = {
  id: 1,
  original: '吾輩は猫である。名前はまだ無い。',
  hiragana: 'わがはいはねこである。なまえはまだない。',
  katakana: 'ワガハイハネコデアル。ナマエハマダナイ。',
  translation: 'I am a cat. I have no name yet.',
  tokens: [
    { surface: '吾輩', reading: 'ワガハイ', hiragana: 'わがはい', is_punctuation: false, dictionary_form: '吾輩' },
    { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false, dictionary_form: 'は' },
    { surface: '猫', reading: 'ネコ', hiragana: 'ねこ', is_punctuation: false, dictionary_form: '猫' },
    { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false, dictionary_form: 'だ' },
    { surface: 'ある', reading: 'アル', hiragana: 'ある', is_punctuation: false, dictionary_form: 'ある' },
    { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
    { surface: '名前', reading: 'ナマエ', hiragana: 'なまえ', is_punctuation: false, dictionary_form: '名前' },
    { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false, dictionary_form: 'は' },
    { surface: 'まだ', reading: 'マダ', hiragana: 'まだ', is_punctuation: false, dictionary_form: 'まだ' },
    { surface: '無い', reading: 'ナイ', hiragana: 'ない', is_punctuation: false, dictionary_form: '無い' },
    { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
  ],
};

// Clear existing items before starting tests
weakItemsManager.clearCategory('words');
weakItemsManager.clearCategory('kanji');
weakItemsManager.clearCategory('hiragana');
weakItemsManager.clearCategory('katakana');

// Test 1: Single mistake registers across Word, Kanji, and Hiragana
console.log('Test 1: Single mistake detection across 4 categories');
{
  const flagged = {
    tokens: new Set<string>(),
    kanji: new Set<string>(),
    kana: new Set<string>(),
  };

  // Mistake at index 0 ('わ' of '吾輩')
  weakItemsManager.processPassageMistake(mockSentence, 0, 'original', flagged);

  const words = weakItemsManager.getCategoryItems('words');
  const kanji = weakItemsManager.getCategoryItems('kanji');
  const hiragana = weakItemsManager.getCategoryItems('hiragana');

  if (words.length !== 1 || words[0].text !== '吾輩') {
    throw new Error(`Expected word '吾輩', got ${JSON.stringify(words)}`);
  }
  if (kanji.length !== 1 || kanji[0].text !== '吾') {
    throw new Error(`Expected kanji '吾', got ${JSON.stringify(kanji)}`);
  }
  if (hiragana.length !== 1 || hiragana[0].text !== 'わ') {
    throw new Error(`Expected hiragana 'わ', got ${JSON.stringify(hiragana)}`);
  }

  console.log('✓ Test 1 Passed: Mistake correctly recorded to Words, Kanji, and Hiragana');
}

// Test 2: Anti-multicount: Repeated typos at the same point in passage count as 1 mistake
console.log('Test 2: Anti-multicount on repeated typos at identical passage point');
{
  const flagged = {
    tokens: new Set<string>(),
    kanji: new Set<string>(),
    kana: new Set<string>(),
  };

  // Simulate 10 repeated typo strokes on 'ね' (index 5) in '猫'
  for (let stroke = 0; stroke < 10; stroke++) {
    weakItemsManager.processPassageMistake(mockSentence, 5, 'original', flagged);
  }

  const nekoWord = weakItemsManager.getCategoryItems('words').find((w) => w.text === '猫');
  const nekoKanji = weakItemsManager.getCategoryItems('kanji').find((k) => k.text === '猫');
  const neKana = weakItemsManager.getCategoryItems('hiragana').find((h) => h.text === 'ね');

  if (!nekoWord || nekoWord.mistakes !== 1) {
    throw new Error(`Expected nekoWord mistakes = 1, got ${nekoWord?.mistakes}`);
  }
  if (!nekoKanji || nekoKanji.mistakes !== 1) {
    throw new Error(`Expected nekoKanji mistakes = 1, got ${nekoKanji?.mistakes}`);
  }
  if (!neKana || neKana.mistakes !== 1) {
    throw new Error(`Expected neKana mistakes = 1, got ${neKana?.mistakes}`);
  }

  console.log('✓ Test 2 Passed: 10 repeated keystrokes at same point strictly counted as 1 mistake');
}

// Test 3: Katakana script mode mistakes route to Katakana list
console.log('Test 3: Katakana script mode routing');
{
  const flagged = {
    tokens: new Set<string>(),
    kanji: new Set<string>(),
    kana: new Set<string>(),
  };

  // Mistake on 'こ' (index 6) in katakana mode
  weakItemsManager.processPassageMistake(mockSentence, 6, 'katakana', flagged);

  const katakanaItems = weakItemsManager.getCategoryItems('katakana');
  const koItem = katakanaItems.find((k) => k.text === 'コ');

  if (!koItem || koItem.mistakes !== 1) {
    throw new Error(`Expected katakana 'コ', got ${JSON.stringify(katakanaItems)}`);
  }

  console.log('✓ Test 3 Passed: Katakana mistake routed to Katakana list as コ');
}

// Test 4: Clean Streak & Auto-removal upon graduation (3 clean runs)
console.log('Test 4: Clean streak progression and auto-removal');
{
  weakItemsManager.updateSettings({ autoRemoveOnMastery: true, masteryStreakThreshold: 3 });

  // Currently '猫' has 1 mistake and cleanStreak = 0
  let neko = weakItemsManager.getCategoryItems('words').find((w) => w.text === '猫');
  if (!neko || neko.cleanStreak !== 0) throw new Error('Expected initial streak 0');

  // Clean run 1
  weakItemsManager.recordCleanEncounter('words', '猫');
  neko = weakItemsManager.getCategoryItems('words').find((w) => w.text === '猫');
  if (!neko || neko.cleanStreak !== 1 || neko.status !== 'practicing') {
    throw new Error(`Expected streak 1 & practicing, got streak ${neko?.cleanStreak}, status ${neko?.status}`);
  }

  // Clean run 2
  weakItemsManager.recordCleanEncounter('words', '猫');
  neko = weakItemsManager.getCategoryItems('words').find((w) => w.text === '猫');
  if (!neko || neko.cleanStreak !== 2 || neko.status !== 'improving') {
    throw new Error(`Expected streak 2 & improving, got streak ${neko?.cleanStreak}, status ${neko?.status}`);
  }

  // Clean run 3 -> Reaches threshold 3 -> Auto-removed!
  weakItemsManager.recordCleanEncounter('words', '猫');
  neko = weakItemsManager.getCategoryItems('words').find((w) => w.text === '猫');
  if (neko) {
    throw new Error(`Expected '猫' to be auto-removed upon reaching threshold 3, but found: ${JSON.stringify(neko)}`);
  }

  console.log('✓ Test 4 Passed: Clean streak reached 3 and item automatically graduated / removed');
}

// Test 5: Manual Add, Delete, and Export formatting
console.log('Test 5: Manual Add, Delete, and Export');
{
  // Add manual word
  const added = weakItemsManager.addItem('words', '珈琲', {
    reading: 'コーヒー',
    meaning: 'coffee',
  });
  if (!added) throw new Error('Failed to add manual word');

  let coffee = weakItemsManager.getCategoryItems('words').find((w) => w.text === '珈琲');
  if (!coffee || coffee.meaning !== 'coffee' || coffee.reading !== 'コーヒー') {
    throw new Error(`Expected coffee item, got ${JSON.stringify(coffee)}`);
  }

  // Export as text
  const exported = weakItemsManager.exportCategoryText('words', 'lines');
  if (!exported.includes('珈琲') || !exported.includes('coffee')) {
    throw new Error(`Expected export to include coffee, got: ${exported}`);
  }

  // Delete
  const deleted = weakItemsManager.deleteItem('words', '珈琲');
  if (!deleted) throw new Error('Failed to delete coffee');
  coffee = weakItemsManager.getCategoryItems('words').find((w) => w.text === '珈琲');
  if (coffee) throw new Error('Item was not deleted');

  console.log('✓ Test 5 Passed: Manual addition, TSV/line export, and deletion verified');
}

// Test 6: Status calculation tiers
console.log('Test 6: Status tier logic');
{
  if (calculateStatus(1, 0, 3) !== 'practicing') throw new Error('Expected practicing');
  if (calculateStatus(3, 0, 3) !== 'critical') throw new Error('Expected critical for 3 mistakes');
  if (calculateStatus(5, 2, 3) !== 'improving') throw new Error('Expected improving for streak 2');
  if (calculateStatus(5, 3, 3) !== 'mastered') throw new Error('Expected mastered for streak 3');

  console.log('✓ Test 6 Passed: Status tiers (critical, practicing, improving, mastered) verified');
}

console.log('=== ALL WEAK DETECTOR TESTS PASSED! ===');

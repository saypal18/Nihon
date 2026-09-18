import { EmielTypingSession } from '../lib/emielAdapter';
import { Sentence } from '../lib/types';
import { InputEvent, InputStroke, KeyboardState, VirtualKey, VirtualKeys } from 'emiel';

function makeSentence(hiragana: string): Sentence {
  return {
    id: 1,
    original: hiragana,
    hiragana,
    katakana: hiragana,
    translation: 'Test',
  };
}

function charToVirtualKey(c: string): VirtualKey {
  if (c === '.') return VirtualKeys.Period;
  if (c === ',') return VirtualKeys.Comma;
  if (c === '!') return VirtualKeys.Digit1; // or direct
  if (c === '?') return VirtualKeys.Slash;
  if (c === ' ') return VirtualKeys.Space;
  if (c === '-') return VirtualKeys.Minus;
  const upper = c.toUpperCase();
  if (upper in VirtualKeys) {
    return upper as VirtualKey;
  }
  return VirtualKeys.Space;
}

function typeString(session: EmielTypingSession, keys: string[]) {
  const kbState = new KeyboardState();
  const results = [];
  let time = performance.now();

  for (const k of keys) {
    time += 20;
    if (k === 'Backspace') {
      const evt = new InputEvent(
        new InputStroke(VirtualKeys.Backspace, 'keydown'),
        kbState,
        time
      );
      results.push(session.processInputEvent(evt));
    } else {
      const vKey = charToVirtualKey(k);
      const evt = new InputEvent(
        new InputStroke(vKey, 'keydown'),
        kbState,
        time
      );
      results.push(session.processInputEvent(evt));
    }
  }
  return results;
}

console.log('--- TESTING EMIEL + WANAKANA ADAPTER ---');

// Test 1: し (shi, si, ci)
console.log('Test 1: Variants for し with emiel');
for (const variant of ['shi', 'si', 'ci']) {
  const session = new EmielTypingSession(makeSentence('し'));
  typeString(session, variant.split(''));
  if (!session.isComplete) {
    throw new Error(`Emiel failed variant for し: ${variant}`);
  }
}
console.log('✓ Test 1 Passed: shi, si, ci all completed し');

// Test 2: つ (tsu, tu)
console.log('Test 2: Variants for つ with emiel');
for (const variant of ['tsu', 'tu']) {
  const session = new EmielTypingSession(makeSentence('つ'));
  typeString(session, variant.split(''));
  if (!session.isComplete) {
    throw new Error(`Emiel failed variant for つ: ${variant}`);
  }
}
console.log('✓ Test 2 Passed: tsu, tu both completed つ');

// Test 3: がっこう (gakkou)
console.log('Test 3: Sokuon geminate consonants with emiel');
{
  const session = new EmielTypingSession(makeSentence('がっこう'));
  typeString(session, 'gakkou'.split(''));
  if (!session.isComplete) {
    throw new Error('Emiel failed gakkou');
  }
}
console.log('✓ Test 3 Passed: gakkou successfully completed がっこう');

// Test 4: しゃ (sha, sya) & ちゃ (cha, tya, cya)
console.log('Test 4: Contracted sounds with emiel');
for (const variant of ['sha', 'sya']) {
  const session = new EmielTypingSession(makeSentence('しゃ'));
  typeString(session, variant.split(''));
  if (!session.isComplete) {
    throw new Error(`Emiel failed variant for しゃ: ${variant}`);
  }
}
for (const variant of ['cha', 'tya', 'cya']) {
  const session = new EmielTypingSession(makeSentence('ちゃ'));
  typeString(session, variant.split(''));
  if (!session.isComplete) {
    throw new Error(`Emiel failed variant for ちゃ: ${variant}`);
  }
}
console.log('✓ Test 4 Passed: sha, sya for しゃ and cha, tya, cya for ちゃ verified');

// Test 5: Mistake Buffering and Backspacing
console.log('Test 5: Mistake buffering and Backspace recovery');
{
  const session = new EmielTypingSession(makeSentence('ねこ'));
  // Type 'n', 'e' -> completes 'ね'
  let res = typeString(session, ['n', 'e']);
  if (session.getCurrentCursor() !== 1) throw new Error('Expected cursor at 1');

  // Type wrong key 'x'
  res = typeString(session, ['x']);
  if ((session.mistakeStack.length as number) !== 1) throw new Error('Expected mistake stack 1');

  // Type another key while in error
  res = typeString(session, ['z']);
  if ((session.mistakeStack.length as number) !== 2) throw new Error('Expected mistake stack 2');

  // Backspace once
  res = typeString(session, ['Backspace']);
  if ((session.mistakeStack.length as number) !== 1) throw new Error('Expected mistake stack 1 after BS');

  // Backspace twice
  res = typeString(session, ['Backspace']);
  if ((session.mistakeStack.length as number) !== 0) throw new Error('Expected mistake stack 0 after BS');

  // Finish 'k', 'o'
  res = typeString(session, ['k', 'o']);
  if (!session.isComplete) throw new Error('Expected completion after clearing mistake');
}
console.log('✓ Test 5 Passed: Mistake buffering and backspace recovery verified');

// Test 6: In-Flight Roman Buffer and Compound Kana (kya)
console.log('Test 6: In-Flight Roman Buffer and Compound Kana (kya)');
{
  const session = new EmielTypingSession(makeSentence('きゃく'));
  let res = typeString(session, ['k']);
  if (res[0].inFlightRoman !== 'k') throw new Error(`Expected inFlight 'k', got '${res[0].inFlightRoman}'`);
  if (res[0].parsedRoman !== '') throw new Error(`Expected parsedRoman '', got '${res[0].parsedRoman}'`);
  if (res[0].pendingRoman !== 'yaku') throw new Error(`Expected pendingRoman 'yaku', got '${res[0].pendingRoman}'`);
  if (res[0].finishedKanaLength !== 0) throw new Error('Expected finishedKanaLength 0');

  res = typeString(session, ['y']);
  if (res[0].inFlightRoman !== 'ky') throw new Error(`Expected inFlight 'ky', got '${res[0].inFlightRoman}'`);
  if (res[0].parsedRoman !== '') throw new Error(`Expected parsedRoman '', got '${res[0].parsedRoman}'`);
  if (res[0].pendingRoman !== 'aku') throw new Error(`Expected pendingRoman 'aku', got '${res[0].pendingRoman}'`);
  if (res[0].finishedKanaLength !== 0) throw new Error('Expected finishedKanaLength 0');

  // Add mistake
  res = typeString(session, ['x']);
  if (res[0].inFlightRoman !== 'ky') throw new Error('Expected inFlight to remain ky');
  if (res[0].bufferedMistakes !== 'X') throw new Error(`Expected bufferedMistakes 'X', got '${res[0].bufferedMistakes}'`);

  // Clear mistake
  res = typeString(session, ['Backspace']);
  if (res[0].bufferedMistakes !== '') throw new Error('Expected mistakes cleared');
  if (res[0].inFlightRoman !== 'ky') throw new Error('Expected inFlight ky after mistake backspaced');

  // Type 'a' -> should complete 'きゃ' (length 2) and clear inFlightRoman
  res = typeString(session, ['a']);
  if (res[0].finishedKanaLength !== 2) throw new Error(`Expected finishedKanaLength 2, got ${res[0].finishedKanaLength}`);
  if (res[0].parsedRoman !== 'kya') throw new Error(`Expected parsedRoman 'kya', got '${res[0].parsedRoman}'`);
  if (res[0].pendingRoman !== 'ku') throw new Error(`Expected pendingRoman 'ku', got '${res[0].pendingRoman}'`);
  if (res[0].inFlightRoman !== '') throw new Error(`Expected inFlight empty, got '${res[0].inFlightRoman}'`);

  // Type 'k'
  res = typeString(session, ['k']);
  if (res[0].inFlightRoman !== 'k') throw new Error(`Expected inFlight 'k', got '${res[0].inFlightRoman}'`);
  if (res[0].parsedRoman !== 'kya') throw new Error(`Expected parsedRoman 'kya', got '${res[0].parsedRoman}'`);
  if (res[0].pendingRoman !== 'u') throw new Error(`Expected pendingRoman 'u', got '${res[0].pendingRoman}'`);

  // Type 'u' -> should finish whole word
  res = typeString(session, ['u']);
  if (res[0].finishedKanaLength !== 3) throw new Error(`Expected finishedKanaLength 3, got ${res[0].finishedKanaLength}`);
  if (res[0].parsedRoman !== 'kyaku') throw new Error(`Expected parsedRoman 'kyaku', got '${res[0].parsedRoman}'`);
  if (res[0].pendingRoman !== '') throw new Error(`Expected pendingRoman '', got '${res[0].pendingRoman}'`);
  if (res[0].inFlightRoman !== '') throw new Error('Expected inFlight empty on completion');
  if (!session.isComplete) throw new Error('Expected session to be complete');
}
console.log('✓ Test 6 Passed: In-flight Roman buffer and compound kana verified');

console.log('=== ALL EMIEL ADAPTER TESTS PASSED! ===');

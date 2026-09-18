import { Sentence } from './types';

// Browser Web Speech API text-to-speech utility for Japanese pronunciation

let activeUtterance: SpeechSynthesisUtterance | null = null;
let currentOnEnd: (() => void) | null = null;

/**
 * Derives the most accurate phonetic pronunciation string from tokens/hiragana,
 * ensuring particles like は (wa) and へ (e) and kanji verbs like 下りたり (oritari)
 * are read with exact phonetic accuracy without browser TTS dictionary misreadings.
 */
export function getPronunciationText(sentence: Sentence): string {
  if (sentence.tokens && sentence.tokens.length > 0) {
    return sentence.tokens
      .map((t) => {
        if (t.surface === 'は' && !t.is_punctuation) return 'わ';
        if (t.surface === 'へ' && !t.is_punctuation) return 'え';
        return t.hiragana;
      })
      .join('');
  }
  return sentence.hiragana || sentence.original;
}

export function speakJapanese(
  input: Sentence | string,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  // Cancel any ongoing speech so only this sentence is read
  stopSpeech();

  const textToSpeak = typeof input === 'string' ? input : getPronunciationText(input);

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((v) =>
    v.lang.replace('_', '-').toLowerCase().startsWith('ja')
  );
  if (jaVoice) {
    utterance.voice = jaVoice;
  }

  currentOnEnd = onEnd || null;

  utterance.onstart = () => {
    onStart?.();
  };

  const handleEnd = () => {
    if (currentOnEnd === onEnd) {
      currentOnEnd = null;
    }
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
    onEnd?.();
  };

  utterance.onend = handleEnd;
  utterance.onerror = handleEnd;

  activeUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (currentOnEnd) {
      currentOnEnd();
      currentOnEnd = null;
    }
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }
}

import {
  build,
  loadPresetRuleRoman,
  loadPresetKeyboardLayoutQwertyUs,
  createDirectInputRule,
  activate,
  VirtualKeys,
  InputEvent,
  type Automaton,
} from 'emiel';
import * as wanakana from 'wanakana';
import { Sentence } from './types';

export interface EmielKeyResult {
  type: 'KEY_SUCCEEDED' | 'KANA_SUCCEEDED' | 'FINISHED' | 'FAILED' | 'BACK' | 'IGNORED';
  finishedKanaLength: number;
  finishedWord: string;
  pendingWord: string;
  finishedRoman: string;
  pendingRoman: string;
  mistakeCount: number;
}

export class EmielTypingSession {
  sentence: Sentence;
  normalizedHiragana: string;
  automaton: Automaton;
  mistakeStack: string[] = [];
  correctKeystrokes: number = 0;
  incorrectKeystrokes: number = 0;
  totalKeystrokes: number = 0;
  kanaErrors: Record<string, { attempts: number; errors: number }> = {};
  isComplete: boolean = false;

  constructor(sentence: Sentence) {
    this.sentence = sentence;
    // Normalize to standard Hiragana using WanaKana
    this.normalizedHiragana = wanakana.toHiragana(sentence.hiragana);

    // Build Mozc Roman rule merged with direct input for punctuation/spaces
    const layout = loadPresetKeyboardLayoutQwertyUs();
    const romanRule = loadPresetRuleRoman(layout);
    const directRule = createDirectInputRule(layout);
    const combinedRule = romanRule.merge(directRule);

    this.automaton = build(combinedRule, this.normalizedHiragana);
  }

  /**
   * Process an emiel InputEvent generated from browser keydown.
   */
  processInputEvent(event: InputEvent): EmielKeyResult {
    if (this.isComplete) {
      const view = this.automaton.currentView();
      return {
        type: 'IGNORED',
        finishedKanaLength: view.finishedWord.length,
        finishedWord: view.finishedWord,
        pendingWord: view.pendingWord,
        finishedRoman: view.finishedRoman,
        pendingRoman: view.pendingRoman,
        mistakeCount: this.mistakeStack.length,
      };
    }

    // Active character for stats
    const viewBefore = this.automaton.currentView();
    const activeChar = viewBefore.pendingWord[0] || 'unknown';
    if (!this.kanaErrors[activeChar]) {
      this.kanaErrors[activeChar] = { attempts: 0, errors: 0 };
    }

    // Handle Backspace
    if (event.input.key === VirtualKeys.Backspace) {
      if (this.mistakeStack.length > 0) {
        this.mistakeStack.pop();
      } else {
        // Step back one stroke in Emiel
        this.automaton.back();
      }
      const view = this.automaton.currentView();
      return {
        type: 'BACK',
        finishedKanaLength: view.finishedWord.length,
        finishedWord: view.finishedWord,
        pendingWord: view.pendingWord,
        finishedRoman: view.finishedRoman,
        pendingRoman: view.pendingRoman,
        mistakeCount: this.mistakeStack.length,
      };
    }

    // Case 1: If mistake stack is not empty, buffer any new keystroke as error
    if (this.mistakeStack.length > 0) {
      this.mistakeStack.push(event.input.key);
      this.totalKeystrokes++;
      this.incorrectKeystrokes++;
      this.kanaErrors[activeChar].errors++;
      return {
        type: 'FAILED',
        finishedKanaLength: viewBefore.finishedWord.length,
        finishedWord: viewBefore.finishedWord,
        pendingWord: viewBefore.pendingWord,
        finishedRoman: viewBefore.finishedRoman,
        pendingRoman: viewBefore.pendingRoman,
        mistakeCount: this.mistakeStack.length,
      };
    }

    // Case 2: Process with Emiel Mozc Automaton
    const result = this.automaton.input(event);
    const viewAfter = this.automaton.currentView();

    if (result.isSucceeded) {
      this.totalKeystrokes++;
      this.correctKeystrokes++;
      this.kanaErrors[activeChar].attempts++;

      // Check if finished
      if (result.isFinished || (viewAfter.pendingWord.length === 0 && viewAfter.pendingRoman.length === 0)) {
        this.isComplete = true;
        return {
          type: 'FINISHED',
          finishedKanaLength: viewAfter.finishedWord.length,
          finishedWord: viewAfter.finishedWord,
          pendingWord: viewAfter.pendingWord,
          finishedRoman: viewAfter.finishedRoman,
          pendingRoman: viewAfter.pendingRoman,
          mistakeCount: 0,
        };
      }

      return {
        type: result.isKanaSucceeded ? 'KANA_SUCCEEDED' : 'KEY_SUCCEEDED',
        finishedKanaLength: viewAfter.finishedWord.length,
        finishedWord: viewAfter.finishedWord,
        pendingWord: viewAfter.pendingWord,
        finishedRoman: viewAfter.finishedRoman,
        pendingRoman: viewAfter.pendingRoman,
        mistakeCount: 0,
      };
    } else if (result.isBack) {
      if (this.mistakeStack.length > 0) {
        this.mistakeStack.pop();
      } else {
        this.automaton.back();
      }
      const view = this.automaton.currentView();
      return {
        type: 'BACK',
        finishedKanaLength: view.finishedWord.length,
        finishedWord: view.finishedWord,
        pendingWord: view.pendingWord,
        finishedRoman: view.finishedRoman,
        pendingRoman: view.pendingRoman,
        mistakeCount: this.mistakeStack.length,
      };
    } else if (result.isFailed) {
      this.totalKeystrokes++;
      this.incorrectKeystrokes++;
      this.kanaErrors[activeChar].attempts++;
      this.kanaErrors[activeChar].errors++;
      this.mistakeStack.push(event.input.key);

      return {
        type: 'FAILED',
        finishedKanaLength: viewAfter.finishedWord.length,
        finishedWord: viewAfter.finishedWord,
        pendingWord: viewAfter.pendingWord,
        finishedRoman: viewAfter.finishedRoman,
        pendingRoman: viewAfter.pendingRoman,
        mistakeCount: this.mistakeStack.length,
      };
    }

    return {
      type: 'IGNORED',
      finishedKanaLength: viewAfter.finishedWord.length,
      finishedWord: viewAfter.finishedWord,
      pendingWord: viewAfter.pendingWord,
      finishedRoman: viewAfter.finishedRoman,
      pendingRoman: viewAfter.pendingRoman,
      mistakeCount: this.mistakeStack.length,
    };
  }

  getCurrentCursor(): number {
    return this.automaton.currentView().finishedWord.length;
  }
}

/**
 * Bind browser window keyboard events to an active Emiel session
 */
export function bindEmielKeyboard(
  target: EventTarget,
  onEvent: (evt: InputEvent) => void
): () => void {
  return activate(target, onEvent);
}

/**
 * Helper to map character positions between Original (Kanji/mixed) and Hiragana
 * using token alignments provided by the SudachiPy backend.
 */
export function mapHiraganaIndexToOriginal(
  hiraganaIndex: number,
  tokens: { surface: string; hiragana: string }[]
): number {
  if (!tokens || tokens.length === 0) return hiraganaIndex;

  let currentHiraPos = 0;
  let currentOrigPos = 0;

  for (const token of tokens) {
    const tokenHiraLen = token.hiragana.length;
    const tokenOrigLen = token.surface.length;

    if (hiraganaIndex < currentHiraPos + tokenHiraLen) {
      const offsetInToken = hiraganaIndex - currentHiraPos;
      const mappedOffset = Math.min(
        Math.floor((offsetInToken / Math.max(tokenHiraLen, 1)) * tokenOrigLen),
        tokenOrigLen - 1
      );
      return currentOrigPos + Math.max(0, mappedOffset);
    }

    currentHiraPos += tokenHiraLen;
    currentOrigPos += tokenOrigLen;
  }

  return currentOrigPos;
}

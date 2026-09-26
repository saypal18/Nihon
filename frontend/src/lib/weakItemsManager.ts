import { alignTokenCharacters, isKanji } from './kanji';
import { Sentence, TokenReading, ScriptMode } from './types';
import * as wanakana from 'wanakana';

export type WeakCategory = 'words' | 'kanji' | 'hiragana' | 'katakana';
export type WeakStatus = 'critical' | 'practicing' | 'improving' | 'mastered';

export interface WeakItem {
  id: string; // key within category
  text: string;
  category: WeakCategory;
  reading?: string;
  romaji?: string;
  meaning?: string;
  dictionaryForm?: string;
  mistakes: number;
  cleanStreak: number;
  cleanEncounters: number;
  totalEncounters: number;
  status: WeakStatus;
  lastMistakeAt: number;
  lastPracticedAt: number;
  contextSentence?: string;
}

export interface WeakItemsSettings {
  autoRemoveOnMastery: boolean;
  masteryStreakThreshold: number; // default 3
}

export interface WeakItemsState {
  words: Record<string, WeakItem>;
  kanji: Record<string, WeakItem>;
  hiragana: Record<string, WeakItem>;
  katakana: Record<string, WeakItem>;
  settings: WeakItemsSettings;
}

const STORAGE_KEY = 'nihon_weak_items_v1';

const DEFAULT_SETTINGS: WeakItemsSettings = {
  autoRemoveOnMastery: true,
  masteryStreakThreshold: 3,
};

const DEFAULT_STATE: WeakItemsState = {
  words: {},
  kanji: {},
  hiragana: {},
  katakana: {},
  settings: DEFAULT_SETTINGS,
};

/**
 * Calculates current status tier based on mistakes, consecutive clean streak, and threshold.
 */
export function calculateStatus(
  mistakes: number,
  cleanStreak: number,
  threshold: number = 3
): WeakStatus {
  if (cleanStreak >= threshold) {
    return 'mastered';
  }
  if (cleanStreak >= 2) {
    return 'improving';
  }
  if (mistakes >= 3 || (cleanStreak === 0 && mistakes >= 2)) {
    return 'critical';
  }
  return 'practicing';
}

class WeakItemsManager {
  private state: WeakItemsState = { ...DEFAULT_STATE };
  private listeners: Set<(state: WeakItemsState) => void> = new Set();
  private initialized: boolean = false;

  constructor() {
    this.load();
  }

  private load() {
    if (typeof window === 'undefined') return;
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.state = {
          words: parsed.words || {},
          kanji: parsed.kanji || {},
          hiragana: parsed.hiragana || {},
          katakana: parsed.katakana || {},
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        };
      }
    } catch (e) {
      console.error('Failed to load weak items from localStorage', e);
    }
    this.initialized = true;
  }

  private save() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error('Failed to save weak items to localStorage', e);
      }
    }
    this.notify();
  }

  public getState(): WeakItemsState {
    if (!this.initialized && typeof window !== 'undefined') {
      this.load();
    }
    return this.state;
  }

  public getCategoryItems(category: WeakCategory): WeakItem[] {
    const record = this.getState()[category] || {};
    return Object.values(record).sort((a, b) => {
      // Sort: critical first, then practicing, improving, mastered; then by mistakes desc
      const priority: Record<WeakStatus, number> = {
        critical: 4,
        practicing: 3,
        improving: 2,
        mastered: 1,
      };
      if (priority[b.status] !== priority[a.status]) {
        return priority[b.status] - priority[a.status];
      }
      return b.mistakes - a.mistakes || b.lastMistakeAt - a.lastMistakeAt;
    });
  }

  public getTotalWeakCount(): number {
    const s = this.getState();
    return (
      Object.keys(s.words).length +
      Object.keys(s.kanji).length +
      Object.keys(s.hiragana).length +
      Object.keys(s.katakana).length
    );
  }

  public updateSettings(partial: Partial<WeakItemsSettings>) {
    this.state.settings = { ...this.state.settings, ...partial };
    this.save();
  }

  /**
   * Record a mistake on an item in a specific category.
   * If item exists: increments mistakes, resets cleanStreak to 0, updates status.
   * If new: creates item with critical/practicing status.
   */
  public recordItemMistake(
    category: WeakCategory,
    text: string,
    metadata?: {
      reading?: string;
      romaji?: string;
      meaning?: string;
      dictionaryForm?: string;
      contextSentence?: string;
    }
  ) {
    if (!text || text.trim() === '') return;
    const catDict = this.state[category];
    const now = Date.now();
    const existing = catDict[text];

    if (existing) {
      const mistakes = existing.mistakes + 1;
      const cleanStreak = 0;
      const totalEncounters = existing.totalEncounters + 1;
      const status = calculateStatus(
        mistakes,
        cleanStreak,
        this.state.settings.masteryStreakThreshold
      );

      catDict[text] = {
        ...existing,
        mistakes,
        cleanStreak,
        totalEncounters,
        status,
        lastMistakeAt: now,
        lastPracticedAt: now,
        contextSentence: metadata?.contextSentence || existing.contextSentence,
        reading: metadata?.reading || existing.reading,
        meaning: metadata?.meaning || existing.meaning,
        dictionaryForm: metadata?.dictionaryForm || existing.dictionaryForm,
      };
    } else {
      const mistakes = 1;
      const cleanStreak = 0;
      const totalEncounters = 1;
      const cleanEncounters = 0;
      const status = calculateStatus(
        mistakes,
        cleanStreak,
        this.state.settings.masteryStreakThreshold
      );

      catDict[text] = {
        id: text,
        text,
        category,
        reading: metadata?.reading || (category === 'hiragana' ? text : undefined),
        romaji: metadata?.romaji || wanakana.toRomaji(metadata?.reading || text),
        meaning: metadata?.meaning,
        dictionaryForm: metadata?.dictionaryForm,
        mistakes,
        cleanStreak,
        cleanEncounters,
        totalEncounters,
        status,
        lastMistakeAt: now,
        lastPracticedAt: now,
        contextSentence: metadata?.contextSentence,
      };
    }

    this.save();
  }

  /**
   * Process a mistake event at a passage point during typing.
   * Maps passage hiragana index and sentence to Word, Kanji, and Kana.
   */
  public processPassageMistake(
    sentence: Sentence,
    hiraganaIndex: number,
    scriptMode: ScriptMode,
    flaggedPoints?: {
      tokens: Set<string>;
      kanji: Set<string>;
      kana: Set<string>;
    }
  ) {
    const tokens = sentence.tokens || [];
    let currentHiraPos = 0;
    let targetToken: TokenReading | null = null;
    let tokenIndex = -1;
    let offsetInTokenHiragana = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const hLen = t.hiragana.length;
      if (hiraganaIndex >= currentHiraPos && hiraganaIndex < currentHiraPos + hLen) {
        targetToken = t;
        tokenIndex = i;
        offsetInTokenHiragana = hiraganaIndex - currentHiraPos;
        break;
      }
      currentHiraPos += hLen;
    }

    const contextSentence = sentence.original || sentence.hiragana;

    // 1. Process Kana Character / Mora
    const rawKanaChar = sentence.hiragana[hiraganaIndex] || '';
    const kanaKey = `${sentence.id}-kana-${hiraganaIndex}`;
    const shouldRecordKana =
      rawKanaChar &&
      rawKanaChar !== '。' &&
      rawKanaChar !== '、' &&
      rawKanaChar !== ' ' &&
      (!flaggedPoints || !flaggedPoints.kana.has(kanaKey));

    if (shouldRecordKana) {
      if (flaggedPoints) flaggedPoints.kana.add(kanaKey);

      // Determine if Katakana or Hiragana
      const isKatakanaMode = scriptMode === 'katakana';
      const isKatakanaToken =
        targetToken &&
        wanakana.isKatakana(targetToken.surface) &&
        !targetToken.is_punctuation;

      if (isKatakanaMode || isKatakanaToken) {
        const kataChar = wanakana.toKatakana(rawKanaChar);
        this.recordItemMistake('katakana', kataChar, {
          reading: kataChar,
          romaji: wanakana.toRomaji(kataChar),
          contextSentence,
        });
      } else {
        this.recordItemMistake('hiragana', rawKanaChar, {
          reading: rawKanaChar,
          romaji: wanakana.toRomaji(rawKanaChar),
          contextSentence,
        });
      }
    }

    // 2. Process Word and Kanji if a token was matched
    if (targetToken && !targetToken.is_punctuation) {
      const tokenKey = `${sentence.id}-token-${tokenIndex}`;
      const shouldRecordWord = !flaggedPoints || !flaggedPoints.tokens.has(tokenKey);

      if (shouldRecordWord) {
        if (flaggedPoints) flaggedPoints.tokens.add(tokenKey);
        // Record to Words list
        const wordText = targetToken.surface;
        this.recordItemMistake('words', wordText, {
          reading: targetToken.reading || targetToken.hiragana,
          romaji: wanakana.toRomaji(targetToken.hiragana),
          dictionaryForm: targetToken.dictionary_form || targetToken.surface,
          contextSentence,
        });
      }

      // Align and resolve Kanji if the token contains Kanji
      const alignment = alignTokenCharacters(targetToken.surface, targetToken.hiragana);
      let runningHira = 0;
      for (const part of alignment) {
        const partHiraLen = part.hira.length;
        if (
          offsetInTokenHiragana >= runningHira &&
          offsetInTokenHiragana < runningHira + partHiraLen
        ) {
          if (isKanji(part.char)) {
            const kanjiKey = `${sentence.id}-kanji-${part.char}-${tokenIndex}`;
            const shouldRecordKanji = !flaggedPoints || !flaggedPoints.kanji.has(kanjiKey);

            if (shouldRecordKanji) {
              if (flaggedPoints) flaggedPoints.kanji.add(kanjiKey);
              this.recordItemMistake('kanji', part.char, {
                reading: part.hira,
                romaji: wanakana.toRomaji(part.hira),
                contextSentence,
              });
            }
          }
          break;
        }
        runningHira += partHiraLen;
      }
    }
  }

  /**
   * Advance clean streak for an item when typed with zero mistakes in a passage run.
   */
  public recordCleanEncounter(category: WeakCategory, text: string) {
    const catDict = this.state[category];
    const existing = catDict[text];
    if (!existing) return; // Only track clean encounters for existing weak items

    const now = Date.now();
    const cleanStreak = existing.cleanStreak + 1;
    const cleanEncounters = existing.cleanEncounters + 1;
    const totalEncounters = existing.totalEncounters + 1;
    const threshold = this.state.settings.masteryStreakThreshold;
    const status = calculateStatus(existing.mistakes, cleanStreak, threshold);

    if (cleanStreak >= threshold && this.state.settings.autoRemoveOnMastery) {
      // Auto-remove graduated item
      delete catDict[text];
    } else {
      catDict[text] = {
        ...existing,
        cleanStreak,
        cleanEncounters,
        totalEncounters,
        status,
        lastPracticedAt: now,
      };
    }

    this.save();
  }

  /**
   * Process all cleanly typed tokens at the end of a passage run to advance their clean streaks.
   */
  public processCleanPassageEncounters(
    sentences: Sentence[],
    mistakenTokens: Set<string>,
    mistakenKanji: Set<string>,
    mistakenKana: Set<string>
  ) {
    const state = this.getState();

    for (const sentence of sentences) {
      const tokens = sentence.tokens || [];
      for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
        const token = tokens[tIdx];
        if (token.is_punctuation) continue;

        const tokenKey = `${sentence.id}-token-${tIdx}`;
        // If this token was NOT mistyped in this run, and is currently in weak words:
        if (!mistakenTokens.has(tokenKey) && state.words[token.surface]) {
          this.recordCleanEncounter('words', token.surface);
        }

        // Check Kanji within token
        const alignment = alignTokenCharacters(token.surface, token.hiragana);
        for (let cIdx = 0; cIdx < alignment.length; cIdx++) {
          const part = alignment[cIdx];
          if (isKanji(part.char)) {
            const kanjiKey = `${sentence.id}-kanji-${part.char}-${tIdx}`;
            if (!mistakenKanji.has(kanjiKey) && state.kanji[part.char]) {
              this.recordCleanEncounter('kanji', part.char);
            }
          }
        }
      }

      // Check Hiragana/Katakana characters in sentence
      for (let hIdx = 0; hIdx < sentence.hiragana.length; hIdx++) {
        const char = sentence.hiragana[hIdx];
        if (char === '。' || char === '、' || char === ' ') continue;
        const kanaKey = `${sentence.id}-kana-${hIdx}`;
        if (!mistakenKana.has(kanaKey)) {
          if (state.hiragana[char]) {
            this.recordCleanEncounter('hiragana', char);
          }
          const kataChar = wanakana.toKatakana(char);
          if (state.katakana[kataChar]) {
            this.recordCleanEncounter('katakana', kataChar);
          }
        }
      }
    }
  }

  /**
   * Manually add an item to a list.
   */
  public addItem(
    category: WeakCategory,
    text: string,
    metadata?: { reading?: string; meaning?: string; dictionaryForm?: string }
  ): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;

    // Validate category constraints
    if (category === 'kanji' && !isKanji(trimmed)) {
      // Must contain at least one kanji
      const hasKanji = trimmed.split('').some(isKanji);
      if (!hasKanji) return false;
    }

    const reading = metadata?.reading || (category === 'hiragana' || category === 'katakana' ? trimmed : undefined);
    const romaji = wanakana.toRomaji(reading || trimmed);

    this.recordItemMistake(category, trimmed, {
      reading,
      romaji,
      meaning: metadata?.meaning,
      dictionaryForm: metadata?.dictionaryForm,
      contextSentence: 'Manually added',
    });

    return true;
  }

  /**
   * Manually delete an item.
   */
  public deleteItem(category: WeakCategory, text: string): boolean {
    if (this.state[category] && this.state[category][text]) {
      delete this.state[category][text];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Clear an entire category.
   */
  public clearCategory(category: WeakCategory) {
    if (this.state[category]) {
      this.state[category] = {};
      this.save();
    }
  }

  /**
   * Export items in a category to formatted text.
   */
  public exportCategoryText(
    category: WeakCategory,
    format: 'comma' | 'tsv' | 'lines' = 'lines'
  ): string {
    const items = this.getCategoryItems(category);
    if (items.length === 0) return '';

    if (format === 'comma') {
      return items.map((i) => i.text).join(', ');
    }

    if (format === 'tsv') {
      // TSV format: text \t reading \t meaning \t mistakes
      const rows = items.map(
        (i) => `${i.text}\t${i.reading || ''}\t${i.meaning || ''}\t${i.mistakes}`
      );
      return `Word\tReading\tMeaning\tMistakes\n` + rows.join('\n');
    }

    // Default lines format
    return items
      .map(
        (i) =>
          `${i.text}${i.reading ? ` (${i.reading})` : ''}${
            i.meaning ? ` - ${i.meaning}` : ''
          }`
      )
      .join('\n');
  }

  /**
   * Reactive subscription listener for React components.
   */
  public subscribe(listener: (state: WeakItemsState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error('Error in weak items listener', e);
      }
    }
  }
}

// Singleton export
export const weakItemsManager = new WeakItemsManager();

export type ScriptMode = 'original' | 'hiragana' | 'katakana';

export type SoundProfile = 'blue' | 'brown' | 'thock';

export type TTSEngine = 'voicevox' | 'browser';

export interface AudioSettings {
  enabled: boolean;
  profile: SoundProfile;
  keyVolume: number;    // 0.0 - 1.0
  errorVolume: number;  // 0.0 - 1.0
  chimeVolume: number;  // 0.0 - 1.0
  ttsEngine: TTSEngine; // 'voicevox' | 'browser'
  voicevoxSpeaker?: number; // VOICEVOX speaker/style ID (e.g. 3 = Zundamon, 2 = Shikoku Metan, 8 = Kasukabe Tsumugi)
}

export interface TokenReading {
  surface: string;
  raw_surface?: string;
  reading: string;
  hiragana: string;
  is_punctuation: boolean;
  candidates?: string[];
  disambiguated?: boolean;
  dictionary_form?: string;
  part_of_speech?: string[];
}

export interface GlossarySense {
  english_definitions: string[];
  parts_of_speech: string[];
  tags: string[];
  info?: string;
}

export interface GlossaryData {
  word: string;
  dictionary_form?: string;
  reading: string;
  romaji: string;
  senses: GlossarySense[];
  jlpt_level?: string;
  is_common: boolean;
  context_explanation?: string;
  source: string;
}

export interface SelectedWordInfo {
  sentenceId: number;
  tokenIndex: number;
  token: TokenReading;
  sentence: Sentence;
}

export interface Sentence {
  id: number;
  original: string;
  raw_original?: string;
  hiragana: string;
  katakana: string;
  tts_kana?: string;
  translation: string;
  tokens?: TokenReading[];
}

export interface DAGNode {
  id: string;
  char: string;
  kanaIndex: number;
  kanaChar: string;
  isTerminalKana: boolean;
  next: DAGNode[];
}

export interface KanaStat {
  attempts: number;
  errors: number;
}

export interface TypingStats {
  kpm: number;
  wpm: number;
  cpm: number;
  accuracy: number;
  correctKeystrokes: number;
  incorrectKeystrokes: number;
  totalKeystrokes: number;
  elapsedSeconds: number;
  kanaErrors: Record<string, KanaStat>;
}

export type {
  WeakCategory,
  WeakStatus,
  WeakItem,
  WeakItemsSettings,
  WeakItemsState,
} from './weakItemsManager';


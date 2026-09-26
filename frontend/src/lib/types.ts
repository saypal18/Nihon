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

export interface SubTokenInfo {
  surface: string;
  reading: string;
  lemma: string;
  pos: string[];
  start_char: number;
  end_char: number;
}

export interface GrammarInfo {
  pattern_name: string;
  category: string;
  meaning: string;
  explanation: string;
  formation?: string;
  level?: string;
  context_role?: string;
}

export interface InflectionComponent {
  surface: string;
  lemma: string;
  role: string;
}

export interface InflectionInfo {
  base_verb: string;
  verb_type?: string;
  form_name: string;
  description: string;
  components: InflectionComponent[];
}

export interface KanjiDetail {
  kanji: string;
  meaning: string;
  onyomi: string[];
  kunyomi: string[];
  jlpt_level?: string;
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
  selected_sense_index?: number;
  jlpt_level?: string;
  is_common: boolean;
  context_explanation?: string;
  resolved_span?: [number, number];
  category?: string;
  grammar_info?: GrammarInfo;
  inflection_info?: InflectionInfo;
  kanji_breakdown?: KanjiDetail[];
  sub_tokens?: SubTokenInfo[];
  confidence?: number;
  source: string;
}

export interface SelectedWordInfo {
  sentenceId: number;
  tokenIndex: number;
  token: TokenReading;
  sentence: Sentence;
  clickedStart?: number;
  clickedEnd?: number;
  selectionScope?: 'sentence' | 'component';
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

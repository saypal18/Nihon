export type ScriptMode = 'original' | 'hiragana' | 'katakana';

export type SoundProfile = 'blue' | 'brown' | 'thock';

export interface AudioSettings {
  enabled: boolean;
  profile: SoundProfile;
  keyVolume: number;    // 0.0 - 1.0
  errorVolume: number;  // 0.0 - 1.0
  chimeVolume: number;  // 0.0 - 1.0
}

export interface TokenReading {
  surface: string;
  reading: string;
  hiragana: string;
  is_punctuation: boolean;
  candidates?: string[];
  disambiguated?: boolean;
}

export interface Sentence {
  id: number;
  original: string;
  hiragana: string;
  katakana: string;
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

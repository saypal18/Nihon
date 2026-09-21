import { Sentence, TokenReading } from './types';

/**
 * Checks if a single character is a CJK ideograph (Kanji).
 */
export function isKanji(char: string): boolean {
  const code = char.codePointAt(0) || 0;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
    (code >= 0xf900 && code <= 0xfaff) // CJK Compatibility Ideographs
  );
}

/**
 * Extracts unique Kanji characters from a text string in order of appearance.
 */
export function extractUniqueKanji(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const char of text) {
    if (isKanji(char) && !seen.has(char)) {
      seen.add(char);
      result.push(char);
    }
  }
  return result;
}

/**
 * Common Kanji presets for quick selection
 */
export const KANJI_PRESETS = [
  {
    name: 'Grade 1 (80)',
    description: 'Elementary School Grade 1 Joyo Kanji',
    kanji:
      '一右雨円王音下火花気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六',
  },
  {
    name: 'JLPT N5 (~100)',
    description: 'Beginner JLPT N5 Kanji Set',
    kanji:
      '一二三四五六七八九十百千万円日月中火水木金土日月年大中小入出人子男女人前左右手目足耳言立見聞行来今時分話白赤名買車校道半外国何東友父母書話読食飲買生休聞',
  },
];

/**
 * Align individual characters of a surface word to slices of its Hiragana reading.
 */
export function alignTokenCharacters(surface: string, hiragana: string): { char: string; hira: string }[] {
  if (surface.length <= 1) {
    return [{ char: surface, hira: hiragana }];
  }

  const memo = new Map<string, { char: string; hira: string }[] | null>();

  function dp(sIdx: number, hIdx: number): { char: string; hira: string }[] | null {
    const key = `${sIdx},${hIdx}`;
    if (memo.has(key)) return memo.get(key)!;

    if (sIdx === surface.length && hIdx === hiragana.length) return [];
    if (sIdx === surface.length || hIdx === hiragana.length) return null;

    const char = surface[sIdx];
    if (!isKanji(char)) {
      if (hiragana[hIdx] === char) {
        const rest = dp(sIdx + 1, hIdx + 1);
        if (rest !== null) {
          const res = [{ char, hira: char }, ...rest];
          memo.set(key, res);
          return res;
        }
      }
      memo.set(key, null);
      return null;
    }

    // Kanji: try slice lengths
    for (let len = 1; len <= Math.min(5, hiragana.length - hIdx); len++) {
      const chunk = hiragana.slice(hIdx, hIdx + len);
      const rest = dp(sIdx + 1, hIdx + len);
      if (rest !== null) {
        const res = [{ char, hira: chunk }, ...rest];
        memo.set(key, res);
        return res;
      }
    }

    memo.set(key, null);
    return null;
  }

  const result = dp(0, 0);
  return result || [{ char: surface, hira: hiragana }];
}

/**
 * Client-side filter to apply an allowed Kanji list to a sentence
 * (useful if offline or updating dynamic display).
 */
export function filterSentenceByAllowedKanji(
  sentence: Sentence,
  allowedKanjiSet: Set<string> | null
): Sentence {
  if (!allowedKanjiSet || !sentence.tokens) {
    return sentence;
  }

  const updatedTokens: TokenReading[] = sentence.tokens.map((token) => {
    const raw = token.raw_surface || token.surface;
    const kanjis = extractUniqueKanji(raw);
    const hasUnallowed = kanjis.length > 0 && !kanjis.every((k) => allowedKanjiSet.has(k));

    if (!hasUnallowed) {
      return {
        ...token,
        raw_surface: raw,
        surface: raw,
      };
    }

    const alignment = alignTokenCharacters(raw, token.hiragana);
    const renderedParts = alignment.map((item) => {
      if (isKanji(item.char)) {
        return allowedKanjiSet.has(item.char) ? item.char : item.hira;
      }
      return item.char;
    });

    return {
      ...token,
      raw_surface: raw,
      surface: renderedParts.join(''),
    };
  });

  return {
    ...sentence,
    original: updatedTokens.map((t) => t.surface).join(''),
    raw_original: sentence.raw_original || sentence.original,
    tokens: updatedTokens,
  };
}

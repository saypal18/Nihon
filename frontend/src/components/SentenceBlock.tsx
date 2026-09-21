'use client';

import React, { useState, useEffect } from 'react';
import * as wanakana from 'wanakana';
import { Sentence, ScriptMode, TokenReading } from '../lib/types';
import { mapHiraganaIndexToOriginal } from '../lib/emielAdapter';
import { CheckCircle2, AlertTriangle, Volume2 } from 'lucide-react';
import { speakJapanese, stopSpeech } from '../lib/speech';

interface SentenceBlockProps {
  sentence: Sentence;
  isActive: boolean;
  isCompleted: boolean;
  hiraganaCursor: number;
  mistakeCount: number;
  parsedRoman: string;
  inFlightRoman: string;
  bufferedMistakes: string;
  pendingRoman: string;
  scriptMode: ScriptMode;
  showTranslation: boolean;
  selectedTokenIndex?: number | null;
  onSelectToken?: (sentence: Sentence, token: TokenReading, tokenIndex: number) => void;
}

export const SentenceBlock: React.FC<SentenceBlockProps> = ({
  sentence,
  isActive,
  isCompleted,
  hiraganaCursor,
  mistakeCount,
  parsedRoman,
  inFlightRoman,
  bufferedMistakes,
  pendingRoman: _pendingRoman,
  scriptMode,
  showTranslation,
  selectedTokenIndex = null,
  onSelectToken,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (isSpeaking) {
        stopSpeech();
      }
    };
  }, [isSpeaking]);

  const handlePlayVoice = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    if (isSpeaking) {
      stopSpeech();
      setIsSpeaking(false);
    } else {
      speakJapanese(
        sentence,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    }
  };

  // Determine text to render based on scriptMode
  const displayText =
    scriptMode === 'original'
      ? sentence.original
      : scriptMode === 'katakana'
      ? sentence.katakana
      : sentence.hiragana;

  // Active cursor position in displayText
  let activeCharIndex = hiraganaCursor;
  if (scriptMode === 'original' && sentence.tokens) {
    activeCharIndex = mapHiraganaIndexToOriginal(hiraganaCursor, sentence.tokens);
  }

  // Fallback full romaji for inactive or completed state
  const defaultRoman = wanakana.toRomaji(sentence.hiragana);

  return (
    <div
      className={`group relative rounded-xl border p-5 transition-all duration-300 ${
        isActive
          ? 'bg-slate-900/90 border-slate-700 shadow-lg shadow-black/40 ring-1 ring-slate-700/50'
          : isCompleted
          ? 'bg-slate-950/40 border-slate-900 opacity-60'
          : 'bg-slate-950/20 border-slate-900/60 opacity-40'
      }`}
    >
      {/* English Translation Header (Anchored directly above Japanese text with zero left indent offset) */}
      {showTranslation && sentence.translation && (
        <div className="mb-2 flex items-center justify-between">
          <p
            className={`text-sm tracking-wide transition-colors ${
              isActive ? 'text-slate-300 font-medium' : 'text-slate-500 font-normal'
            }`}
          >
            {sentence.translation}
          </p>

          {isCompleted && (
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-mono font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done</span>
            </span>
          )}
        </div>
      )}

      {/* Japanese Sentence Characters Line with Voice Pronunciation Button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 flex flex-wrap items-baseline gap-x-[1px] gap-y-1 font-japanese text-2xl sm:text-3xl font-semibold leading-relaxed tracking-wider select-none">
          {sentence.tokens && sentence.tokens.length > 0 ? (
            (() => {
              let runningCharIndex = 0;
              return sentence.tokens.map((token, tokenIdx) => {
                const isSelected = selectedTokenIndex === tokenIdx;
                const isPunct = token.is_punctuation;

                const tokenText =
                  scriptMode === 'original'
                    ? token.surface
                    : scriptMode === 'katakana'
                    ? token.reading || wanakana.toKatakana(token.hiragana)
                    : token.hiragana;

                const tokenChars = tokenText.split('');
                const tokenStartCharIdx = runningCharIndex;
                runningCharIndex += tokenChars.length;

                return (
                  <span
                    key={tokenIdx}
                    onClick={
                      !isPunct && onSelectToken
                        ? () => onSelectToken(sentence, token, tokenIdx)
                        : undefined
                    }
                    className={`inline-flex items-baseline transition-all duration-150 rounded px-[2px] -mx-[1px] ${
                      isSelected
                        ? 'border-b-2 border-amber-400 bg-amber-400/15 -mb-0.5'
                        : !isPunct
                        ? 'hover:bg-slate-800/60 cursor-pointer hover:border-b hover:border-slate-600/80'
                        : ''
                    }`}
                    title={!isPunct ? `Inspect glossary for '${token.surface}'` : undefined}
                  >
                    {tokenChars.map((char, cIdx) => {
                      const globalIdx = tokenStartCharIdx + cIdx;
                      const isCharCompleted =
                        isCompleted || (isActive && globalIdx < activeCharIndex);

                      return (
                        <span
                          key={cIdx}
                          className={`transition-colors duration-150 ${
                            isSelected
                              ? 'text-amber-300'
                              : isCharCompleted
                              ? 'text-emerald-400'
                              : isActive
                              ? 'text-slate-300'
                              : 'text-slate-600'
                          }`}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </span>
                );
              });
            })()
          ) : (
            displayText.split('').map((char, index) => {
              const isCharCompleted = isCompleted || (isActive && index < activeCharIndex);

              return (
                <span
                  key={index}
                  className={`transition-colors duration-150 ${
                    isCharCompleted
                      ? 'text-emerald-400'
                      : isActive
                      ? 'text-slate-300'
                      : 'text-slate-600'
                  }`}
                >
                  {char}
                </span>
              );
            })
          )}
        </div>

        <button
          type="button"
          tabIndex={-1}
          onClick={handlePlayVoice}
          title="Pronounce sentence"
          aria-label="Pronounce sentence"
          className={`shrink-0 p-2 rounded-lg transition-all duration-200 focus:outline-none cursor-pointer ${
            isSpeaking
              ? 'text-amber-400 bg-amber-400/15 ring-1 ring-amber-400/40 animate-pulse'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 active:scale-95'
          }`}
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </div>

      {/* English / Romaji Track Directly Below Japanese Characters */}
      <div className="mt-2.5 font-mono text-base sm:text-lg tracking-wider select-none flex items-center flex-wrap gap-y-1 min-h-[1.75rem]">
        {isActive ? (
          <>
            {parsedRoman && (
              <span className="text-emerald-400 font-semibold">{parsedRoman}</span>
            )}
            {inFlightRoman && (
              <span className="text-amber-400 font-bold underline decoration-amber-400 decoration-2 underline-offset-4">
                {inFlightRoman}
              </span>
            )}
            {bufferedMistakes && (
              <span className="text-red-400 bg-red-500/20 px-1 rounded font-bold animate-pulse">
                {bufferedMistakes}
              </span>
            )}
            {/* Typing caret indicator */}
            <span className="inline-block w-[2px] h-[1.15em] -mb-0.5 bg-amber-400 animate-pulse mx-0.5" />
          </>
        ) : isCompleted ? (
          <span className="text-emerald-500/60 font-medium">
            {parsedRoman || defaultRoman}
          </span>
        ) : null}
      </div>

      {/* Mistake Alert Banner when active sentence has locked typos */}
      {isActive && mistakeCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-400 font-mono bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-1.5 w-fit">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>
            {mistakeCount} typo{mistakeCount > 1 ? 's' : ''} buffered — press{' '}
            <kbd className="px-1.5 py-0.5 bg-red-900/50 text-red-200 rounded border border-red-800 text-[11px]">
              Backspace
            </kbd>{' '}
            to unlock
          </span>
        </div>
      )}
    </div>
  );
};

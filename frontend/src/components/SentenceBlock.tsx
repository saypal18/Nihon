'use client';

import React, { useState, useEffect } from 'react';
import { Sentence, ScriptMode } from '../lib/types';
import { mapHiraganaIndexToOriginal } from '../lib/emielAdapter';
import { CheckCircle2, AlertTriangle, Volume2 } from 'lucide-react';
import { speakJapanese, stopSpeech } from '../lib/speech';

interface SentenceBlockProps {
  sentence: Sentence;
  isActive: boolean;
  isCompleted: boolean;
  hiraganaCursor: number;
  mistakeCount: number;
  scriptMode: ScriptMode;
  showTranslation: boolean;
}

export const SentenceBlock: React.FC<SentenceBlockProps> = ({
  sentence,
  isActive,
  isCompleted,
  hiraganaCursor,
  mistakeCount,
  scriptMode,
  showTranslation,
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
          {displayText.split('').map((char, index) => {
            let charStatus: 'completed' | 'active' | 'upcoming' = 'upcoming';

            if (isCompleted) {
              charStatus = 'completed';
            } else if (isActive) {
              if (index < activeCharIndex) {
                charStatus = 'completed';
              } else if (index === activeCharIndex) {
                charStatus = 'active';
              } else {
                charStatus = 'upcoming';
              }
            }

            const hasMistakeOnActive = isActive && charStatus === 'active' && mistakeCount > 0;

            return (
              <span
                key={index}
                className={`relative inline-block transition-all duration-150 ${
                  charStatus === 'completed'
                    ? 'text-emerald-400/90'
                    : charStatus === 'active'
                    ? hasMistakeOnActive
                      ? 'text-red-400 bg-red-500/20 rounded px-1 -mx-0.5 animate-pulse ring-1 ring-red-500/40'
                      : 'text-white bg-amber-400/15 rounded px-1 -mx-0.5 underline decoration-amber-400 decoration-2 underline-offset-8 shadow-sm ring-1 ring-amber-400/40'
                    : 'text-slate-600'
                }`}
              >
                {char}

                {/* Blinking Caret Indicator for Active Character */}
                {isActive && charStatus === 'active' && !hasMistakeOnActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                )}
              </span>
            );
          })}
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

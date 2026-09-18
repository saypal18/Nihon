'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sentence, ScriptMode, TypingStats, KanaStat } from '../lib/types';
import { EmielTypingSession, bindEmielKeyboard } from '../lib/emielAdapter';
import { howlerAudio } from '../lib/howlerAudio';
import { calculateLiveStats } from '../lib/stats';
import { SentenceBlock } from './SentenceBlock';
import { Keyboard } from 'lucide-react';

interface TypingAreaProps {
  sentences: Sentence[];
  scriptMode: ScriptMode;
  showTranslation: boolean;
  onStatsUpdate: (stats: TypingStats) => void;
  onPassageComplete: (finalStats: TypingStats) => void;
  resetTrigger: number;
}

export const TypingArea: React.FC<TypingAreaProps> = ({
  sentences,
  scriptMode,
  showTranslation,
  onStatsUpdate,
  onPassageComplete,
  resetTrigger,
}) => {
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [hiraganaCursor, setHiraganaCursor] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [parsedRoman, setParsedRoman] = useState('');
  const [inFlightRoman, setInFlightRoman] = useState('');
  const [bufferedMistakes, setBufferedMistakes] = useState('');
  const [pendingRoman, setPendingRoman] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);

  // Global accumulated stats across all sentences in this passage run
  const accumStatsRef = useRef({
    correctKeystrokes: 0,
    incorrectKeystrokes: 0,
    totalKeystrokes: 0,
    completedKana: 0,
    kanaErrors: {} as Record<string, KanaStat>,
  });

  // Reference to current active Emiel session instance
  const sessionRef = useRef<EmielTypingSession | null>(null);
  const activeBlockRef = useRef<HTMLDivElement | null>(null);

  // Initialize or reset typing session using Emiel Mozc Automaton
  const initializeSession = useCallback(
    (sentenceIdx: number) => {
      if (sentences.length === 0 || sentenceIdx >= sentences.length) {
        sessionRef.current = null;
        return;
      }
      const session = new EmielTypingSession(sentences[sentenceIdx]);
      sessionRef.current = session;
      setHiraganaCursor(0);
      setMistakeCount(0);
      const roman = session.getRomanState();
      setParsedRoman(roman.parsedRoman);
      setInFlightRoman(roman.inFlightRoman);
      setBufferedMistakes(roman.bufferedMistakes);
      setPendingRoman(roman.pendingRoman);
    },
    [sentences]
  );

  // When resetTrigger or sentences change, restart from sentence 0
  useEffect(() => {
    setActiveSentenceIndex(0);
    setStartTime(null);
    accumStatsRef.current = {
      correctKeystrokes: 0,
      incorrectKeystrokes: 0,
      totalKeystrokes: 0,
      completedKana: 0,
      kanaErrors: {},
    };
    initializeSession(0);
  }, [resetTrigger, sentences, initializeSession]);

  // Merge per-sentence kana errors into global accum stats
  const mergeKanaErrors = (sentenceKanaErrors: Record<string, KanaStat>) => {
    const target = accumStatsRef.current.kanaErrors;
    for (const [char, stat] of Object.entries(sentenceKanaErrors)) {
      if (!target[char]) {
        target[char] = { attempts: 0, errors: 0 };
      }
      target[char].attempts += stat.attempts;
      target[char].errors += stat.errors;
    }
  };

  // Timer interval for real-time KPM/WPM recalculation even during pauses
  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const currentKanaCount =
        accumStatsRef.current.completedKana +
        (sessionRef.current ? sessionRef.current.getCurrentCursor() : 0);

      const live = calculateLiveStats(
        accumStatsRef.current.correctKeystrokes +
          (sessionRef.current ? sessionRef.current.correctKeystrokes : 0),
        accumStatsRef.current.incorrectKeystrokes +
          (sessionRef.current ? sessionRef.current.incorrectKeystrokes : 0),
        accumStatsRef.current.totalKeystrokes +
          (sessionRef.current ? sessionRef.current.totalKeystrokes : 0),
        currentKanaCount,
        startTime,
        now,
        accumStatsRef.current.kanaErrors
      );
      onStatsUpdate(live);
    }, 500);

    return () => clearInterval(interval);
  }, [startTime, onStatsUpdate]);

  // Main Keystroke Event Listener using Emiel's official activate binding
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unbind = bindEmielKeyboard(window, (inputEvt) => {
      // Only process keydown strokes
      if (inputEvt.input.type !== 'keydown') return;

      const session = sessionRef.current;
      if (!session || sentences.length === 0) return;

      // Ignore Tab, Escape, F-keys from typo detection
      if (
        inputEvt.input.key === 'Tab' ||
        inputEvt.input.key === 'Escape' ||
        inputEvt.input.key.startsWith('F')
      ) {
        return;
      }

      // Initialize session timer on first printable keystroke
      if (!startTime && inputEvt.input.key !== 'Backspace') {
        setStartTime(Date.now());
      }

      const result = session.processInputEvent(inputEvt);
      setParsedRoman(result.parsedRoman);
      setInFlightRoman(result.inFlightRoman);
      setBufferedMistakes(result.bufferedMistakes);
      setPendingRoman(result.pendingRoman);

      if (
        result.type === 'KEY_SUCCEEDED' ||
        result.type === 'KANA_SUCCEEDED' ||
        result.type === 'FINISHED'
      ) {
        howlerAudio.playKeystroke();
        setHiraganaCursor(result.finishedKanaLength);
        setMistakeCount(0);

        if (result.type === 'FINISHED') {
          // Sentence finished!
          accumStatsRef.current.correctKeystrokes += session.correctKeystrokes;
          accumStatsRef.current.incorrectKeystrokes += session.incorrectKeystrokes;
          accumStatsRef.current.totalKeystrokes += session.totalKeystrokes;
          accumStatsRef.current.completedKana += session.sentence.hiragana.length;
          mergeKanaErrors(session.kanaErrors);

          const nextIndex = activeSentenceIndex + 1;

          if (nextIndex < sentences.length) {
            howlerAudio.playSentenceComplete();
            setActiveSentenceIndex(nextIndex);
            initializeSession(nextIndex);
          } else {
            // Entire passage complete!
            howlerAudio.playPassageVictory();
            const now = Date.now();
            const finalStats = calculateLiveStats(
              accumStatsRef.current.correctKeystrokes,
              accumStatsRef.current.incorrectKeystrokes,
              accumStatsRef.current.totalKeystrokes,
              accumStatsRef.current.completedKana,
              startTime,
              now,
              accumStatsRef.current.kanaErrors
            );
            onStatsUpdate(finalStats);
            onPassageComplete(finalStats);
          }
        }
      } else if (result.type === 'FAILED') {
        howlerAudio.playError();
        setMistakeCount(result.mistakeCount);
      } else if (result.type === 'BACK') {
        setMistakeCount(result.mistakeCount);
        setHiraganaCursor(result.finishedKanaLength);
      }
    });

    return () => unbind();
  }, [
    activeSentenceIndex,
    sentences,
    startTime,
    initializeSession,
    onStatsUpdate,
    onPassageComplete,
  ]);

  if (sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
        <Keyboard className="w-12 h-12 mb-3 opacity-40 text-slate-400" />
        <p className="text-base font-medium text-slate-300">No passage loaded</p>
        <p className="text-xs text-slate-500 mt-1">
          Click &quot;New Passage&quot; above to paste Japanese text or pick a preset literature piece.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6 outline-none">
      {/* Active Sentences Stream */}
      <div className="flex flex-col gap-5">
        {sentences.map((sentence, idx) => {
          const isActive = idx === activeSentenceIndex;
          const isCompleted = idx < activeSentenceIndex;

          return (
            <div
              key={sentence.id || idx}
              ref={isActive ? activeBlockRef : undefined}
              className="scroll-mt-28"
            >
              <SentenceBlock
                sentence={sentence}
                isActive={isActive}
                isCompleted={isCompleted}
                hiraganaCursor={isActive ? hiraganaCursor : 0}
                mistakeCount={isActive ? mistakeCount : 0}
                parsedRoman={isActive ? parsedRoman : ''}
                inFlightRoman={isActive ? inFlightRoman : ''}
                bufferedMistakes={isActive ? bufferedMistakes : ''}
                pendingRoman={isActive ? pendingRoman : ''}
                scriptMode={scriptMode}
                showTranslation={showTranslation}
              />
            </div>
          );
        })}
      </div>

      {/* Focus & Typing Hint */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-mono select-none pt-4">
        <span>Powered by Emiel (Google Mozc Rules) & WanaKana</span>
        <span>•</span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-400 text-[11px]">
            Tab
          </kbd>{' '}
          to restart
        </span>
      </div>
    </div>
  );
};

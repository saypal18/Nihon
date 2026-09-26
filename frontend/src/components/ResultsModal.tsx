'use client';

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, PlusCircle, AlertCircle, Clock, Zap, Target, Flame } from 'lucide-react';
import { TypingStats } from '../lib/types';
import { getRankedWeaknesses } from '../lib/stats';

interface ResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  onNewPassage: () => void;
  onOpenWeakModal: () => void;
  stats: TypingStats;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  isOpen,
  onClose,
  onReset,
  onNewPassage,
  onOpenWeakModal,
  stats,
}) => {
  useEffect(() => {
    if (isOpen) {
      // Fire confetti burst
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // Confetti optional
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const weaknesses = getRankedWeaknesses(stats.kanaErrors);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100">
        {/* Trophy & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3 shadow-inner">
            <Trophy className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Passage Completed!</h2>
          <p className="text-xs text-slate-400 mt-1">Excellent reading comprehension and typing practice</p>
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col items-center text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">WPM</span>
            <span className="text-2xl font-bold font-mono text-white mt-0.5">{stats.wpm}</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col items-center text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">KPM</span>
            <span className="text-2xl font-bold font-mono text-amber-400 mt-0.5">{stats.kpm}</span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col items-center text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Accuracy</span>
            <span
              className={`text-2xl font-bold font-mono mt-0.5 ${
                stats.accuracy >= 95
                  ? 'text-emerald-400'
                  : stats.accuracy >= 85
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {stats.accuracy}%
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col items-center text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Time</span>
            <span className="text-2xl font-bold font-mono text-slate-300 mt-0.5">
              {stats.elapsedSeconds}s
            </span>
          </div>
        </div>

        {/* Secondary Details */}
        <div className="mt-4 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-around text-xs text-slate-400 font-mono">
          <div>
            Total Keys: <span className="text-slate-200 font-semibold">{stats.totalKeystrokes}</span>
          </div>
          <div className="w-[1px] h-4 bg-slate-800" />
          <div>
            Correct: <span className="text-emerald-400 font-semibold">{stats.correctKeystrokes}</span>
          </div>
          <div className="w-[1px] h-4 bg-slate-800" />
          <div>
            Errors / Typos: <span className="text-red-400 font-semibold">{stats.incorrectKeystrokes}</span>
          </div>
        </div>

        {/* Kana Weakness Breakdown Heatmap */}
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Kana Weakness Breakdown</span>
          </div>

          {weaknesses.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-center text-xs text-emerald-400 font-medium">
              ✨ Flawless Run! No typos made on any kana characters!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
              {weaknesses.map((w, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-japanese font-bold text-base text-white px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      {w.char}
                    </span>
                    <span className="text-slate-400 text-[11px]">{w.errors} error{w.errors > 1 ? 's' : ''}</span>
                  </div>
                  <span className="font-mono text-red-400 font-semibold text-[11px]">
                    {w.errorRate}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={() => {
              onClose();
              onOpenWeakModal();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all"
          >
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Review Weak Items</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onNewPassage}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
            >
              <PlusCircle className="w-4 h-4 text-red-400" />
              <span>Load New Passage</span>
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all shadow-lg shadow-red-900/40"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Practice Again</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

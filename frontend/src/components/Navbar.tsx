'use client';

import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  RotateCcw,
  PlusCircle,
  Activity,
  Sparkles,
  Sliders,
  Flame,
} from 'lucide-react';
import { ScriptMode, TypingStats } from '../lib/types';
import { weakItemsManager } from '../lib/weakItemsManager';

interface NavbarProps {
  scriptMode: ScriptMode;
  setScriptMode: (mode: ScriptMode) => void;
  showTranslation: boolean;
  setShowTranslation: (show: boolean) => void;
  soundEnabled: boolean;
  onOpenAudioSettings: () => void;
  onOpenInputModal: () => void;
  onOpenWeakModal: () => void;
  onReset: () => void;
  stats: TypingStats;
  sentenceIndex: number;
  totalSentences: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  scriptMode,
  setScriptMode,
  showTranslation,
  setShowTranslation,
  soundEnabled,
  onOpenAudioSettings,
  onOpenInputModal,
  onOpenWeakModal,
  onReset,
  stats,
  sentenceIndex,
  totalSentences,
}) => {
  const [weakCount, setWeakCount] = useState<number>(0);

  useEffect(() => {
    setWeakCount(weakItemsManager.getTotalWeakCount());
    const unsub = weakItemsManager.subscribe(() => {
      setWeakCount(weakItemsManager.getTotalWeakCount());
    });
    return () => unsub();
  }, []);
  return (
    <header className="w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center font-bold text-red-500 text-xl tracking-tighter shadow-inner">
            日
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 tracking-wide text-lg">
                Nihon
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                Touch Typing
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Morphological Japanese Typing Engine
            </p>
          </div>
        </div>

        {/* Dynamic Script Toggle */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium">
          <button
            onClick={() => setScriptMode('original')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              scriptMode === 'original'
                ? 'bg-red-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Type with original Kanji & Kana display"
          >
            漢字 Original
          </button>
          <button
            onClick={() => setScriptMode('hiragana')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              scriptMode === 'hiragana'
                ? 'bg-red-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Display in pure Hiragana"
          >
            ひらがな
          </button>
          <button
            onClick={() => setScriptMode('katakana')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              scriptMode === 'katakana'
                ? 'bg-red-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Display in pure Katakana"
          >
            カタカナ
          </button>
        </div>

        {/* Live Metrics */}
        <div className="hidden md:flex items-center gap-6 text-xs font-mono">
          <div className="flex flex-col items-center">
            <span className="text-slate-500 uppercase tracking-widest text-[10px]">WPM</span>
            <span className="text-slate-200 font-bold text-base">{stats.wpm}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-800" />
          <div className="flex flex-col items-center">
            <span className="text-slate-500 uppercase tracking-widest text-[10px]">KPM</span>
            <span className="text-amber-400 font-bold text-base">{stats.kpm}</span>
          </div>
          <div className="w-[1px] h-6 bg-slate-800" />
          <div className="flex flex-col items-center">
            <span className="text-slate-500 uppercase tracking-widest text-[10px]">Accuracy</span>
            <span
              className={`font-bold text-base ${
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
          <div className="w-[1px] h-6 bg-slate-800" />
          <div className="flex flex-col items-center">
            <span className="text-slate-500 uppercase tracking-widest text-[10px]">Progress</span>
            <span className="text-slate-300 font-medium text-sm">
              {totalSentences > 0 ? `${Math.min(sentenceIndex + 1, totalSentences)} / ${totalSentences}` : '0/0'}
            </span>
          </div>
        </div>

        {/* Actions & Settings */}
        <div className="flex items-center gap-2">
          {/* Translation Toggle */}
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            className={`p-2 rounded-lg border transition-colors ${
              showTranslation
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title={showTranslation ? 'Hide English translation' : 'Show English translation'}
          >
            {showTranslation ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Audio Settings */}
          <button
            onClick={onOpenAudioSettings}
            className={`p-2 rounded-lg border transition-colors ${
              soundEnabled
                ? 'bg-slate-800 border-slate-700 text-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Audio & mechanical sound settings"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Reset button */}
          <button
            onClick={onReset}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Restart current passage (Tab + Enter)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Weak Items Detector */}
          <button
            onClick={onOpenWeakModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              weakCount > 0
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Inspect weak words, kanji, and kana lists"
          >
            <Flame className={`w-3.5 h-3.5 ${weakCount > 0 ? 'text-amber-400 fill-amber-400/20' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Weak Items</span>
            {weakCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                {weakCount}
              </span>
            )}
          </button>

          {/* New Passage */}
          <button
            onClick={onOpenInputModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5 text-red-400" />
            <span>New Passage</span>
          </button>
        </div>
      </div>
    </header>
  );
};

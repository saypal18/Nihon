'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  BookOpen,
  Loader2,
  Wand2,
  Trash2,
  Filter,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { extractUniqueKanji, KANJI_PRESETS } from '../lib/kanji';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, allowedKanji?: string) => Promise<void>;
  isLoading: boolean;
}

const PRESET_PASSAGES = [
  {
    title: '吾輩は猫である',
    label: 'I Am a Cat',
    text: '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。',
  },
  {
    title: '銀河鉄道の夜',
    label: 'Night on the Galactic Railroad',
    text: '「ではみなさんは、そういうふうに川だと云われたり、乳の流れたあとだと云われたりしていたこのぼんやりと白いものがほんとうは何かご承知ですか。」',
  },
  {
    title: '雪国',
    label: 'Snow Country',
    text: '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  },
  {
    title: '日常会話と旅行',
    label: 'Daily Travel & Food',
    text: 'こんにちは！日本への旅行はとても楽しみです。美味しいラーメンやお寿司をたくさん食べたいです。明日は京都のお寺を見に行きます。',
  },
];

export const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [customText, setCustomText] = useState('');
  const [allowedKanjiText, setAllowedKanjiText] = useState('');

  // Extract unique kanji in the entered allowed kanji string
  const allowedKanjiList = useMemo(() => {
    return extractUniqueKanji(allowedKanjiText);
  }, [allowedKanjiText]);

  // Extract unique kanji in the passage for the "Extract from passage" helper
  const passageKanjiList = useMemo(() => {
    return extractUniqueKanji(customText);
  }, [customText]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isLoading) {
        if (customText.trim()) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose, customText, allowedKanjiText]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customText.trim() || isLoading) return;

    const allowedArg = allowedKanjiText.trim() ? allowedKanjiText.trim() : undefined;
    await onSubmit(customText.trim(), allowedArg);
  };

  const handleExtractFromPassage = () => {
    if (passageKanjiList.length > 0) {
      setAllowedKanjiText(passageKanjiList.join(' '));
    }
  };

  const handleApplyPresetKanji = (kanjiString: string) => {
    setAllowedKanjiText(kanjiString);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-slate-200 flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Add New Passage</h2>
              <p className="text-xs text-slate-400">
                Input your Japanese passage and configure allowed Kanji
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 flex-1">
          {/* 1. Full Passage Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <FileText className="w-3.5 h-3.5 text-red-400" />
                <span>Full Japanese Passage</span>
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                {customText.length} chars {passageKanjiList.length > 0 && `• ${passageKanjiList.length} unique Kanji`}
              </span>
            </div>
            <textarea
              rows={4}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste or type Japanese text here with Kanji, Hiragana, or Katakana..."
              disabled={isLoading}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-japanese text-base sm:text-lg resize-none transition-all leading-relaxed"
            />
          </div>

          {/* 2. Allowed Kanji Field */}
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                <span>Allowed Kanji List (許可漢字)</span>
              </label>

              {/* Status Badge */}
              {allowedKanjiList.length > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{allowedKanjiList.length} Kanji allowed</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono text-slate-500 bg-slate-900 border border-slate-800">
                  All Kanji allowed (unrestricted)
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
              Any Kanji outside this list will be automatically rendered as <strong className="text-slate-200">Hiragana</strong> in Original mode. Leave blank to allow all Kanji.
            </p>

            <textarea
              rows={2}
              value={allowedKanjiText}
              onChange={(e) => setAllowedKanjiText(e.target.value)}
              placeholder="e.g. 猫 日 本 人 or space/comma-separated kanji..."
              disabled={isLoading}
              className="w-full rounded-lg bg-slate-950 border border-slate-800/80 p-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 font-japanese text-sm resize-none transition-all tracking-wider"
            />

            {/* Helper tools & quick presets */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/60 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider mr-1">
                  Presets:
                </span>
                <button
                  type="button"
                  onClick={handleExtractFromPassage}
                  disabled={isLoading || passageKanjiList.length === 0}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/50"
                  title="Extract all Kanji appearing in the text above"
                >
                  <Wand2 className="w-3 h-3 text-amber-400" />
                  <span>Extract from passage ({passageKanjiList.length})</span>
                </button>

                {KANJI_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPresetKanji(preset.kanji)}
                    disabled={isLoading}
                    className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] transition-colors border border-slate-800"
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {allowedKanjiText && (
                <button
                  type="button"
                  onClick={() => setAllowedKanjiText('')}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Live Allowed Kanji Chips Preview */}
            {allowedKanjiList.length > 0 && (
              <div className="max-h-20 overflow-y-auto flex flex-wrap gap-1 pt-1.5 border-t border-slate-800/40">
                {allowedKanjiList.map((k) => (
                  <span
                    key={k}
                    className="w-6 h-6 flex items-center justify-center font-japanese text-xs font-medium rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 3. Streamlined Sample Passages */}
          <div className="pt-1">
            <span className="text-[11px] font-medium text-slate-400 block mb-1.5">
              Or load a sample excerpt:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PRESET_PASSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomText(preset.text)}
                  disabled={isLoading}
                  className="text-left p-2 rounded-lg bg-slate-950/40 border border-slate-800/70 hover:border-slate-700 hover:bg-slate-800/40 transition-all text-xs group"
                >
                  <div className="font-japanese font-medium text-slate-300 group-hover:text-red-400 transition-colors truncate">
                    {preset.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    {preset.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-800 shrink-0">
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Shortcut: <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">Ctrl+Enter</kbd>
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!customText.trim() || isLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-xs sm:text-sm transition-all shadow-lg shadow-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing & Translating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Start Typing</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

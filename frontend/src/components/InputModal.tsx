'use client';

import React, { useState } from 'react';
import { X, Sparkles, BookOpen, Send, Loader2 } from 'lucide-react';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
  isLoading: boolean;
}

const PRESET_PASSAGES = [
  {
    title: '吾輩は猫である (I Am a Cat)',
    author: '夏目漱石 (Natsume Sōseki)',
    text: '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。',
  },
  {
    title: '銀河鉄道の夜 (Night on the Galactic Railroad)',
    author: '宮沢賢治 (Miyazawa Kenji)',
    text: '「ではみなさんは、そういうふうに川だと云われたり、乳の流れたあとだと云われたりしていたこのぼんやりと白いものがほんとうは何かご承知ですか。」',
  },
  {
    title: '日常会話と旅行 (Daily Travel & Food)',
    author: 'Practical Japanese',
    text: 'こんにちは！日本への旅行はとても楽しみです。美味しいラーメンやお寿司をたくさん食べたいです。明日は京都のお寺を見に行きます。',
  },
  {
    title: '雪国 (Snow Country)',
    author: '川端康成 (Yasunari Kawabata)',
    text: '国境の長いトンネルを抜けると雪国であった。夜の底が白くなった。信号所に汽車が止まった。',
  },
];

export const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [customText, setCustomText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || isLoading) return;
    await onSubmit(customText.trim());
  };

  const handleSelectPreset = (text: string) => {
    setCustomText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-slate-100">Load Japanese Passage</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Paste or Type Japanese Text
            </label>
            <textarea
              rows={4}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste any Japanese text with Kanji, Hiragana, or Katakana here..."
              disabled={isLoading}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 font-japanese text-base resize-none transition-all"
            />
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Or Choose a Classic Preset:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_PASSAGES.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(preset.text)}
                  disabled={isLoading}
                  className="text-left p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all group"
                >
                  <div className="font-semibold text-xs text-slate-200 group-hover:text-red-400 transition-colors">
                    {preset.title}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-japanese">
                    {preset.text}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!customText.trim() || isLoading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-all shadow-lg shadow-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing & Translating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Parse & Start Typing</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

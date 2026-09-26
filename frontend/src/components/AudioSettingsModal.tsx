'use client';

import React, { useEffect } from 'react';
import { X, Volume2, VolumeX, Play, Sliders, Music, Zap, ShieldAlert, Loader2, Sparkles } from 'lucide-react';
import { AudioSettings, SoundProfile, TTSEngine } from '../lib/types';
import { howlerAudio } from '../lib/howlerAudio';
import { toggleSpeech, useSpeechState } from '../lib/speech';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AudioSettings;
  onUpdateSettings: (newSettings: Partial<AudioSettings>) => void;
}

const SWITCH_PROFILES: {
  id: SoundProfile;
  name: string;
  description: string;
  badge: string;
}[] = [
  {
    id: 'thock',
    name: 'Lubed Linear (Thock)',
    description: 'Deep, dampened, low-pitched satisfying mechanical clack.',
    badge: 'Recommended',
  },
  {
    id: 'brown',
    name: 'Brown Tactile',
    description: 'Subtle tactile bump with moderate plastic snap sound.',
    badge: 'Balanced',
  },
  {
    id: 'blue',
    name: 'Blue Clicky',
    description: 'Crisp, loud acoustic transient click with light spring resonance.',
    badge: 'Acoustic',
  },
];

const TTS_ENGINES: {
  id: TTSEngine;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
}[] = [
  {
    id: 'qwen-large',
    name: 'Qwen3-TTS Large (1.7B)',
    description: 'Studio-grade generative voice with native Japanese speaker (ono_anna). Highest prosody & realism.',
    badge: 'Studio GPU',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'qwen-small',
    name: 'Qwen3-TTS Small (0.6B)',
    description: 'Lightweight 0.6B model on your RTX 5070 Ti. Fast response times and low synthesis latency.',
    badge: 'Fast GPU',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'browser',
    name: 'Browser Web Speech API',
    description: 'Client-side synthesized voice via your browser / OS. Instant playback with zero GPU memory.',
    badge: 'Built-in',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
];

// Sub-component for individual TTS engine row with state-aware test button
const TTSEngineOption: React.FC<{
  engine: typeof TTS_ENGINES[0];
  isSelected: boolean;
  onSelect: () => void;
}> = ({ engine, isSelected, onSelect }) => {
  const speechId = `test-tts-${engine.id}`;
  const speechState = useSpeechState(speechId);

  const handleTestTTS = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    toggleSpeech(speechId, 'こんにちは、日本語の練習をしましょう。', engine.id);
  };

  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
      }`}
    >
      <div className="flex-1 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">{engine.name}</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${engine.badgeColor}`}>
            {engine.badge}
          </span>
          {isSelected && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{engine.description}</p>
      </div>

      <button
        type="button"
        onClick={handleTestTTS}
        className={`p-2 rounded-lg transition-all ml-2 shrink-0 flex items-center justify-center ${
          speechState === 'loading'
            ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/50'
            : speechState === 'playing'
            ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/50 animate-pulse'
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
        }`}
        title={
          speechState === 'loading'
            ? 'Synthesizing voice... (click to cancel)'
            : speechState === 'playing'
            ? 'Playing voice (click to stop)'
            : 'Test voice'
        }
      >
        {speechState === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        ) : speechState === 'playing' ? (
          <Volume2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current" />
        )}
      </button>
    </div>
  );
};

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const testKeySound = (profile: SoundProfile) => {
    howlerAudio.playKeystroke(profile);
  };

  const testErrorSound = () => {
    howlerAudio.playError();
  };

  const testChimeSound = () => {
    howlerAudio.playSentenceComplete();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-slate-200 custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">Audio & Voice Engine Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* TTS Engine Selection Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Japanese Speech Synthesis (TTS) Engine
              </label>
              <span className="text-[11px] text-amber-400 font-mono">
                Current: {settings.ttsEngine || 'qwen-large'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {TTS_ENGINES.map((engine) => (
                <TTSEngineOption
                  key={engine.id}
                  engine={engine}
                  isSelected={(settings.ttsEngine || 'qwen-large') === engine.id}
                  onSelect={() => onUpdateSettings({ ttsEngine: engine.id })}
                />
              ))}
            </div>
          </div>

          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              {settings.enabled ? (
                <Volume2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <div className="text-sm font-semibold text-slate-200">Keystroke Sound Effects</div>
                <div className="text-xs text-slate-400">Mechanical keyboard audio feedback</div>
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                settings.enabled
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {settings.enabled ? 'Enabled' : 'Muted'}
            </button>
          </div>

          {/* Switch Profile Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Mechanical Switch Profile
            </label>
            <div className="grid grid-cols-1 gap-2">
              {SWITCH_PROFILES.map((p) => {
                const isSelected = settings.profile === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onUpdateSettings({ profile: p.id });
                      testKeySound(p.id);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-200">{p.name}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        testKeySound(p.id);
                      }}
                      className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors ml-2"
                      title="Test click sound"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Volume Sliders */}
          <div className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span className="font-medium">Keystroke Volume</span>
                <span className="font-mono text-slate-400">
                  {Math.round(settings.keyVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.keyVolume}
                onChange={(e) => onUpdateSettings({ keyVolume: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span className="font-medium">Typo / Error Volume</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-400">
                    {Math.round(settings.errorVolume * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={testErrorSound}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    Test
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.errorVolume}
                onChange={(e) => onUpdateSettings({ errorVolume: parseFloat(e.target.value) })}
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span className="font-medium">Sentence Complete Chime</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-400">
                    {Math.round(settings.chimeVolume * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={testChimeSound}
                    className="text-[10px] text-emerald-400 hover:underline"
                  >
                    Test
                  </button>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.chimeVolume}
                onChange={(e) => onUpdateSettings({ chimeVolume: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

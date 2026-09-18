'use client';

import React from 'react';
import { X, Volume2, VolumeX, Play, Sliders, Music, Zap, ShieldAlert } from 'lucide-react';
import { AudioSettings, SoundProfile } from '../lib/types';
import { howlerAudio } from '../lib/howlerAudio';

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

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">Audio & Mechanical Switch Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3">
              {settings.enabled ? (
                <Volume2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <div className="text-sm font-semibold text-slate-200">Sound Effects</div>
                <div className="text-xs text-slate-400">Web Audio API procedural sound engine</div>
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
              Mechanical Switch Sound Profile
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
                <span className="font-medium">Typo / Error Thud Volume</span>
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

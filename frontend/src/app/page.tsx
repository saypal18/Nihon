'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { TypingArea } from '../components/TypingArea';
import { InputModal } from '../components/InputModal';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { ResultsModal } from '../components/ResultsModal';
import {
  Sentence,
  ScriptMode,
  TypingStats,
  AudioSettings,
} from '../lib/types';
import { howlerAudio, DEFAULT_AUDIO_SETTINGS } from '../lib/howlerAudio';

const DEFAULT_PASSAGE: Sentence[] = [
  {
    id: 1,
    original: '吾輩は猫である。',
    hiragana: 'わがはいはねこである。',
    katakana: 'ワガハイハネコデアル。',
    translation: 'I am a cat.',
    tokens: [
      { surface: '吾輩', reading: 'ワガハイ', hiragana: 'わがはい', is_punctuation: false },
      { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false },
      { surface: '猫', reading: 'ネコ', hiragana: 'ねこ', is_punctuation: false },
      { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false },
      { surface: 'ある', reading: 'アル', hiragana: 'ある', is_punctuation: false },
      { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
    ],
  },
  {
    id: 2,
    original: '名前はまだ無い。',
    hiragana: 'なまえはまだない。',
    katakana: 'ナマエハマダナイ。',
    translation: 'I do not have a name yet.',
    tokens: [
      { surface: '名前', reading: 'ナマエ', hiragana: 'なまえ', is_punctuation: false },
      { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false },
      { surface: 'まだ', reading: 'マダ', hiragana: 'まだ', is_punctuation: false },
      { surface: '無い', reading: 'ナイ', hiragana: 'ない', is_punctuation: false },
      { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
    ],
  },
  {
    id: 3,
    original: 'どこで生れたかとんと見当がつかぬ。',
    hiragana: 'どこでうまれたかとんとけんとうがつかぬ。',
    katakana: 'ドコデウマレタカトントケントウガツカヌ。',
    translation: 'I have no inkling where I was born.',
    tokens: [
      { surface: 'どこ', reading: 'ドコ', hiragana: 'どこ', is_punctuation: false },
      { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false },
      { surface: '生れ', reading: 'ウマレ', hiragana: 'うまれ', is_punctuation: false },
      { surface: 'た', reading: 'タ', hiragana: 'た', is_punctuation: false },
      { surface: 'か', reading: 'カ', hiragana: 'か', is_punctuation: false },
      { surface: 'とんと', reading: 'トント', hiragana: 'とんと', is_punctuation: false },
      { surface: '見当', reading: 'ケントウ', hiragana: 'けんとう', is_punctuation: false },
      { surface: 'が', reading: 'ガ', hiragana: 'が', is_punctuation: false },
      { surface: 'つか', reading: 'ツカ', hiragana: 'つか', is_punctuation: false },
      { surface: 'ぬ', reading: 'ヌ', hiragana: 'ぬ', is_punctuation: false },
      { surface: '。', reading: '。', hiragana: '。', is_punctuation: true },
    ],
  },
];

const INITIAL_STATS: TypingStats = {
  kpm: 0,
  wpm: 0,
  cpm: 0,
  accuracy: 100,
  correctKeystrokes: 0,
  incorrectKeystrokes: 0,
  totalKeystrokes: 0,
  elapsedSeconds: 0,
  kanaErrors: {},
};

export default function Home() {
  const [sentences, setSentences] = useState<Sentence[]>(DEFAULT_PASSAGE);
  const [scriptMode, setScriptMode] = useState<ScriptMode>('original');
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  const [stats, setStats] = useState<TypingStats>(INITIAL_STATS);
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  // Modals state
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isLoadingPassage, setIsLoadingPassage] = useState(false);

  // Audio settings
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);

  // Sync audio settings with singleton
  const updateAudioSettings = (partial: Partial<AudioSettings>) => {
    setAudioSettings((prev) => {
      const next = { ...prev, ...partial };
      howlerAudio.setSettings(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem('nihon_audio_settings', JSON.stringify(next));
      }
      return next;
    });
  };

  // Load saved audio settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nihon_audio_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAudioSettings(parsed);
          howlerAudio.setSettings(parsed);
        } catch (e) {
          // ignore
        }
      }
    }
  }, []);

  // Quick reset handler
  const handleReset = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
    setStats(INITIAL_STATS);
    setIsResultsModalOpen(false);
  }, []);

  // Tab key listener for fast reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !isInputModalOpen && !isAudioSettingsOpen) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReset, isInputModalOpen, isAudioSettingsOpen]);

  // Prevent spacebar from scrolling the page unless typing in an editable field
  useEffect(() => {
    const handlePreventSpaceScroll = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space' || e.key === 'Spacebar') {
        const target = e.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === 'TEXTAREA' ||
            (target.tagName === 'INPUT' &&
              !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(
                (target as HTMLInputElement).type?.toLowerCase() || ''
              )) ||
            target.isContentEditable);

        if (!isEditable) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handlePreventSpaceScroll);
    return () => window.removeEventListener('keydown', handlePreventSpaceScroll);
  }, []);

  // Handle Passage Submission to FastAPI backend
  const handleProcessPassage = async (text: string) => {
    setIsLoadingPassage(true);
    try {
      const res = await fetch('http://localhost:8000/api/process-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error(`Backend returned status ${res.status}`);
      }

      const data = await res.json();
      if (data.sentences && data.sentences.length > 0) {
        setSentences(data.sentences);
        setIsInputModalOpen(false);
        handleReset();
      }
    } catch (err) {
      console.error('Failed to parse passage via backend:', err);
      alert('Could not connect to FastAPI backend at http://localhost:8000. Please ensure the backend is running.');
    } finally {
      setIsLoadingPassage(false);
    }
  };

  const handlePassageComplete = (finalStats: TypingStats) => {
    setStats(finalStats);
    setIsResultsModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-red-500/30 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        scriptMode={scriptMode}
        setScriptMode={setScriptMode}
        showTranslation={showTranslation}
        setShowTranslation={setShowTranslation}
        soundEnabled={audioSettings.enabled}
        onOpenAudioSettings={() => setIsAudioSettingsOpen(true)}
        onOpenInputModal={() => setIsInputModalOpen(true)}
        onReset={handleReset}
        stats={stats}
        sentenceIndex={0}
        totalSentences={sentences.length}
      />

      {/* Main Typing Workspace */}
      <main className="flex-1 flex flex-col items-center justify-center py-6 px-4">
        <TypingArea
          sentences={sentences}
          scriptMode={scriptMode}
          showTranslation={showTranslation}
          onStatsUpdate={setStats}
          onPassageComplete={handlePassageComplete}
          resetTrigger={resetTrigger}
        />
      </main>

      {/* Footer info bar */}
      <footer className="border-t border-slate-900 py-3 text-center text-xs text-slate-500 font-mono">
        <span>Nihon Touch-Typing • SudachiPy Morphological Engine & Local Ollama Translation</span>
      </footer>

      {/* Modals */}
      <InputModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onSubmit={handleProcessPassage}
        isLoading={isLoadingPassage}
      />

      <AudioSettingsModal
        isOpen={isAudioSettingsOpen}
        onClose={() => setIsAudioSettingsOpen(false)}
        settings={audioSettings}
        onUpdateSettings={updateAudioSettings}
      />

      <ResultsModal
        isOpen={isResultsModalOpen}
        onClose={() => setIsResultsModalOpen(false)}
        onReset={handleReset}
        onNewPassage={() => {
          setIsResultsModalOpen(false);
          setIsInputModalOpen(true);
        }}
        stats={stats}
      />
    </div>
  );
}

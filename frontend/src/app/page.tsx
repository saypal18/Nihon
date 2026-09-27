'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { TypingArea } from '../components/TypingArea';
import { InputModal } from '../components/InputModal';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { ResultsModal } from '../components/ResultsModal';
import { GlossarySidebar } from '../components/GlossarySidebar';
import { WeakItemsModal } from '../components/WeakItemsModal';
import {
  Sentence,
  ScriptMode,
  TypingStats,
  AudioSettings,
  SelectedWordInfo,
  TokenReading,
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
      { surface: '吾輩', reading: 'ワガハイ', hiragana: 'わがはい', is_punctuation: false, dictionary_form: '吾輩' },
      { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false, dictionary_form: 'は' },
      { surface: '猫', reading: 'ネコ', hiragana: 'ねこ', is_punctuation: false, dictionary_form: '猫' },
      { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false, dictionary_form: 'だ' },
      { surface: 'ある', reading: 'アル', hiragana: 'ある', is_punctuation: false, dictionary_form: 'ある' },
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
      { surface: '名前', reading: 'ナマエ', hiragana: 'なまえ', is_punctuation: false, dictionary_form: '名前' },
      { surface: 'は', reading: 'ハ', hiragana: 'は', is_punctuation: false, dictionary_form: 'は' },
      { surface: 'まだ', reading: 'マダ', hiragana: 'まだ', is_punctuation: false, dictionary_form: 'まだ' },
      { surface: '無い', reading: 'ナイ', hiragana: 'ない', is_punctuation: false, dictionary_form: '無い' },
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
      { surface: 'どこ', reading: 'ドコ', hiragana: 'どこ', is_punctuation: false, dictionary_form: 'どこ' },
      { surface: 'で', reading: 'デ', hiragana: 'で', is_punctuation: false, dictionary_form: 'で' },
      { surface: '生れ', reading: 'ウマレ', hiragana: 'うまれ', is_punctuation: false, dictionary_form: '生れる' },
      { surface: 'た', reading: 'タ', hiragana: 'た', is_punctuation: false, dictionary_form: 'た' },
      { surface: 'か', reading: 'カ', hiragana: 'か', is_punctuation: false, dictionary_form: 'か' },
      { surface: 'とんと', reading: 'トント', hiragana: 'とんと', is_punctuation: false, dictionary_form: 'とんと' },
      { surface: '見当', reading: 'ケントウ', hiragana: 'けんとう', is_punctuation: false, dictionary_form: '見当' },
      { surface: 'が', reading: 'ガ', hiragana: 'が', is_punctuation: false, dictionary_form: 'が' },
      { surface: 'つか', reading: 'ツカ', hiragana: 'つか', is_punctuation: false, dictionary_form: 'つく' },
      { surface: 'ぬ', reading: 'ヌ', hiragana: 'ぬ', is_punctuation: false, dictionary_form: 'ぬ' },
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
  const [isWeakModalOpen, setIsWeakModalOpen] = useState(false);
  const [isLoadingPassage, setIsLoadingPassage] = useState(false);
  const [selectedWord, setSelectedWord] = useState<SelectedWordInfo | null>(null);

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

  // Multi-token resolved span for active sentence
  const [activeResolvedSpan, setActiveResolvedSpan] = useState<[number, number] | null>(null);
  const [activeResolvedIsCompound, setActiveResolvedIsCompound] = useState<boolean | null>(null);

  // Quick reset handler
  const handleReset = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
    setStats(INITIAL_STATS);
    setIsResultsModalOpen(false);
    setSelectedWord(null);
    setActiveResolvedSpan(null);
    setActiveResolvedIsCompound(null);
  }, []);

  // Word selection handler
  const handleSelectToken = useCallback(
    (
      sentence: Sentence,
      token: TokenReading,
      tokenIndex: number,
      clickedStart?: number,
      clickedEnd?: number
    ) => {
      setSelectedWord((prev) => {
        const isSameSentenceSelection = Boolean(
          prev &&
          prev.sentenceId === sentence.id &&
          prev.tokenIndex === tokenIndex &&
          prev.clickedStart === clickedStart &&
          prev.clickedEnd === clickedEnd
        );
        if (isSameSentenceSelection && activeResolvedIsCompound === false) {
          setActiveResolvedSpan(null);
          setActiveResolvedIsCompound(null);
          return null;
        }
        if (isSameSentenceSelection && activeResolvedIsCompound === true) {
          setActiveResolvedSpan(null);
          setActiveResolvedIsCompound(null);
          return {
            sentenceId: sentence.id,
            tokenIndex,
            token,
            sentence,
            clickedStart,
            clickedEnd,
            selectionScope: 'exact',
          };
        }
        if (isSameSentenceSelection) {
          return prev;
        }
        const clickedWithinActiveResolution = Boolean(
          prev &&
          prev.sentenceId === sentence.id &&
          activeResolvedIsCompound === true &&
          activeResolvedSpan &&
          clickedStart !== undefined &&
          clickedEnd !== undefined &&
          clickedStart >= activeResolvedSpan[0] &&
          clickedEnd <= activeResolvedSpan[1]
        );
        setActiveResolvedSpan(null);
        setActiveResolvedIsCompound(null);
        return {
          sentenceId: sentence.id,
          tokenIndex,
          token,
          sentence,
          clickedStart,
          clickedEnd,
          selectionScope: clickedWithinActiveResolution ? 'exact' : 'sentence',
        };
      });
    },
    [activeResolvedIsCompound, activeResolvedSpan]
  );

  const isOverlayOpen =
    isInputModalOpen || isAudioSettingsOpen || isResultsModalOpen || isWeakModalOpen;

  // Escape key closes the glossary sidebar if open
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedWord) {
        setSelectedWord(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [selectedWord]);

  // Tab key listener for fast reset
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !isOverlayOpen) {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleReset, isOverlayOpen]);

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
  const handleProcessPassage = async (text: string, allowedKanji?: string) => {
    setIsLoadingPassage(true);
    try {
      const res = await fetch('http://localhost:8000/api/process-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, allowed_kanji: allowedKanji }),
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
        onOpenWeakModal={() => setIsWeakModalOpen(true)}
        onReset={handleReset}
        stats={stats}
        sentenceIndex={0}
        totalSentences={sentences.length}
      />

      {/* Main Typing Workspace */}
      <main
        className={`flex-1 flex flex-col items-center justify-center py-6 px-4 transition-all duration-300 ${
          selectedWord ? 'xl:pr-96' : ''
        }`}
      >
        <TypingArea
          sentences={sentences}
          scriptMode={scriptMode}
          showTranslation={showTranslation}
          onStatsUpdate={setStats}
          onPassageComplete={handlePassageComplete}
          resetTrigger={resetTrigger}
          isOverlayOpen={isOverlayOpen}
          selectedToken={
            selectedWord
              ? {
                  sentenceId: selectedWord.sentenceId,
                  tokenIndex: selectedWord.tokenIndex,
                }
              : null
          }
          onSelectToken={handleSelectToken}
          activeResolvedSpan={activeResolvedSpan}
        />
      </main>

      {/* Footer info bar */}
      <footer
        className={`border-t border-slate-900 py-3 text-center text-xs text-slate-500 font-mono transition-all duration-300 ${
          selectedWord ? 'xl:pr-96' : ''
        }`}
      >
        <span>Nihon Touch-Typing • SudachiPy Morphological Engine & Local Ollama Translation</span>
      </footer>

      {/* Modals & Slide-out Glossary */}
      <GlossarySidebar
        selectedWord={selectedWord}
        onClose={() => {
          setSelectedWord(null);
          setActiveResolvedSpan(null);
          setActiveResolvedIsCompound(null);
        }}
        onResolvedSpanChange={setActiveResolvedSpan}
        onResolvedCompoundChange={setActiveResolvedIsCompound}
        onSelectSubToken={(subToken) => {
          if (!selectedWord) return;
          setSelectedWord({
            sentenceId: selectedWord.sentenceId,
            tokenIndex: selectedWord.tokenIndex,
            token: {
              surface: subToken.surface,
              reading: subToken.reading,
              hiragana: subToken.reading,
              is_punctuation: false,
              dictionary_form: subToken.lemma,
              part_of_speech: subToken.pos,
            },
            sentence: selectedWord.sentence,
            clickedStart: subToken.start_char,
            clickedEnd: subToken.end_char,
            selectionScope: 'component',
          });
          setActiveResolvedIsCompound(null);
        }}
      />

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
        onOpenWeakModal={() => setIsWeakModalOpen(true)}
        stats={stats}
      />

      <WeakItemsModal
        isOpen={isWeakModalOpen}
        onClose={() => setIsWeakModalOpen(false)}
      />
    </div>
  );
}

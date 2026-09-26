'use client';

import React, { useState, useEffect } from 'react';
import { SelectedWordInfo, GlossaryData } from '../lib/types';
import { useSpeechState, toggleSpeech, stopSpeech } from '../lib/speech';
import { X, BookOpen, Volume2, Sparkles, Loader2, Tag, ExternalLink, VolumeX } from 'lucide-react';

interface GlossarySidebarProps {
  selectedWord: SelectedWordInfo | null;
  onClose: () => void;
}

export const GlossarySidebar: React.FC<GlossarySidebarProps> = ({
  selectedWord,
  onClose,
}) => {
  const [data, setData] = useState<GlossaryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speechId = selectedWord
    ? `glossary-${selectedWord.sentenceId}-${selectedWord.tokenIndex}`
    : 'glossary-idle';
  const speechState = useSpeechState(speechId);

  // Stop speech when closing or unmounting
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  // Fetch glossary data whenever selectedWord changes
  useEffect(() => {
    if (!selectedWord) {
      return;
    }

    const { token, sentence } = selectedWord;
    let isCancelled = false;

    const fetchGlossary = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/glossary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: token.surface,
            dictionary_form: token.dictionary_form,
            reading: token.reading || token.hiragana,
            sentence_context: sentence.raw_original || sentence.original,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const json: GlossaryData = await res.json();
        if (!isCancelled) {
          setData(json);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('Failed to load glossary from backend:', err);
          setData({
            word: token.surface,
            dictionary_form: token.dictionary_form,
            reading: token.hiragana,
            romaji: '',
            senses: [
              {
                english_definitions: ['(Backend glossary service unreachable)'],
                parts_of_speech: token.part_of_speech || [],
                tags: [],
              },
            ],
            is_common: false,
            source: 'fallback',
          });
          setError('Could not reach backend glossary API.');
          setIsLoading(false);
        }
      }
    };

    // Defer loading state trigger
    const timer = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(true);
      }
    }, 0);

    fetchGlossary();

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [selectedWord]);

  const handlePronounce = () => {
    if (!selectedWord) return;
    const textToPronounce =
      data?.reading || selectedWord.token.hiragana || selectedWord.token.surface;
    toggleSpeech(speechId, textToPronounce);
  };

  const isOpen = Boolean(selectedWord);

  return (
    <aside
      aria-label="Glossary Sidebar"
      className={`fixed top-0 right-0 h-full w-84 sm:w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
    >
      {/* Top Header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2 text-slate-200">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-300">
            Word Glossary
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close sidebar (Esc)"
          aria-label="Close sidebar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {selectedWord && (
          <>
            {/* Word Banner Box */}
            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 shadow-inner">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-japanese text-3xl font-bold text-amber-300 tracking-wider">
                    {selectedWord.token.surface}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-slate-400 font-mono text-sm">
                    <span className="font-japanese text-emerald-400 font-medium">
                      {data?.reading || selectedWord.token.hiragana}
                    </span>
                    {data?.romaji && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span>{data.romaji}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePronounce}
                  title={
                    speechState === 'loading'
                      ? 'Synthesizing with Qwen3-TTS... (click to cancel)'
                      : speechState === 'playing'
                      ? 'Speaking with Qwen3-TTS (click to stop)'
                      : speechState === 'error'
                      ? 'Speech generation failed'
                      : 'Pronounce word (Qwen3-TTS)'
                  }
                  aria-label="Pronounce word"
                  className={`p-2 rounded-lg transition-all flex items-center justify-center ${
                    speechState === 'loading'
                      ? 'text-amber-400 bg-amber-400/20 ring-1 ring-amber-400/50'
                      : speechState === 'playing'
                      ? 'text-emerald-400 bg-emerald-400/20 ring-1 ring-emerald-400/50 animate-pulse'
                      : speechState === 'error'
                      ? 'text-rose-400 bg-rose-400/20 ring-1 ring-rose-400/50'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`}
                >
                  {speechState === 'loading' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : speechState === 'error' ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Tags row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-900/80">
                {selectedWord.token.dictionary_form &&
                  selectedWord.token.dictionary_form !== selectedWord.token.surface && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      <span>Base:</span>
                      <span className="font-japanese font-medium">
                        {selectedWord.token.dictionary_form}
                      </span>
                    </span>
                  )}

                {data?.jlpt_level && (
                  <span className="inline-flex items-center text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {data.jlpt_level}
                  </span>
                )}

                {data?.is_common && (
                  <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    Common
                  </span>
                )}

                {data?.senses?.[0]?.parts_of_speech?.slice(0, 2).map((pos, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    <Tag className="w-2.5 h-2.5 opacity-60" />
                    <span>{pos}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400 font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Looking up dictionary & AI context...</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Contextual AI Explanation */}
            {data?.context_explanation && (
              <div className="rounded-xl bg-gradient-to-br from-amber-500/10 via-slate-900 to-slate-950 border border-amber-500/30 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Context in Sentence</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {data.context_explanation}
                </p>
              </div>
            )}

            {/* English Definitions Section */}
            {data && data.senses && data.senses.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Definitions
                </h3>

                <div className="space-y-2.5">
                  {data.senses.slice(0, 5).map((sense, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3 space-y-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono flex items-center justify-center mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 text-sm text-slate-200">
                          {sense.english_definitions.join('; ')}
                        </div>
                      </div>

                      {/* Part of speech & info if present */}
                      {(sense.parts_of_speech.length > 0 || sense.info) && (
                        <div className="pl-6 text-[11px] text-slate-500 font-mono flex flex-wrap gap-x-2">
                          {sense.parts_of_speech.length > 0 && (
                            <span className="italic">
                              {sense.parts_of_speech.join(', ')}
                            </span>
                          )}
                          {sense.info && <span>({sense.info})</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Jisho External link */}
            <div className="pt-2">
              <a
                href={`https://jisho.org/search/${encodeURIComponent(
                  selectedWord.token.dictionary_form || selectedWord.token.surface
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition-colors font-mono"
              >
                <span>View full entry on Jisho.org</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 text-center text-[11px] text-slate-500 font-mono">
        <span>Click any letter to inspect • Press </span>
        <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
          Esc
        </kbd>
        <span> to close</span>
      </div>
    </aside>
  );
};

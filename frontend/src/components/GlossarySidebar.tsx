'use client';

import React, { useState, useEffect } from 'react';
import { SelectedWordInfo, GlossaryData, SubTokenInfo } from '../lib/types';
import { useSpeechState, toggleSpeech, stopSpeech } from '../lib/speech';
import {
  X,
  BookOpen,
  Volume2,
  Sparkles,
  Loader2,
  ExternalLink,
  VolumeX,
  Layers,
  GitCommit,
  Split,
  Info
} from 'lucide-react';

interface GlossarySidebarProps {
  selectedWord: SelectedWordInfo | null;
  onClose: () => void;
  onResolvedSpanChange?: (span: [number, number] | null) => void;
  onResolvedCompoundChange?: (isCompound: boolean) => void;
  onSelectSubToken?: (subToken: SubTokenInfo) => void;
}

export const GlossarySidebar: React.FC<GlossarySidebarProps> = ({
  selectedWord,
  onClose,
  onResolvedSpanChange,
  onResolvedCompoundChange,
  onSelectSubToken,
}) => {
  const [glossaryResult, setGlossaryResult] = useState<{
    key: string;
    data: GlossaryData;
    error: string | null;
  } | null>(null);

  const speechId = selectedWord
    ? `glossary-${selectedWord.sentenceId}-${selectedWord.clickedStart ?? selectedWord.tokenIndex}-${selectedWord.clickedEnd ?? ''}`
    : 'glossary-idle';
  const speechState = useSpeechState(speechId);
  const clickedSurface = selectedWord
    ? (() => {
        const sentenceText = selectedWord.sentence.raw_original || selectedWord.sentence.original;
        const { clickedStart, clickedEnd } = selectedWord;
        if (
          clickedStart !== undefined &&
          clickedEnd !== undefined &&
          clickedStart >= 0 &&
          clickedStart < clickedEnd &&
          clickedEnd <= sentenceText.length
        ) {
          return sentenceText.slice(clickedStart, clickedEnd);
        }
        return selectedWord.token.raw_surface || selectedWord.token.surface;
      })()
    : '';
  const selectionKey = selectedWord
    ? JSON.stringify([
        selectedWord.sentenceId,
        selectedWord.sentence.raw_original || selectedWord.sentence.original,
        selectedWord.clickedStart ?? null,
        selectedWord.clickedEnd ?? null,
        selectedWord.selectionScope || 'sentence',
        selectedWord.tokenIndex,
      ])
    : null;
  const hasCurrentResult = Boolean(selectionKey && glossaryResult?.key === selectionKey);
  const data = hasCurrentResult ? glossaryResult?.data || null : null;
  const error = hasCurrentResult ? glossaryResult?.error || null : null;
  const isLoading = Boolean(selectedWord && !hasCurrentResult);

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

    const { token, sentence, clickedStart, clickedEnd } = selectedWord;
    const requestKey = selectionKey;
    if (!requestKey) return;
    let isCancelled = false;

    const fetchGlossary = async () => {
      try {
        const sentenceText = sentence.raw_original || sentence.original;
        const res = await fetch('http://localhost:8000/api/glossary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sentence: sentenceText,
            clicked_start: clickedStart,
            clicked_end: clickedEnd,
            selection_scope: selectedWord.selectionScope || 'sentence',
            word: token.surface,
            dictionary_form: token.dictionary_form,
            reading: token.reading || token.hiragana,
            sentence_context: sentenceText,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const json: GlossaryData = await res.json();
        if (!isCancelled) {
          setGlossaryResult({ key: requestKey, data: json, error: null });
          if (json.resolved_span && onResolvedSpanChange) {
            onResolvedSpanChange(json.resolved_span);
          }
          const resolvedSpan = json.resolved_span;
          const expandedBeyondClick = Boolean(
            resolvedSpan &&
            clickedStart !== undefined &&
            clickedEnd !== undefined &&
            (resolvedSpan[0] !== clickedStart || resolvedSpan[1] !== clickedEnd)
          );
          onResolvedCompoundChange?.(
            Boolean(
              (json.sub_tokens?.length ?? 0) > 1 ||
              expandedBeyondClick
            )
          );
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('Failed to load glossary from backend:', err);
          setGlossaryResult({
            key: requestKey,
            data: {
              word: clickedSurface,
              reading: token.hiragana,
              romaji: '',
              senses: [
                {
                  english_definitions: ['(Local dictionary service unreachable)'],
                  parts_of_speech: token.part_of_speech || [],
                  tags: [],
                },
              ],
              is_common: false,
              source: 'fallback',
            },
            error: 'Could not reach backend glossary API.',
          });
          onResolvedCompoundChange?.(false);
        }
      }
    };

    fetchGlossary();

    return () => {
      isCancelled = true;
    };
  }, [selectedWord, selectionKey, clickedSurface, onResolvedSpanChange, onResolvedCompoundChange]);

  const handlePronounce = () => {
    if (!data || isLoading) return;
    toggleSpeech(speechId, { text: data.word, kana: data.reading });
  };

  const isOpen = Boolean(selectedWord);

  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case 'idiom':
        return { label: 'Idiom / Expression', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      case 'auxiliary':
        return { label: 'Grammar Construction', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'compound':
        return { label: 'Compound Noun', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' };
      case 'particle':
        return { label: 'Particle (助詞)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
      case 'name':
        return { label: 'Proper Name', color: 'bg-pink-500/20 text-pink-300 border-pink-500/40' };
      default:
        return null;
    }
  };

  const catBadge = getCategoryBadge(data?.category);

  return (
    <aside
      aria-label="Glossary Sidebar"
      className={`fixed top-0 right-0 h-full w-88 sm:w-[420px] bg-slate-900/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
    >
      {/* Top Header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2 text-slate-200">
          <BookOpen className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-sm tracking-wide uppercase text-slate-300">
            Contextual Glossary
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
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {selectedWord && (
          <>
            {/* Word Banner Box */}
            <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 shadow-inner">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-japanese text-3xl font-bold text-amber-300 tracking-wider">
                    {data?.word || clickedSurface}
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
                  disabled={!data || isLoading}
                  title="Listen to this glossary entry"
                  aria-label="Listen to this glossary entry"
                  className={`p-2 rounded-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
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
                {catBadge && (
                  <span className={`inline-flex items-center text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${catBadge.color}`}>
                    {catBadge.label}
                  </span>
                )}

                {data?.dictionary_form &&
                  data.dictionary_form !== data.word && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      <span>Base:</span>
                      <span className="font-japanese font-medium">
                        {data.dictionary_form}
                      </span>
                    </span>
                  )}

                {data?.jlpt_level && (
                  <span className="inline-flex items-center text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {data.jlpt_level}
                  </span>
                )}

                {data?.is_common && (
                  <span className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Common
                  </span>
                )}
              </div>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-400 font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Resolving context & morphology...</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Contextual Meaning in Sentence */}
            {data?.context_explanation && (
              <div className="rounded-xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/30 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Meaning in this Sentence</span>
                </div>
                <p className="text-sm font-medium text-slate-200 leading-relaxed">
                  {data.context_explanation}
                </p>
              </div>
            )}

            {/* Grammar Construction Card */}
            {data?.grammar_info && (
              <div className="rounded-xl bg-gradient-to-br from-blue-500/15 via-slate-900 to-slate-950 border border-blue-500/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Grammar Pattern</span>
                  </div>
                  {data.grammar_info.level && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                      {data.grammar_info.level}
                    </span>
                  )}
                </div>

                <div className="font-japanese font-bold text-base text-blue-200">
                  {data.grammar_info.pattern_name}
                </div>
                <div className="text-xs text-slate-300 font-medium">
                  {data.grammar_info.meaning}
                </div>

                {data.grammar_info.formation && (
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/80">
                    <span className="text-blue-300">Formation: </span>
                    {data.grammar_info.formation}
                  </div>
                )}

                <p className="text-xs text-slate-400 leading-relaxed">
                  {data.grammar_info.explanation}
                </p>
              </div>
            )}

            {/* Inflection Breakdown Card */}
            {data?.inflection_info && (
              <div className="rounded-xl bg-gradient-to-br from-violet-500/15 via-slate-900 to-slate-950 border border-violet-500/30 p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 uppercase tracking-wider">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Inflection Breakdown</span>
                </div>

                <div className="text-xs font-medium text-violet-200">
                  {data.inflection_info.form_name}
                </div>
                <p className="text-xs text-slate-400">
                  {data.inflection_info.description}
                </p>

                {data.inflection_info.components.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
                    {data.inflection_info.components.map((comp, cIdx) => (
                      <div key={cIdx} className="flex items-center justify-between text-[11px] font-mono text-slate-400 py-0.5">
                        <span className="font-japanese font-medium text-slate-200">
                          {comp.surface} {comp.lemma !== comp.surface && `(${comp.lemma})`}
                        </span>
                        <span className="text-violet-300 text-[10px]">{comp.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Component Sub-tokens Drilldown */}
            {data?.sub_tokens && data.sub_tokens.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Split className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Component Words (Click to Inspect)</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {data.sub_tokens.map((st, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        onResolvedSpanChange?.(null);
                        onResolvedCompoundChange?.(false);
                        onSelectSubToken?.(st);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 transition-all text-xs font-mono text-slate-300 flex items-center gap-1.5 cursor-pointer shadow-sm group"
                      title={`Inspect '${st.surface}'`}
                    >
                      <span className="font-japanese font-semibold text-emerald-300 group-hover:text-emerald-200">
                        {st.surface}
                      </span>
                      {st.lemma && st.lemma !== st.surface && (
                        <span className="text-slate-500 text-[10px]">
                          ({st.lemma})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dictionary Definitions Section */}
            {data && data.senses && data.senses.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Dictionary Definitions
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    JMdict Local DB
                  </span>
                </div>
                {data.inflection_info && data.dictionary_form && data.dictionary_form !== data.word && (
                  <p className="-mt-2 text-[10px] font-mono text-slate-500">
                    Base-form entry: <span className="font-japanese text-slate-400">{data.dictionary_form}</span>
                  </p>
                )}

                <div className="space-y-2.5">
                  {data.senses.slice(0, 5).map((sense, idx) => {
                    const isSelected = (data.selected_sense_index ?? 0) === idx;
                    return (
                      <div
                        key={idx}
                        className={`rounded-lg p-3 space-y-1.5 transition-all ${
                          isSelected
                            ? 'bg-slate-950/90 border border-amber-400/50 shadow-md ring-1 ring-amber-400/20'
                            : 'bg-slate-950/50 border border-slate-800/60'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`flex-shrink-0 w-4 h-4 rounded-full text-[10px] font-mono flex items-center justify-center mt-0.5 ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 font-bold'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-200">
                              {sense.english_definitions.join('; ')}
                            </div>
                            {isSelected && (
                              <span className="inline-block mt-1 text-[10px] font-mono font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30">
                                Best Contextual Match
                              </span>
                            )}
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
                    );
                  })}
                </div>
              </div>
            )}

            {/* Kanji Breakdown Section */}
            {data?.kanji_breakdown && data.kanji_breakdown.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kanji Breakdown</span>
                </h3>

                <div className="grid grid-cols-1 gap-2">
                  {data.kanji_breakdown.map((kb, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/25 flex items-center justify-center font-japanese text-2xl font-bold text-amber-300 shrink-0">
                        {kb.kanji}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">
                            {kb.meaning}
                          </span>
                          {kb.jlpt_level && (
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              {kb.jlpt_level}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 flex flex-wrap gap-x-3">
                          {kb.onyomi.length > 0 && (
                            <span>
                              <span className="text-slate-500">On: </span>
                              {kb.onyomi.slice(0, 2).join(', ')}
                            </span>
                          )}
                          {kb.kunyomi.length > 0 && (
                            <span>
                              <span className="text-slate-500">Kun: </span>
                              {kb.kunyomi.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Jisho External Link for reference */}
            <div className="pt-2">
              <a
                href={`https://jisho.org/search/${encodeURIComponent(
                  data?.dictionary_form || data?.word || selectedWord.token.surface
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
        <span>Click any token to inspect • Press </span>
        <kbd className="px-1 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
          Esc
        </kbd>
        <span> to close</span>
      </div>
    </aside>
  );
};

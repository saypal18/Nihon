'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Flame,
  Search,
  Plus,
  Copy,
  Check,
  Trash2,
  Settings,
  Sparkles,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Info,
} from 'lucide-react';
import {
  WeakCategory,
  WeakItem,
  WeakStatus,
  WeakItemsState,
  weakItemsManager,
} from '../lib/weakItemsManager';

interface WeakItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: WeakCategory;
}

const CATEGORIES: { id: WeakCategory; label: string; iconLabel: string }[] = [
  { id: 'words', label: 'Words', iconLabel: '単語' },
  { id: 'kanji', label: 'Kanji', iconLabel: '漢字' },
  { id: 'hiragana', label: 'Hiragana', iconLabel: 'あ' },
  { id: 'katakana', label: 'Katakana', iconLabel: 'ア' },
];

export const WeakItemsModal: React.FC<WeakItemsModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'words',
}) => {
  const [activeCategory, setActiveCategory] = useState<WeakCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WeakStatus | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [state, setState] = useState<WeakItemsState>(weakItemsManager.getState());

  // Add Item form state
  const [addText, setAddText] = useState('');
  const [addReading, setAddReading] = useState('');
  const [addMeaning, setAddMeaning] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Sync with manager
  useEffect(() => {
    const unsubscribe = weakItemsManager.subscribe((newState) => {
      setState({ ...newState });
    });
    setState(weakItemsManager.getState());
    return () => unsubscribe();
  }, []);

  // Update active category when initialCategory changes
  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddOpen) {
          setIsAddOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddOpen, onClose]);

  const items = useMemo(() => {
    return weakItemsManager.getCategoryItems(activeCategory);
  }, [activeCategory, state]);

  // Filter items by status and search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesText = item.text.toLowerCase().includes(query);
        const matchesReading = item.reading?.toLowerCase().includes(query);
        const matchesRomaji = item.romaji?.toLowerCase().includes(query);
        const matchesMeaning = item.meaning?.toLowerCase().includes(query);
        return matchesText || matchesReading || matchesRomaji || matchesMeaning;
      }
      return true;
    });
  }, [items, statusFilter, searchQuery]);

  const categoryCounts = useMemo(() => {
    return {
      words: Object.keys(state.words).length,
      kanji: Object.keys(state.kanji).length,
      hiragana: Object.keys(state.hiragana).length,
      katakana: Object.keys(state.katakana).length,
    };
  }, [state]);

  const handleCopyItem = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  const handleCopyAll = async (format: 'lines' | 'comma' | 'tsv' = 'lines') => {
    try {
      const text = weakItemsManager.exportCategoryText(activeCategory, format);
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (e) {
      console.error('Failed to copy all to clipboard', e);
    }
  };

  const handleDeleteItem = (text: string) => {
    weakItemsManager.deleteItem(activeCategory, text);
  };

  const handleClearCategory = () => {
    if (
      window.confirm(
        `Are you sure you want to clear all ${activeCategory} from your weak list?`
      )
    ) {
      weakItemsManager.clearCategory(activeCategory);
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!addText.trim()) {
      setAddError('Please enter text.');
      return;
    }

    const success = weakItemsManager.addItem(activeCategory, addText, {
      reading: addReading.trim() || undefined,
      meaning: addMeaning.trim() || undefined,
    });

    if (success) {
      setAddText('');
      setAddReading('');
      setAddMeaning('');
      setIsAddOpen(false);
    } else {
      setAddError(
        activeCategory === 'kanji'
          ? 'Must contain at least one valid Kanji character.'
          : 'Failed to add item.'
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Weak Items Detector
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-amber-500/20">
                  {weakItemsManager.getTotalWeakCount()} Total
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automatically saved words, kanji, and kana from typing mistakes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border transition-colors ${
                showSettings
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
              title="Graduation & Auto-Remove Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Close modal (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings Drawer (Collapsible) */}
        {showSettings && (
          <div className="px-6 py-3 bg-slate-950/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={state.settings.autoRemoveOnMastery}
                  onChange={(e) =>
                    weakItemsManager.updateSettings({
                      autoRemoveOnMastery: e.target.checked,
                    })
                  }
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Auto-remove items upon graduation (3 clean runs)</span>
              </label>
            </div>
            <div className="text-[11px] text-slate-500">
              Graduation rule: Zero mistakes on item for 3 consecutive passage runs.
            </div>
          </div>
        )}

        {/* Category Tabs Bar */}
        <div className="px-6 pt-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat.id];
              const isActive = activeCategory === cat.id;

              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setStatusFilter('all');
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold tracking-wide transition-all border-t border-x ${
                    isActive
                      ? 'bg-slate-950 text-white border-slate-800 -mb-[1px] shadow-sm'
                      : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <span className="font-japanese text-sm opacity-80">
                    {cat.iconLabel}
                  </span>
                  <span>{cat.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Actions (Add & Export) */}
          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add {CATEGORIES.find((c) => c.id === activeCategory)?.label}</span>
            </button>

            <button
              onClick={() => handleCopyAll('lines')}
              disabled={items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 border border-slate-700 text-xs font-medium transition-all"
              title="Copy all items in this list to clipboard"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy All</span>
                </>
              )}
            </button>

            {items.length > 0 && (
              <button
                onClick={handleClearCategory}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Clear all items in this category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeCategory} by text, reading, or meaning...`}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-700"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 text-[11px] font-mono mr-1">Status:</span>
            {(['all', 'critical', 'practicing', 'improving', 'mastered'] as const).map(
              (st) => {
                const isSel = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] capitalize transition-all ${
                      isSel
                        ? st === 'critical'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold'
                          : st === 'practicing'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : st === 'improving'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold'
                          : st === 'mastered'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'bg-slate-700 text-white font-semibold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Modal Inline Add Form */}
        {isAddOpen && (
          <form
            onSubmit={handleAddItem}
            className="px-6 py-4 bg-slate-950 border-b border-amber-500/30 flex flex-col gap-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Add new {activeCategory} manually</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  {activeCategory === 'kanji' ? 'Kanji Character *' : 'Japanese Text *'}
                </label>
                <input
                  type="text"
                  required
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder={
                    activeCategory === 'words'
                      ? 'e.g. 猫'
                      : activeCategory === 'kanji'
                      ? 'e.g. 吾'
                      : activeCategory === 'hiragana'
                      ? 'e.g. ね'
                      : 'e.g. コ'
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm font-japanese text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Reading (Optional)
                </label>
                <input
                  type="text"
                  value={addReading}
                  onChange={(e) => setAddReading(e.target.value)}
                  placeholder="e.g. ねこ"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  English Meaning (Optional)
                </label>
                <input
                  type="text"
                  value={addMeaning}
                  onChange={(e) => setAddMeaning(e.target.value)}
                  placeholder="e.g. cat"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {addError && <p className="text-xs text-rose-400">{addError}</p>}

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-all"
              >
                Save Item
              </button>
            </div>
          </form>
        )}

        {/* Items List Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center text-slate-500">
              <BookOpen className="w-10 h-10 mb-3 opacity-30 text-slate-400" />
              <p className="text-sm font-medium text-slate-300">
                {items.length === 0
                  ? `No weak ${activeCategory} recorded yet`
                  : 'No items match your filter/search criteria'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {items.length === 0
                  ? `When you make typing mistakes in passages, tricky ${activeCategory} will be automatically saved here for targeted review.`
                  : 'Try clearing the search or switching status filters.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isCopied = copiedId === item.id;
                const statusColor =
                  item.status === 'critical'
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                    : item.status === 'practicing'
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    : item.status === 'improving'
                    ? 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

                return (
                  <div
                    key={item.id}
                    className="group relative rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 p-4 transition-all duration-200 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top row: Character, reading & badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-japanese text-2xl sm:text-3xl font-bold text-white tracking-wide">
                            {item.text}
                          </span>
                          {item.reading && item.reading !== item.text && (
                            <span className="font-japanese text-sm text-emerald-400">
                              {item.reading}
                            </span>
                          )}
                          {item.romaji && (
                            <span className="text-xs font-mono text-slate-500">
                              {item.romaji}
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>

                      {/* Dictionary form & Meaning if present */}
                      {(item.meaning || item.dictionaryForm) && (
                        <div className="mt-2 text-xs text-slate-300 space-y-0.5">
                          {item.meaning && (
                            <p className="line-clamp-2 text-slate-300 font-medium">
                              {item.meaning}
                            </p>
                          )}
                          {item.dictionaryForm && item.dictionaryForm !== item.text && (
                            <p className="text-[11px] text-slate-500 font-mono">
                              Base: <span className="text-slate-400">{item.dictionaryForm}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Context snippet if present */}
                      {item.contextSentence && (
                        <div className="mt-2 text-[11px] text-slate-400 font-japanese line-clamp-1 italic bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                          &ldquo;{item.contextSentence}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Bottom Metadata & Controls */}
                    <div className="mt-3.5 pt-3 border-t border-slate-900 flex items-center justify-between gap-2 text-xs font-mono">
                      {/* Mistakes & Streak Indicator */}
                      <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                        <span className="text-rose-400 font-semibold">
                          {item.mistakes} typo{item.mistakes > 1 ? 's' : ''}
                        </span>

                        <span className="text-slate-600">•</span>

                        {/* Clean Streak dots (3 max) */}
                        <div
                          className="flex items-center gap-1"
                          title={`Clean streak: ${item.cleanStreak}/3 runs without mistakes`}
                        >
                          <span className="text-slate-500 text-[10px]">Streak:</span>
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map((idx) => {
                              const isFilled = item.cleanStreak > idx;
                              return (
                                <span
                                  key={idx}
                                  className={`w-2 h-2 rounded-full transition-colors ${
                                    isFilled
                                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                                      : 'bg-slate-800'
                                  }`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Card Action Buttons (Copy & Delete) */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyItem(item.text, item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                          title="Copy word to clipboard"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item.text)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remove from weak list"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-500 font-mono">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Type items cleanly 3 times in a row to graduate and auto-remove them.
            </span>
          </div>
          <span className="hidden sm:inline">Nihon Adaptive Mistake Tracking</span>
        </div>
      </div>
    </div>
  );
};

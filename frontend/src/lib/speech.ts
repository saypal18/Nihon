import { useState, useEffect } from 'react';
import { Sentence, TTSEngine } from './types';

// Speech synthesis manager supporting Qwen3-TTS (Large/Small) and Browser Web Speech API
// Includes a client-side FIFO audio cache (buffer length = 10) to prevent redundant model calls

export type SpeechState = 'idle' | 'loading' | 'playing' | 'error';

export interface ActiveSpeechInfo {
  id: string;
  state: SpeechState;
  error?: string;
}

type SpeechListener = (active: ActiveSpeechInfo | null) => void;
const listeners = new Set<SpeechListener>();

let currentActive: ActiveSpeechInfo | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAbortController: AbortController | null = null;

const BACKEND_TTS_URL = 'http://localhost:8000/api/tts';

// --- FIFO Audio Cache (buffer length = 10) ---
const FIFO_CACHE_LIMIT = 10;
const audioCache = new Map<string, string>(); // cacheKey -> blob object URL
const cacheQueue: string[] = [];              // FIFO order of cache keys

function getCachedAudioUrl(cacheKey: string): string | undefined {
  return audioCache.get(cacheKey);
}

function putCachedAudioUrl(cacheKey: string, url: string): void {
  // If already in cache, keep existing
  if (audioCache.has(cacheKey)) {
    return;
  }

  // FIFO eviction: evict oldest entry when capacity is reached
  if (cacheQueue.length >= FIFO_CACHE_LIMIT) {
    const oldestKey = cacheQueue.shift();
    if (oldestKey) {
      const oldestUrl = audioCache.get(oldestKey);
      if (oldestUrl) {
        URL.revokeObjectURL(oldestUrl);
        audioCache.delete(oldestKey);
      }
    }
  }

  cacheQueue.push(cacheKey);
  audioCache.set(cacheKey, url);
}

function updateActive(active: ActiveSpeechInfo | null) {
  currentActive = active;
  listeners.forEach((listener) => listener(currentActive));
}

/**
 * Reads the selected TTS engine from localStorage, defaulting to 'qwen-large'
 */
export function getCurrentTTSEngine(): TTSEngine {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('nihon_audio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.ttsEngine) {
          return parsed.ttsEngine;
        }
      }
    } catch {
      // fallback
    }
  }
  return 'qwen-large';
}

/**
 * Derives accurate phonetic string for the browser's Web Speech API
 */
export function getPronunciationText(sentence: Sentence): string {
  if (sentence.tokens && sentence.tokens.length > 0) {
    return sentence.tokens
      .map((t) => {
        if (t.surface === 'は' && !t.is_punctuation) return 'わ';
        if (t.surface === 'へ' && !t.is_punctuation) return 'え';
        return t.hiragana;
      })
      .join('');
  }
  return sentence.hiragana || sentence.original;
}

/**
 * Returns current speech state for a given ID ('idle' | 'loading' | 'playing' | 'error')
 */
export function useSpeechState(id: string): SpeechState {
  const [state, setState] = useState<SpeechState>(() =>
    currentActive?.id === id ? currentActive.state : 'idle'
  );

  useEffect(() => {
    setState(currentActive?.id === id ? currentActive.state : 'idle');

    const handleChange = (active: ActiveSpeechInfo | null) => {
      if (active?.id === id) {
        setState(active.state);
      } else {
        setState('idle');
      }
    };

    listeners.add(handleChange);
    return () => {
      listeners.delete(handleChange);
    };
  }, [id]);

  return state;
}

/**
 * Stops any ongoing audio playback or cancels pending TTS generation requests
 */
export function stopSpeech(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }

  if (currentActive) {
    updateActive(null);
  }
}

/**
 * Plays an audio element and manages the speech lifecycle
 */
function playAudioInstance(id: string, audioUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(audioUrl);
    activeAudio = audio;

    audio.onplay = () => {
      updateActive({ id, state: 'playing' });
    };

    const cleanup = () => {
      if (activeAudio === audio) {
        activeAudio = null;
      }
      if (currentActive?.id === id) {
        updateActive(null);
      }
      resolve();
    };

    audio.onended = cleanup;
    audio.onerror = () => {
      console.error('Audio playback error on generated WAV audio');
      cleanup();
    };

    audio.play().catch((err) => {
      console.error('Playback failed:', err);
      cleanup();
    });
  });
}

/**
 * Toggles speech synthesis based on user's configured engine ('qwen-large' | 'qwen-small' | 'browser'):
 * - If the same audio item is loading or playing -> cancels/stops it.
 * - If a different audio was loading/playing -> stops it and starts the new one.
 * - Checks 10-item FIFO cache: hitting the same sound button with the same selected model
 *   skips the backend call and plays immediately from cache.
 */
export async function toggleSpeech(
  id: string,
  input: Sentence | string,
  overrideEngine?: TTSEngine
): Promise<void> {
  // If the same item is currently loading or playing, clicking again cancels it
  if (currentActive && currentActive.id === id) {
    stopSpeech();
    return;
  }

  // Stop any other currently playing or loading audio
  stopSpeech();

  const engine = overrideEngine || getCurrentTTSEngine();

  // 1. Browser Web Speech API
  if (engine === 'browser') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      updateActive({ id, state: 'error', error: 'Web Speech API not supported in browser' });
      setTimeout(() => updateActive(null), 2000);
      return;
    }

    const phoneticText = typeof input === 'string' ? input : getPronunciationText(input);
    const utterance = new SpeechSynthesisUtterance(phoneticText);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.95;

    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find((v) =>
      v.lang.replace('_', '-').toLowerCase().startsWith('ja')
    );
    if (jaVoice) {
      utterance.voice = jaVoice;
    }

    activeUtterance = utterance;

    utterance.onstart = () => {
      updateActive({ id, state: 'playing' });
    };

    const handleEnd = () => {
      if (activeUtterance === utterance) {
        activeUtterance = null;
      }
      if (currentActive?.id === id) {
        updateActive(null);
      }
    };

    utterance.onend = handleEnd;
    utterance.onerror = handleEnd;

    window.speechSynthesis.speak(utterance);
    return;
  }

  // 2. Qwen3-TTS (Large or Small via local GPU backend)
  const fullText = typeof input === 'string' ? input : input.original || input.hiragana;
  if (!fullText || !fullText.trim()) return;

  const modelSize = engine === 'qwen-small' ? 'small' : 'large';
  const cacheKey = `${modelSize}:${fullText.trim()}`;

  // Check 10-slot FIFO cache: if already synthesized with this model, play immediately without re-triggering model
  const cachedUrl = getCachedAudioUrl(cacheKey);
  if (cachedUrl) {
    await playAudioInstance(id, cachedUrl);
    return;
  }

  const controller = new AbortController();
  activeAbortController = controller;

  // Immediately notify UI that this item is in the 'loading' state
  updateActive({ id, state: 'loading' });

  try {
    const res = await fetch(BACKEND_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: fullText,
        model_size: modelSize,
        instruction: 'Speak clearly with accurate standard Japanese pronunciation and natural rhythm for language learning.',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`TTS server returned status ${res.status}`);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Received empty audio from TTS server');
    }

    // Check if user clicked cancel while the network fetch was resolving
    if (controller.signal.aborted) {
      return;
    }

    const audioUrl = URL.createObjectURL(blob);
    // Put into FIFO cache
    putCachedAudioUrl(cacheKey, audioUrl);

    await playAudioInstance(id, audioUrl);
  } catch (err: unknown) {
    // If the request was deliberately aborted by user click, quietly exit
    if (controller.signal.aborted) {
      return;
    }

    console.error(`Qwen3-TTS (${modelSize}) generation error:`, err);
    updateActive({ id, state: 'error', error: String(err) });

    // Display error state briefly, then return to idle
    setTimeout(() => {
      if (currentActive?.id === id && currentActive.state === 'error') {
        updateActive(null);
      }
    }, 2500);
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
  }
}

/**
 * Legacy compatibility helper
 */
export function speakJapanese(
  input: Sentence | string,
  onStart?: () => void,
  onEnd?: () => void
): void {
  const id = typeof input === 'string' ? `inline-${input}` : `sentence-${input.id}`;
  toggleSpeech(id, input).then(() => {
    onStart?.();
  });
}

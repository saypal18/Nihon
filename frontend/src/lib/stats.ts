import { TypingStats, KanaStat } from './types';

export function calculateLiveStats(
  correctKeystrokes: number,
  incorrectKeystrokes: number,
  totalKeystrokes: number,
  completedKana: number,
  startTime: number | null,
  now: number,
  kanaErrors: Record<string, KanaStat>
): TypingStats {
  const elapsedMs = startTime ? Math.max(now - startTime, 1) : 0;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const elapsedMinutes = elapsedMs / 60000;

  // Accuracy: (Correct Keystrokes / Total Keystrokes) * 100
  const accuracy =
    totalKeystrokes > 0
      ? Math.round((correctKeystrokes / totalKeystrokes) * 100)
      : 100;

  // KPM: Correct Keystrokes / Elapsed Minutes
  const kpm =
    elapsedMinutes > 0
      ? Math.round(correctKeystrokes / elapsedMinutes)
      : 0;

  // WPM: KPM / 5
  const wpm = Math.round(kpm / 5);

  // CPM: Japanese Mora Completed / Elapsed Minutes
  const cpm =
    elapsedMinutes > 0
      ? Math.round(completedKana / elapsedMinutes)
      : 0;

  return {
    kpm,
    wpm,
    cpm,
    accuracy,
    correctKeystrokes,
    incorrectKeystrokes,
    totalKeystrokes,
    elapsedSeconds,
    kanaErrors,
  };
}

export function getRankedWeaknesses(kanaErrors: Record<string, KanaStat>) {
  return Object.entries(kanaErrors)
    .filter(([char, stat]) => stat.errors > 0 && char !== 'unknown')
    .map(([char, stat]) => ({
      char,
      errors: stat.errors,
      attempts: stat.attempts,
      errorRate: Math.round((stat.errors / stat.attempts) * 100),
    }))
    .sort((a, b) => b.errorRate - a.errorRate || b.errors - a.errors);
}

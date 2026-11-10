const VALID_HINT_KINDS = new Set(["full", "frame", "audio"]);
const VALID_MODES = new Set(["click", "text", "voice"]);

function sameRound(left, right) {
  // SameValueZero semantics: NaN matches NaN, while 0 and -0 match each other.
  return Object.is(left, right) || left === right;
}

function emptySnapshot(round) {
  return {
    round,
    attempts: [],
    phrases: [],
    reviewPhraseIds: [],
    totals: {
      attemptCount: 0,
      matchedAttemptCount: 0,
      independentAttemptCount: 0,
      byMode: { click: 0, text: 0, voice: 0 },
      phraseCount: 0,
      independentPhraseCount: 0,
      reviewPhraseCount: 0,
    },
  };
}

/**
 * Create an isolated in-memory practice log.
 *
 * Only IDs and categorical outcomes are retained. Transcript contents, audio,
 * and device data are neither accepted as log state nor persisted.
 */
export function createPracticeLog() {
  let active = false;
  let currentRound;
  let attempts = [];
  let seenAttemptIds = new Set();
  let hintsByPhrase = new Map();

  function isCurrentRound(round) {
    return active && sameRound(round, currentRound);
  }

  function isHinted(phraseId) {
    return hintsByPhrase.has(phraseId);
  }

  /** Start a round and clear every attempt and hint from the previous round. */
  function begin(round) {
    if (!Number.isSafeInteger(round) || round < 0 || (active && round <= currentRound)) return;
    active = true;
    currentRound = round;
    attempts = [];
    seenAttemptIds = new Set();
    hintsByPhrase = new Map();
  }

  /**
   * Mark a full sentence, sentence frame, or model-audio hint as displayed.
   * Returns false for stale rounds and unsupported hint kinds.
   */
  function markHint(round, phraseId, kind) {
    if (!isCurrentRound(round) || typeof phraseId !== 'string' || !phraseId || !VALID_HINT_KINDS.has(kind)) {
      return false;
    }

    let kinds = hintsByPhrase.get(phraseId);
    if (!kinds) {
      kinds = new Set();
      hintsByPhrase.set(phraseId, kinds);
    }
    kinds.add(kind);
    return true;
  }

  /**
   * Record one unique attempt.
   *
   * matched === true means semantic understanding only, never pronunciation
   * accuracy. An edited voice transcript is reclassified as text;
   * the transcript value itself is immediately discarded.
   */
  function record(input) {
    if (input === null || typeof input !== "object") {
      return { accepted: false, reason: "invalid-attempt" };
    }

    const {
      round,
      attemptId,
      phraseId,
      mode,
      matched: matchedInput,
      editedTranscript,
    } = input;

    if (!isCurrentRound(round)) {
      return { accepted: false, reason: "stale-round" };
    }
    if (!VALID_MODES.has(mode)) {
      return { accepted: false, reason: "invalid-mode" };
    }
    if (typeof phraseId !== 'string' || !phraseId ||
        (typeof attemptId !== 'string' && !Number.isSafeInteger(attemptId)) || attemptId === '') {
      return { accepted: false, reason: "invalid-attempt" };
    }
    if (seenAttemptIds.has(attemptId)) {
      return { accepted: false, reason: "duplicate-attempt" };
    }

    const effectiveMode = mode === "voice" && editedTranscript === true ? "text" : mode;
    const matched = matchedInput === true;
    const hinted = isHinted(phraseId);
    const independent = effectiveMode === "voice" && matched && !hinted;
    const storedAttempt = {
      attemptId,
      phraseId,
      mode: effectiveMode,
      matched,
      hinted,
      independent,
    };

    seenAttemptIds.add(attemptId);
    attempts.push(storedAttempt);

    return {
      accepted: true,
      mode: effectiveMode,
      matched,
      hinted,
      independent,
    };
  }

  /**
   * Return a fresh review snapshot. Stale-round snapshots are empty.
   *
   * Each outcome keeps the help used by the time of that attempt.
   */
  function snapshot(round) {
    if (!isCurrentRound(round)) {
      return emptySnapshot(round);
    }

    const attemptCopies = attempts.map(attempt => ({...attempt}));

    const phraseOrder = [];
    const attemptsByPhrase = new Map();
    const ensurePhrase = (phraseId) => {
      if (!attemptsByPhrase.has(phraseId)) {
        attemptsByPhrase.set(phraseId, []);
        phraseOrder.push(phraseId);
      }
      return attemptsByPhrase.get(phraseId);
    };

    // A hinted phrase remains visible for review even if it has no attempt.
    for (const phraseId of hintsByPhrase.keys()) {
      ensurePhrase(phraseId);
    }
    for (const attempt of attempts) {
      ensurePhrase(attempt.phraseId).push(attempt);
    }

    const phrases = phraseOrder.map((phraseId) => {
      const relatedAttempts = attemptsByPhrase.get(phraseId);
      const hintKinds = Array.from(hintsByPhrase.get(phraseId) || []);
      const independent = relatedAttempts.some(attempt => attempt.independent);
      return {
        phraseId,
        attemptCount: relatedAttempts.length,
        matched: relatedAttempts.some((attempt) => attempt.matched === true),
        hinted: hintKinds.length > 0,
        hintKinds,
        independent,
        needsReview: !independent,
      };
    });

    const byMode = { click: 0, text: 0, voice: 0 };
    let matchedAttemptCount = 0;
    let independentAttemptCount = 0;
    for (const attempt of attemptCopies) {
      byMode[attempt.mode] += 1;
      if (attempt.matched) matchedAttemptCount += 1;
      if (attempt.independent) independentAttemptCount += 1;
    }

    const reviewPhraseIds = phrases
      .filter((phrase) => phrase.needsReview)
      .map((phrase) => phrase.phraseId);
    const independentPhraseCount = phrases.filter(
      (phrase) => phrase.independent,
    ).length;

    return {
      round: currentRound,
      attempts: attemptCopies,
      phrases,
      reviewPhraseIds,
      totals: {
        attemptCount: attemptCopies.length,
        matchedAttemptCount,
        independentAttemptCount,
        byMode,
        phraseCount: phrases.length,
        independentPhraseCount,
        reviewPhraseCount: reviewPhraseIds.length,
      },
    };
  }

  return Object.freeze({ begin, markHint, record, snapshot });
}

export default createPracticeLog;

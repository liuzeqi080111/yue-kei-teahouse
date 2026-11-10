const VERSION = 1;
const STORAGE_KEY = "yueyu-game.review-store.v1";
const MAX_PHRASES = 100;
const MAX_ROUNDS = 500;
const MAX_COUNT = 1_000_000;
const MAX_ROUND_COUNT = 10_000;
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function cleanId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return ID_PATTERN.test(id) ? id : null;
}

function boundedInteger(value, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(maximum, Math.floor(value));
}

function storedInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : null;
}

function addCounts(left, right) {
  return Math.min(MAX_COUNT, left + right);
}

function dateValue(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Create an isolated review store. Storage is always supplied by the caller;
 * this module never reads browser storage or any other global storage.
 */
export function createReviewStore({ storage = null, now = Date.now } = {}) {
  const clock = typeof now === "function" ? now : () => now;

  function timestamp() {
    try {
      const value = clock();
      const date = value === undefined ? new Date() : new Date(value);
      if (Number.isFinite(date.getTime())) {
        return { milliseconds: date.getTime(), iso: date.toISOString() };
      }
    } catch {
      // A broken injected clock must not break the current session.
    }
    const date = new Date();
    return { milliseconds: date.getTime(), iso: date.toISOString() };
  }

  function emptyState() {
    return {
      version: VERSION,
      updatedAt: timestamp().iso,
      phrases: [],
      rounds: [],
    };
  }

  function restorePhrase(value) {
    if (!isRecord(value)) return null;
    const phraseId = cleanId(value.phraseId);
    const attemptCount = storedInteger(value.attemptCount);
    const matched = storedInteger(value.matched);
    const hinted = storedInteger(value.hinted);
    const independent = storedInteger(value.independent);
    const firstMs = dateValue(value.firstPracticedAt);
    const lastMs = dateValue(value.lastPracticedAt);

    if (
      phraseId === null ||
      attemptCount === null ||
      matched === null ||
      hinted === null ||
      independent === null ||
      matched > attemptCount ||
      hinted > attemptCount ||
      independent > attemptCount ||
      typeof value.needsReview !== "boolean" ||
      firstMs === null ||
      lastMs === null ||
      firstMs > lastMs
    ) {
      return null;
    }

    return {
      phraseId,
      attemptCount,
      matched,
      hinted,
      independent,
      needsReview: value.needsReview,
      firstPracticedAt: new Date(firstMs).toISOString(),
      lastPracticedAt: new Date(lastMs).toISOString(),
    };
  }

  function restoreRound(value) {
    if (!isRecord(value)) return null;
    const id = cleanId(value.id);
    const settledMs = dateValue(value.settledAt);
    if (id === null || settledMs === null) return null;
    return { id, settledAt: new Date(settledMs).toISOString() };
  }

  function load() {
    const clean = emptyState();
    try {
      if (!storage || typeof storage.getItem !== "function") return clean;
      const serialized = storage.getItem(STORAGE_KEY);
      if (serialized === null || serialized === undefined) return clean;
      if (typeof serialized !== "string") return clean;

      const value = JSON.parse(serialized);
      if (!isRecord(value) || value.version !== VERSION) return clean;
      if (!Array.isArray(value.phrases) || !Array.isArray(value.rounds)) return clean;
      if (value.phrases.length > MAX_PHRASES || value.rounds.length > MAX_ROUNDS) {
        return clean;
      }

      const updatedMs = dateValue(value.updatedAt);
      if (updatedMs === null) return clean;
      const age = timestamp().milliseconds - updatedMs;
      if (age > MAX_AGE_MS || age < -MAX_FUTURE_MS) return clean;

      const phrases = [];
      const phraseIds = new Set();
      for (const item of value.phrases) {
        const phrase = restorePhrase(item);
        if (phrase === null || phraseIds.has(phrase.phraseId)) return clean;
        phraseIds.add(phrase.phraseId);
        phrases.push(phrase);
      }

      const rounds = [];
      const roundIds = new Set();
      for (const item of value.rounds) {
        const round = restoreRound(item);
        if (round === null || roundIds.has(round.id)) return clean;
        roundIds.add(round.id);
        rounds.push(round);
      }

      return {
        version: VERSION,
        updatedAt: new Date(updatedMs).toISOString(),
        phrases,
        rounds,
      };
    } catch {
      // Missing, denied, malformed and expired persistence all fall back cleanly.
      return clean;
    }
  }

  let state = load();

  function publicSnapshot() {
    return {
      version: state.version,
      updatedAt: state.updatedAt,
      phrases: state.phrases.map((phrase) => ({ ...phrase })),
    };
  }

  function persist() {
    try {
      if (storage && typeof storage.setItem === "function") {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // The in-memory state remains usable when persistence is denied or full.
    }
  }

  function roundCount(value, attemptCount) {
    const count = value === true
      ? 1
      : value === false || value === null || value === undefined
        ? 0
        : boundedInteger(value, MAX_ROUND_COUNT);
    return Math.min(attemptCount, count);
  }

  function normalizeRound(snapshot) {
    if (!isRecord(snapshot) || !Array.isArray(snapshot.phrases)) return [];
    const byPhrase = new Map();

    // Bound input work as well as persisted output. Unknown fields are ignored.
    for (const value of snapshot.phrases.slice(0, MAX_PHRASES * 2)) {
      if (!isRecord(value)) continue;
      const phraseId = cleanId(value.phraseId);
      if (phraseId === null) continue;

      const attemptCount = boundedInteger(value.attemptCount, MAX_ROUND_COUNT);
      const item = {
        phraseId,
        attemptCount,
        matched: roundCount(value.matched, attemptCount),
        hinted: roundCount(value.hinted, attemptCount),
        independent: roundCount(value.independent, attemptCount),
        needsReview: value.needsReview === true,
      };
      if (
        item.attemptCount === 0 &&
        item.matched === 0 &&
        item.hinted === 0 &&
        item.independent === 0 &&
        !item.needsReview
      ) {
        continue;
      }

      const previous = byPhrase.get(phraseId);
      if (!previous) {
        byPhrase.set(phraseId, item);
        continue;
      }

      previous.attemptCount = Math.min(
        MAX_ROUND_COUNT,
        previous.attemptCount + item.attemptCount,
      );
      previous.matched = Math.min(
        previous.attemptCount,
        previous.matched + item.matched,
      );
      previous.hinted = Math.min(
        previous.attemptCount,
        previous.hinted + item.hinted,
      );
      previous.independent = Math.min(
        previous.attemptCount,
        previous.independent + item.independent,
      );
      previous.needsReview = previous.needsReview || item.needsReview;
    }

    return Array.from(byPhrase.values()).slice(0, MAX_PHRASES);
  }

  function mergePhrase(roundPhrase, practicedAt) {
    const index = state.phrases.findIndex(
      (phrase) => phrase.phraseId === roundPhrase.phraseId,
    );
    const previous = index === -1 ? null : state.phrases[index];
    const attemptCount = addCounts(
      previous ? previous.attemptCount : 0,
      roundPhrase.attemptCount,
    );
    const phrase = {
      phraseId: roundPhrase.phraseId,
      attemptCount,
      matched: Math.min(
        attemptCount,
        addCounts(previous ? previous.matched : 0, roundPhrase.matched),
      ),
      hinted: Math.min(
        attemptCount,
        addCounts(previous ? previous.hinted : 0, roundPhrase.hinted),
      ),
      independent: Math.min(
        attemptCount,
        addCounts(previous ? previous.independent : 0, roundPhrase.independent),
      ),
      needsReview: previous ? previous.needsReview : false,
      firstPracticedAt: previous ? previous.firstPracticedAt : practicedAt,
      lastPracticedAt: practicedAt,
    };

    const independentSuccess =
      roundPhrase.independent > 0 &&
      roundPhrase.hinted === 0 &&
      roundPhrase.matched > 0;
    const singleMismatchOnly =
      roundPhrase.attemptCount === 1 &&
      roundPhrase.matched === 0 &&
      roundPhrase.hinted === 0 &&
      roundPhrase.independent === 0;
    const repeatedMismatch =
      phrase.attemptCount >= 2 && phrase.matched === 0 && phrase.independent === 0;
    const frequentHelp =
      phrase.hinted >= 2 && phrase.hinted / Math.max(1, phrase.attemptCount) >= 0.5;

    // A successful independent round can repair earlier uncertainty.
    if (independentSuccess) phrase.needsReview = false;

    // One ASR mismatch alone is not evidence that a phrase is not known.
    else if (
      (roundPhrase.needsReview && !singleMismatchOnly) ||
      roundPhrase.hinted > 0 ||
      repeatedMismatch ||
      frequentHelp
    ) {
      phrase.needsReview = true;
    }

    if (index === -1) state.phrases.push(phrase);
    else state.phrases[index] = phrase;
  }

  function enforceLimits() {
    if (state.phrases.length > MAX_PHRASES) {
      state.phrases.sort((left, right) => {
        const dateDifference =
          Date.parse(left.lastPracticedAt) - Date.parse(right.lastPracticedAt);
        return dateDifference || left.phraseId.localeCompare(right.phraseId);
      });
      state.phrases = state.phrases.slice(-MAX_PHRASES);
    }
    if (state.rounds.length > MAX_ROUNDS) {
      state.rounds = state.rounds.slice(-MAX_ROUNDS);
    }
  }

  function saveRound(id, snapshot) {
    const roundId = cleanId(id);
    if (roundId === null) return publicSnapshot();
    if (state.rounds.some((round) => round.id === roundId)) {
      return publicSnapshot();
    }

    const current = timestamp();
    for (const phrase of normalizeRound(snapshot)) {
      mergePhrase(phrase, current.iso);
    }
    state.rounds.push({ id: roundId, settledAt: current.iso });
    state.updatedAt = current.iso;
    enforceLimits();
    persist();
    return publicSnapshot();
  }

  function recommend(limit = 2) {
    let size = typeof limit === "number" && Number.isFinite(limit)
      ? Math.floor(limit)
      : 2;
    size = Math.max(0, Math.min(MAX_PHRASES, size));

    return state.phrases
      .map((phrase) => {
        const attempts = Math.max(1, phrase.attemptCount);
        const helpRatio = phrase.hinted / attempts;
        const independentRatio = phrase.independent / attempts;
        const frequentHelp = phrase.hinted >= 2 && helpRatio >= 0.5;
        const repeatedMismatch =
          phrase.attemptCount >= 2 && phrase.matched === 0 && phrase.independent === 0;
        const category = phrase.needsReview
          ? 0
          : frequentHelp || repeatedMismatch
            ? 1
            : 2;
        return { phrase, category, helpRatio, independentRatio };
      })
      .sort((left, right) => {
        if (left.category !== right.category) return left.category - right.category;
        if (left.category < 2) {
          if (left.helpRatio !== right.helpRatio) {
            return right.helpRatio - left.helpRatio;
          }
          if (left.independentRatio !== right.independentRatio) {
            return left.independentRatio - right.independentRatio;
          }
        }
        const staleDifference =
          Date.parse(left.phrase.lastPracticedAt) -
          Date.parse(right.phrase.lastPracticedAt);
        return staleDifference ||
          left.phrase.phraseId.localeCompare(right.phrase.phraseId);
      })
      .slice(0, size)
      .map(({ phrase }) => phrase.phraseId);
  }

  // Self-practice refreshes the review date without inventing an ASR outcome.
  function noteReview(id, { hinted = false } = {}) {
    const phraseId = cleanId(id);
    if (phraseId === null) return publicSnapshot();
    const stamp = timestamp().iso;
    let phrase = state.phrases.find(entry => entry.phraseId === phraseId);
    if (!phrase) {
      phrase = { phraseId, attemptCount: 0, matched: 0, hinted: 0, independent: 0,
        needsReview: false, firstPracticedAt: stamp, lastPracticedAt: stamp };
      state.phrases.push(phrase);
    }
    phrase.lastPracticedAt = stamp;
    if (hinted === true) phrase.needsReview = true;
    state.updatedAt = stamp;
    enforceLimits();
    persist();
    return publicSnapshot();
  }

  function clear() {
    state = emptyState();
    try {
      if (storage && typeof storage.removeItem === "function") {
        storage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Clearing memory still succeeds if persistent storage is unavailable.
    }
    return publicSnapshot();
  }

  return { saveRound, noteReview, recommend, clear, snapshot: publicSnapshot };
}

export default createReviewStore;

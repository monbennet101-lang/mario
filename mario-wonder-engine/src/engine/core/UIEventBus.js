/**
 * UIEventBus — Minimal Deterministic Event Bus for UI v2
 * =======================================================
 * Decouples gameplay simulation from UI presentation.
 * Emits:
 *   - coinCollected
 *   - specialCollected
 *   - damageTaken
 *   - lifeLost
 *   - lifeGained
 *   - checkpointReached
 *   - courseCleared
 *   - pauseToggled
 *   - timerWarning
 *   - reserveItemChanged
 *   - toastRequested
 */

export const UIEvents = {
  COIN_COLLECTED: 'coinCollected',
  SPECIAL_COLLECTED: 'specialCollected',
  DAMAGE_TAKEN: 'damageTaken',
  LIFE_LOST: 'lifeLost',
  LIFE_GAINED: 'lifeGained',
  CHECKPOINT_REACHED: 'checkpointReached',
  COURSE_CLEARED: 'courseCleared',
  PAUSE_TOGGLED: 'pauseToggled',
  TIMER_WARNING: 'timerWarning',
  RESERVE_ITEM_CHANGED: 'reserveItemChanged',
  TOAST_REQUESTED: 'toastRequested',
};

export class UIEventBus {
  constructor() {
    this._listeners = new Map();
    this._history = [];
    this._maxHistory = 64;
  }

  on(eventName, handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }
    let set = this._listeners.get(eventName);
    if (!set) {
      set = new Set();
      this._listeners.set(eventName, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this._listeners.delete(eventName);
      }
    };
  }

  off(eventName, handler) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this._listeners.delete(eventName);
    }
  }

  emit(eventName, payload = {}) {
    if (this._history.length >= this._maxHistory) {
      this._history.shift();
    }
    this._history.push({ eventName, payload });

    const set = this._listeners.get(eventName);
    if (!set || set.size === 0) return 0;
    let count = 0;
    for (const handler of set) {
      handler(payload);
      count++;
    }
    return count;
  }

  getRecentEvents(eventName = null) {
    if (!eventName) return this._history.slice();
    return this._history.filter((entry) => entry.eventName === eventName);
  }

  clearHistory() {
    this._history.length = 0;
  }

  clear() {
    this._listeners.clear();
    this._history.length = 0;
  }
}

export default UIEventBus;

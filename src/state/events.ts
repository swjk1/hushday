import { getState, readStorage, writeStorage } from './store';

/**
 * Client-side usage events. Queued locally, flushed in batches, and sent with sendBeacon
 * when the page is hidden. Server-side events (fingerprints, discoveries, Mix CRUD) are
 * logged by the API itself so they can't be lost or spoofed.
 */
export type EventName =
  | 'app_opened' | 'mix_viewed' | 'mix_played' | 'zone_started' | 'zone_duration_selected' | 'zone_completed'
  | 'zone_paused' | 'zone_resumed' | 'zone_ended_early' | 'short_experience_played' | 'short_experience_completed'
  | 'mix_reused' | 'mix_editor_opened' | 'mix_previewed' | 'sound_component_added' | 'sound_component_removed' | 'sound_auditioned' | 'mix_shared'
  | 'discovery_revealed';

interface QueuedEvent { name: EventName; props: Record<string, unknown>; ts: string }

const KEY = 'hushday.events.v1';
let queue: QueuedEvent[] = readStorage<QueuedEvent[]>(KEY, []);
let timer = 0;

export function track(name: EventName, props: Record<string, unknown> = {}) {
  queue.push({ name, props, ts: new Date().toISOString() });
  if (queue.length > 500) queue = queue.slice(-500);
  writeStorage(KEY, queue);
  clearTimeout(timer);
  timer = window.setTimeout(flush, queue.length >= 20 ? 0 : 8000);
}

export async function flush() {
  const { token } = getState();
  if (!token || queue.length === 0) return;
  const batch = queue.slice(0, 100);
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
    });
    if (!response.ok) return;
    queue = queue.slice(batch.length);
    writeStorage(KEY, queue);
    if (queue.length) void flush();
  } catch {
    /* retry on the next event or app open */
  }
}

function beacon() {
  const { token } = getState();
  if (!token || queue.length === 0 || !navigator.sendBeacon) return;
  const batch = queue.slice(0, 100);
  const sent = navigator.sendBeacon('/api/events', new Blob([JSON.stringify({ events: batch, token })], { type: 'application/json' }));
  if (sent) {
    queue = queue.slice(batch.length);
    writeStorage(KEY, queue);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') beacon();
});

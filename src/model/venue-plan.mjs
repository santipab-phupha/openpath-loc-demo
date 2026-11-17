import { indexPaths } from './routes.mjs';

export const pinTypes = { start: 'Starting point', destination: 'Destination', junction: 'Junction' };
export const routeStates = { unknown: 'Unverified', open: 'Step-free and clear', obstacle: 'Movable obstacle', steps: 'Has steps', closed: 'Closed' };

export function emptyVenue() {
  return { image: null, name: '', pins: [], paths: [], moved: [] };
}

export function inspectVenue(venue, moved = []) {
  const simulation = new Set(moved);
  const assessments = venue.paths.map((entry) => {
    let state = entry.status;
    if (state === 'obstacle' && simulation.has(entry.id)) state = entry.verified ? 'open' : 'unknown';
    return { entry, state, issue: state !== 'open' };
  });
  const start = venue.pins.find(({ kind }) => kind === 'start');
  const confirmed = start ? indexPaths(assessments, ({ state }) => state === 'open', start.id) : new Map();
  const possible = start ? indexPaths(assessments, ({ state }) => state === 'open' || state === 'unknown', start.id) : new Map();
  const states = new Map(venue.pins.filter(({ kind }) => kind === 'destination').map(({ id }) => [
    id, confirmed.has(id) ? 'reached' : possible.has(id) ? 'unverified' : 'blocked',
  ]));
  return { start, states, assessments, count: [...states.values()].filter((state) => state === 'reached').length };
}

export function openVenueStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('openpath-custom-floor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('venues');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function loadVenue(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('venues').objectStore('venues').get('current');
    request.onsuccess = () => resolve(request.result ?? emptyVenue());
    request.onerror = () => reject(request.error);
  });
}

export function saveVenue(db, venue) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('venues', 'readwrite');
    transaction.objectStore('venues').put(venue, 'current');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

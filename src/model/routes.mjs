export const destinations = [
  { id: 'check-in', name: 'Check-in', x: .31, y: .20 },
  { id: 'restroom', name: 'Restroom', x: .31, y: .79 },
  { id: 'workshop', name: 'Workshop', x: .61, y: .20 },
  { id: 'stage', name: 'Stage', x: .61, y: .79 },
  { id: 'quiet-room', name: 'Quiet room', x: .87, y: .51 },
];

export const points = Object.fromEntries([
  ['drop-off', [.12, .51]],
  ['lobby', [.31, .51]],
  ['east-hall', [.61, .51]],
  ...destinations.map(({ id, x, y }) => [id, [x, y]]),
]);

export const passages = [
  { id: 'entrance', from: 'drop-off', to: 'lobby', name: 'Main entrance', width: 138, status: 'open' },
  { id: 'check-in', from: 'lobby', to: 'check-in', name: 'Check-in approach', width: 132, status: 'open' },
  { id: 'restroom', from: 'lobby', to: 'restroom', name: 'Restroom approach', width: 102, status: 'open' },
  { id: 'east', from: 'lobby', to: 'east-hall', name: 'East corridor', width: 124, status: 'table', clearedBy: 'move-table' },
  { id: 'workshop', from: 'east-hall', to: 'workshop', name: 'Workshop entrance', width: 96, status: 'open' },
  { id: 'stage', from: 'east-hall', to: 'stage', name: 'Stage approach', width: 104, status: 'open' },
  { id: 'stairs', from: 'east-hall', to: 'quiet-room', name: 'Quiet room main entrance', width: 110, status: 'stairs' },
  { id: 'side-door', from: 'lobby', to: 'quiet-room', name: 'Side-door route', width: 94, status: 'closed', clearedBy: 'open-door', bends: [[.445, .46], [.445, .09], [.87, .09]] },
];

export const statuses = {
  open: 'Open, step-free',
  table: 'Table in the way',
  closed: 'Door closed',
  stairs: 'Has steps',
  unknown: 'Unverified',
};

const validWidth = (width) => Number.isInteger(width) && width >= 1 && width <= 500;

export function sampleSurvey() {
  return {
    minimum: 90,
    measurements: Object.fromEntries(passages.map(({ id, width, status }) => [id, { width, status }])),
  };
}

export function validSurvey(survey) {
  return validWidth(survey?.minimum) && passages.every(({ id }) => {
    const entry = survey.measurements?.[id];
    return entry && Object.hasOwn(statuses, entry.status) && (entry.width === null || validWidth(entry.width));
  });
}

function assessPassage(passage, survey, scenario) {
  const { width, status } = survey.measurements[passage.id];
  const cleared = passage.clearedBy === scenario && status === passage.status;
  if (status === 'unknown') return { entry: passage, width, issue: 'Passage unverified', unknown: true };
  if (status !== 'open' && !cleared) return { entry: passage, width, issue: statuses[status] };
  if (width === null) return { entry: passage, width, issue: 'Clear width unmeasured', unknown: true };
  if (width < survey.minimum) {
    return { entry: passage, width, issue: `Only ${width} cm clear · planning width ${survey.minimum} cm` };
  }
  return { entry: passage, width };
}

export function indexPaths(assessments, allow, start = 'drop-off') {
  const queue = [{ point: start, path: [], score: 0 }];
  const paths = new Map();
  while (queue.length) {
    queue.sort((first, second) => first.score - second.score || first.path.length - second.path.length);
    const { point, path, score } = queue.shift();
    if (paths.has(point)) continue;
    paths.set(point, path);

    for (const passage of assessments) {
      if (!allow(passage)) continue;
      const { from, to } = passage.entry;
      const next = point === from ? to : point === to ? from : null;
      if (next && !paths.has(next)) {
        queue.push({ point: next, path: [...path, passage], score: score + Number(Boolean(passage.issue)) });
      }
    }
  }
  return paths;
}

export function analyze(survey, scenario) {
  const assessments = passages.map((entry) => assessPassage(entry, survey, scenario));
  const reachable = indexPaths(assessments, (passage) => !passage.issue);
  const pending = indexPaths(assessments, (passage) => !passage.issue || passage.unknown);
  const candidates = indexPaths(assessments, () => true);
  const routes = destinations.map((destination) => {
    const confirmed = reachable.get(destination.id);
    const needsCheck = pending.get(destination.id);
    return {
      ...destination,
      state: confirmed ? 'reached' : needsCheck ? 'unverified' : 'blocked',
      path: confirmed ?? needsCheck ?? candidates.get(destination.id) ?? [],
    };
  });
  return {
    routes,
    count: routes.filter(({ state }) => state === 'reached').length,
    assessments,
    connected: new Set(assessments
      .filter(({ entry, issue }) => !issue && reachable.has(entry.from))
      .map(({ entry }) => entry.id)),
  };
}

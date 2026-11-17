import { indexPaths } from './model/routes.mjs';
import { inspectVenue } from './model/venue-plan.mjs';

export const mapWidth = 1556;
export const mapHeight = 860;
export const sourceHref = 'https://www.loc.gov/visit/maps-and-floor-plans/thomas-jefferson-building/ground-floor/';
export const obstacleId = 'west-corridor';
export const elevatorRouteId = 'elevator-approach';
export const cloakroomObstacleId = 'cloakroom-approach';

// The printed demo crops the original floor plan and adds a title and credit.
// Keep the source coordinates so each pin can be checked against the original plan.
function pin(id, name, kind, sourceX, sourceY) {
  return { id, name, kind, x: (sourceX - 150 + 28) / mapWidth, y: (sourceY - 1164 + 148) / mapHeight };
}

function route(id, name, from, to) {
  return { id, name, from, to, bends: [], status: 'open', obstacle: '', verified: true };
}

export const venue = {
  name: 'Thomas Jefferson Building, ground floor',
  image: null,
  moved: [],
  pins: [
    pin('lobby', 'Main lobby', 'start', 1137, 1628),
    pin('cloakroom', 'Cloakroom', 'destination', 1276, 1580),
    pin('elevator', 'Visitor Elevator', 'destination', 1277, 1384),
    pin('whittall', 'Whittall Pavilion', 'destination', 747, 1572),
    pin('coolidge', 'Coolidge Auditorium', 'destination', 569, 1538),
    pin('west', 'West corridor junction', 'junction', 910, 1628),
    pin('whittall-door', 'Whittall doorway', 'junction', 910, 1582),
    pin('coolidge-door', 'Coolidge doorway', 'junction', 569, 1628),
    pin('cloakroom-turn', 'Cloakroom turn', 'junction', 1276, 1628),
    pin('elevator-approach', 'Elevator approach', 'junction', 1155, 1394),
  ],
  paths: [
    route('lobby-cloakroom-turn', 'Lobby to cloakroom turn', 'lobby', 'cloakroom-turn'),
    route('cloakroom-approach', 'Cloakroom approach', 'cloakroom-turn', 'cloakroom'),
    route('lobby-elevator-approach', 'Lobby to elevator approach', 'lobby', 'elevator-approach'),
    route('elevator-approach', 'Visitor elevator approach', 'elevator-approach', 'elevator'),
    {
      ...route(obstacleId, 'West corridor · simulated blockage', 'lobby', 'west'),
      status: 'obstacle',
      obstacle: 'Simulated check-in table',
    },
    route('west-whittall-door', 'West corridor to Whittall doorway', 'west', 'whittall-door'),
    route('whittall-approach', 'Whittall Pavilion approach', 'whittall-door', 'whittall'),
    route('west-coolidge-door', 'West corridor to Coolidge doorway', 'west', 'coolidge-door'),
    route('coolidge-approach', 'Coolidge Auditorium approach', 'coolidge-door', 'coolidge'),
  ],
};

export function inspectDemo(moved = false, elevatorUnavailable = false, cloakroomBlocked = false) {
  const currentVenue = elevatorUnavailable || cloakroomBlocked
    ? {
        ...venue,
        paths: venue.paths.map((path) => {
          if (elevatorUnavailable && path.id === elevatorRouteId) return { ...path, status: 'closed' };
          if (cloakroomBlocked && path.id === cloakroomObstacleId) {
            return { ...path, status: 'obstacle', obstacle: 'Simulated cloakroom obstruction' };
          }
          return path;
        }),
      }
    : venue;
  const analysis = inspectVenue(currentVenue, moved ? [obstacleId] : []);
  const connectedPaths = indexPaths(analysis.assessments, ({ state }) => state === 'open', 'lobby');
  return { ...analysis, connectedIds: new Set(connectedPaths.keys()) };
}

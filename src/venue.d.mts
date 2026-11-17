export interface DemoPoint {
  x: number;
  y: number;
}

export interface DemoPin extends DemoPoint {
  id: string;
  name: string;
  kind: 'start' | 'destination' | 'junction';
}

type RouteStatus = 'open' | 'obstacle' | 'unknown' | 'steps' | 'closed';
type ReachStatus = 'reached' | 'unverified' | 'blocked';

export interface DemoRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  bends: DemoPoint[];
  status: RouteStatus;
  obstacle: string;
  verified: boolean;
}

export interface DemoAnalysis {
  start?: DemoPin;
  states: Map<string, ReachStatus>;
  assessments: { entry: DemoRoute; state: RouteStatus; issue: boolean }[];
  count: number;
  connectedIds: Set<string>;
}

export const venue: {
  name: string;
  image: null;
  moved: string[];
  pins: DemoPin[];
  paths: DemoRoute[];
};
export const sourceHref: string;
export const obstacleId: string;
export const elevatorRouteId: string;
export const cloakroomObstacleId: string;
export const mapWidth: number;
export const mapHeight: number;
export function inspectDemo(moved?: boolean, elevatorUnavailable?: boolean, cloakroomBlocked?: boolean): DemoAnalysis;

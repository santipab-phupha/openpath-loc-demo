import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeftRight, ArrowUpRight, Check, MapPin, X } from 'lucide-react';
import '@fontsource-variable/manrope';
import '@fontsource/instrument-serif/latin-400.css';
import floorPlan from './assets/visitor-lobby.png';
import mark from './assets/openpath-icon.svg';
import { cloakroomObstacleId, elevatorRouteId, inspectDemo, mapHeight, mapWidth, obstacleId, sourceHref, venue } from './venue.mjs';
import { indexPaths } from './model/routes.mjs';
import './styles.css';

type Result = ReturnType<typeof inspectDemo>;
const destinations = venue.pins.filter((pin) => pin.kind === 'destination');
const pins = new Map(venue.pins.map((pin) => [pin.id, pin]));
const destinationNumber = new Map(destinations.map((pin, index) => [pin.id, index + 1]));
const barrier = venue.paths.find(({ id }) => id === obstacleId);
const cloakroomBarrier = venue.paths.find(({ id }) => id === cloakroomObstacleId);
const originalCount = inspectDemo().count;

function pinPosition(x: number, y: number): CSSProperties {
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

function RouteOverlay({ result, baselineResult, moved, selected }: {
  result: Result; baselineResult: Result; moved: boolean; selected: string | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const animationStart = useRef(performance.now());
  useLayoutEffect(() => { animationStart.current = performance.now(); }, [moved]);

  useLayoutEffect(() => {
    const drawing = canvas.current;
    const ink = drawing?.getContext('2d');
    if (!drawing || !ink) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startedAt = animationStart.current;
    const selectedPath = selected
      ? indexPaths(result.assessments, () => true, 'lobby').get(selected) ?? []
      : [];
    const selectedRoutes = new Set(selectedPath.map(({ entry }: Result['assessments'][number]) => entry.id));
    let frame = 0;

    function paint(now = performance.now()) {
      if (!drawing || !ink) return;
      const { clientWidth: width, clientHeight: height } = drawing;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      if (!width || !height) return;
      drawing.width = Math.round(width * scale);
      drawing.height = Math.round(height * scale);
      ink.setTransform(scale, 0, 0, scale, 0, 0);
      ink.lineJoin = 'round';
      ink.lineCap = 'round';

      function drawRoute(
        entry: Result['assessments'][number]['entry'],
        state: Result['assessments'][number]['state'],
        connectedIds: Result['connectedIds'],
        fraction = 1,
        dimmed = false,
      ) {
        if (!ink) return;
        const from = pins.get(entry.from);
        const to = pins.get(entry.to);
        if (!from || !to || fraction <= 0) return;
        const reachable = state === 'open' && connectedIds.has(from.id) && connectedIds.has(to.id);
        const points = [from, ...entry.bends, to].map((point) => ({ x: point.x * width, y: point.y * height }));
        const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
        let remaining = lengths.reduce((sum, length) => sum + length, 0) * fraction;
        ink.beginPath();
        ink.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
          const length = lengths[index - 1];
          const amount = length ? Math.min(1, remaining / length) : 1;
          const previous = points[index - 1];
          ink.lineTo(previous.x + (points[index].x - previous.x) * amount, previous.y + (points[index].y - previous.y) * amount);
          remaining -= length;
          if (amount < 1) break;
        }
        ink.setLineDash([]);
        ink.globalAlpha = dimmed ? .28 : 1;
        ink.lineWidth = 6;
        ink.strokeStyle = '#fffefa';
        ink.stroke();
        ink.setLineDash(reachable ? [] : [5, 4]);
        ink.lineWidth = selectedRoutes.has(entry.id) ? 5 : 3.5;
        ink.strokeStyle = reachable ? '#197c69' : state === 'obstacle' ? '#a94d30' : '#667871';
        ink.stroke();
        ink.globalAlpha = 1;
      }

      // Keep the original routes visible while the newly connected routes are revealed.
      const progress = !moved || reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (now - startedAt - 320) / 850));
      for (const assessment of baselineResult.assessments) {
        drawRoute(assessment.entry, assessment.state, baselineResult.connectedIds, 1, Boolean(selected && !selectedRoutes.has(assessment.entry.id)));
      }
      if (moved) {
        for (const { entry, state } of result.assessments) {
          const newlyConnected = state === 'open'
            && result.connectedIds.has(entry.from) && result.connectedIds.has(entry.to)
            && !(baselineResult.connectedIds.has(entry.from) && baselineResult.connectedIds.has(entry.to));
          if (newlyConnected) drawRoute(entry, state, result.connectedIds, progress, Boolean(selected && !selectedRoutes.has(entry.id)));
        }
        if (progress < 1) frame = requestAnimationFrame(paint);
      }
    }

    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      paint();
    });
    resize.observe(drawing);
    paint();
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [result, baselineResult, moved, selected]);

  return <canvas ref={canvas} aria-hidden="true" />;
}

function VenueMap({ result, baselineResult, moved, cloakroomBlocked, selected, onSelect, onMove }: {
  result: Result;
  baselineResult: Result;
  moved: boolean;
  cloakroomBlocked: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: () => void;
}) {
  const from = barrier && pins.get(barrier.from);
  const to = barrier && pins.get(barrier.to);
  const cloakFrom = cloakroomBarrier && pins.get(cloakroomBarrier.from);
  const cloakTo = cloakroomBarrier && pins.get(cloakroomBarrier.to);
  const dragging = useRef<{ id: number; startY: number; dy: number } | null>(null);
  const suppressClick = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (moved || !event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    dragging.current = { id: event.pointerId, startY: event.clientY, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragTable(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragging.current;
    if (!drag || drag.id !== event.pointerId) return;
    drag.dy = Math.max(0, event.clientY - drag.startY);
    setDragOffset(Math.min(drag.dy, 40));
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragging.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragging.current = null;
    setDragOffset(0);
    if (drag.dy >= 18) {
      suppressClick.current = true;
      onMove();
    }
  }

  return (
    <figure className="panel map-panel" aria-labelledby="venue-map-title">
      <div className="panel-heading">
        <h2 id="venue-map-title">Ground floor</h2>
        <span><MapPin size={15} aria-hidden="true" /> Main lobby</span>
      </div>
      <div className="map-image" style={{ aspectRatio: `${mapWidth} / ${mapHeight}` }}>
        <img src={floorPlan} width={mapWidth} height={mapHeight} alt="Cropped Library of Congress ground-floor visitor map, showing the lobby and four nearby destinations" fetchPriority="high" />
        <RouteOverlay result={result} baselineResult={baselineResult} moved={moved} selected={selected} />
        {venue.pins.map(({ id, x, y, kind, name }) => {
          const reached = result.states.get(id) === 'reached';
          if (kind === 'destination') {
            return (
              <button
                key={id}
                type="button"
                className="map-pin-button"
                aria-label={`${name}, ${reached ? 'reachable' : 'not reachable'}`}
                aria-pressed={selected === id}
                title={name}
                style={pinPosition(x, y)}
                onClick={() => onSelect(id)}
              >
                <span className={`map-pin destination${reached ? ' reached' : ''}`} aria-hidden="true">
                  {destinationNumber.get(id)}
                </span>
              </button>
            );
          }
          return (
            <span
              key={id}
              aria-hidden="true"
              title={name}
              className={`map-pin ${kind}${reached ? ' reached' : ''}`}
              style={pinPosition(x, y)}
            >
              {kind === 'start' ? <ArrowUpRight size={13} /> : destinationNumber.get(id)}
            </span>
          );
        })}
        {from && to ? (
          <button
            type="button"
            className="map-obstacle-button"
            style={{ ...pinPosition((from.x + to.x) / 2, (from.y + to.y) / 2), '--drag-offset': `${dragOffset}px` } as CSSProperties}
            data-moved={moved}
            data-dragging={dragOffset > 0}
            aria-label={moved ? 'Put back check-in table' : 'Move check-in table. Drag down or press to clear the corridor'}
            title={moved ? 'Put back check-in table' : 'Drag down to move the table'}
            onPointerDown={startDrag}
            onPointerMove={dragTable}
            onPointerUp={finishDrag}
            onPointerCancel={() => { dragging.current = null; setDragOffset(0); }}
            onClick={() => {
              if (suppressClick.current) { suppressClick.current = false; return; }
              onMove();
            }}
          >
            <span className="map-obstacle" data-moved={moved} aria-hidden="true">
              {moved ? <Check size={13} /> : <X size={13} />}
            </span>
          </button>
        ) : null}
        {cloakroomBlocked && cloakFrom && cloakTo && (
          <span className="map-obstacle cloakroom-obstacle" title="Simulated cloakroom obstruction" aria-hidden="true"
            style={pinPosition((cloakFrom.x + cloakTo.x) / 2, (cloakFrom.y + cloakTo.y) / 2)}>
            !
          </span>
        )}
      </div>
      <figcaption className="map-legend">
        <span><i className="legend-line reachable" /> Reachable</span>
        <span><i className="legend-line disconnected" /> Disconnected</span>
        <span><i className="legend-line blocked" /> Table</span>
        {cloakroomBlocked && <span><i className="legend-obstruction" /> Cloakroom obstruction</span>}
      </figcaption>
      <p className="map-instruction">Select a pin · Drag the table down</p>
    </figure>
  );
}

function DestinationList({ result, baselineResult, selected, onSelect, onClear, onResolve }: {
  result: Result;
  baselineResult: Result;
  selected: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  onResolve: (routeId: string) => void;
}) {
  const selectedDestination = destinations.find(({ id }) => id === selected);
  const selectedReached = selected !== null && result.states.get(selected) === 'reached';
  const selectedPath = selected ? indexPaths(result.assessments, () => true, 'lobby').get(selected) ?? [] : [];
  const blockage = selectedPath.find(({ state }: Result['assessments'][number]) => state !== 'open');
  const fixLabel = blockage?.entry.id === obstacleId ? 'Move table'
    : blockage?.entry.id === elevatorRouteId ? 'Restore elevator'
    : blockage?.entry.id === cloakroomObstacleId ? 'Clear cloakroom' : null;
  const blockedText = blockage?.entry.id === obstacleId ? 'The simulated table blocks this route.'
    : blockage?.entry.id === elevatorRouteId ? 'The simulated elevator outage blocks this route.'
    : blockage?.entry.id === cloakroomObstacleId ? 'A simulated obstruction blocks the cloakroom.'
    : 'No confirmed route.';
  return (
    <section className="panel destination-panel" aria-labelledby="destination-title">
      <h2 id="destination-title">Destinations</h2>
      <ul>
        {destinations.map(({ id, name }, index) => {
          const reached = result.states.get(id) === 'reached';
          const gained = reached && baselineResult.states.get(id) !== 'reached';
          return (
            <li key={id}>
              <button type="button" className="destination-button" aria-pressed={selected === id} onClick={() => onSelect(id)}>
                <span className={`row-pin${reached ? ' reached' : ''}`} aria-hidden="true">{index + 1}</span>
                <span className="destination-name">{name}</span>
                <span className={`destination-status${reached ? ' reached' : ''}`}>
                  {gained ? 'Newly reachable' : reached ? 'Reachable' : 'Cut off'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedDestination && (
        <div className="destination-detail" role="status">
          <strong>{selectedDestination.name}</strong>
          <p>{selectedReached ? 'Simulated route from the lobby is open.' : blockedText}</p>
          {!selectedReached && fixLabel && blockage && (
            <button type="button" className="detail-action" onClick={() => onResolve(blockage.entry.id)}>{fixLabel}</button>
          )}
          <button type="button" className="clear-selection" onClick={onClear}>Clear selection</button>
        </div>
      )}
    </section>
  );
}

export function JudgeDemo() {
  const [moved, setMoved] = useState(false);
  const [elevatorUnavailable, setElevatorUnavailable] = useState(false);
  const [cloakroomBlocked, setCloakroomBlocked] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const baselineResult = useMemo(() => inspectDemo(false, elevatorUnavailable, cloakroomBlocked), [elevatorUnavailable, cloakroomBlocked]);
  const result = useMemo(() => inspectDemo(moved, elevatorUnavailable, cloakroomBlocked), [moved, elevatorUnavailable, cloakroomBlocked]);
  const gain = result.count - baselineResult.count;
  const actions = [
    ...(!moved ? [{ label: 'Move check-in table', routeId: obstacleId, count: inspectDemo(true, elevatorUnavailable, cloakroomBlocked).count }] : []),
    ...(elevatorUnavailable ? [{ label: 'Restore elevator', routeId: elevatorRouteId, count: inspectDemo(moved, false, cloakroomBlocked).count }] : []),
    ...(cloakroomBlocked ? [{ label: 'Clear cloakroom', routeId: cloakroomObstacleId, count: inspectDemo(moved, elevatorUnavailable, false).count }] : []),
  ].filter((action) => action.count > result.count).sort((first, second) => second.count - first.count);
  function resolveRoute(routeId: string) {
    if (routeId === obstacleId) setMoved(true);
    if (routeId === elevatorRouteId) setElevatorUnavailable(false);
    if (routeId === cloakroomObstacleId) setCloakroomBlocked(false);
  }
  const selectDestination = (id: string) => setSelected((current) => current === id ? null : id);

  return (
    <>
      <header className="site-header">
        <div className="shell topbar">
          <span className="brand"><img src={mark} width="33" height="33" alt="" />OpenPath</span>
          <a className="editor-link" href="https://openpath-campus-planner.santipabtongchan.chatgpt.site/floor-plan.html">
            My plan <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>
      <main className="shell">
        <header className="page-heading">
          <div>
            <h1>Library of Congress</h1>
            <p>Thomas Jefferson Building</p>
          </div>
          <a className="source-link" href={sourceHref}>View official map <ArrowUpRight size={16} aria-hidden="true" /></a>
        </header>
        <div className="workspace">
          <VenueMap result={result} baselineResult={baselineResult} moved={moved} cloakroomBlocked={cloakroomBlocked} selected={selected} onSelect={selectDestination} onMove={() => setMoved((current) => !current)} />
          <div className="results">
            <section className="scenario panel" aria-labelledby="scenario-title">
              <h2 id="scenario-title">Check-in table</h2>
              <div className="count" aria-live="polite" aria-atomic="true">
                <div>
                  <span className="count-label">Reachable destinations</span>
                  <strong><span data-count>{result.count}</span><small> / {destinations.length}</small></strong>
                </div>
                {moved ? <span className="delta"><Check size={15} aria-hidden="true" /> +{gain} reachable</span> : null}
              </div>
              <div className="meter" aria-hidden="true">
                {destinations.map(({ id }, index) => <i key={id} className={index < result.count ? 'filled' : ''} />)}
              </div>
              {(moved || elevatorUnavailable || cloakroomBlocked) && (
                <p className="comparison" aria-live="polite">Original {originalCount}/{destinations.length} <span aria-hidden="true">→</span> Now {result.count}/{destinations.length}</p>
              )}
              <button className="action" type="button" aria-label={moved ? 'Put back check-in table' : 'Move check-in table'} onClick={() => setMoved(!moved)}>
                <ArrowLeftRight size={17} aria-hidden="true" /> {moved ? 'Put back' : 'Move'}
              </button>
              <div className="scenario-options">
                <label className="scenario-toggle">
                  <input type="checkbox" checked={elevatorUnavailable} onChange={(event) => setElevatorUnavailable(event.currentTarget.checked)} />
                  <span>Simulate elevator outage</span>
                </label>
                <label className="scenario-toggle">
                  <input type="checkbox" checked={cloakroomBlocked} onChange={(event) => setCloakroomBlocked(event.currentTarget.checked)} />
                  <span>Simulate cloakroom obstruction</span>
                </label>
                {(moved || elevatorUnavailable || cloakroomBlocked || selected) && <button type="button" className="reset-demo" onClick={() => { setMoved(false); setElevatorUnavailable(false); setCloakroomBlocked(false); setSelected(null); }}>Reset</button>}
              </div>
              {actions.length > 0 && (
                <div className="next-action">
                  <p>Suggested next move · +{actions[0].count - result.count} reachable</p>
                  <button type="button" onClick={() => resolveRoute(actions[0].routeId)}>{actions[0].label}</button>
                </div>
              )}
            </section>
            <DestinationList result={result} baselineResult={baselineResult} selected={selected} onSelect={selectDestination} onClear={() => setSelected(null)} onResolve={resolveRoute} />
          </div>
        </div>
        <footer className="footnote">
          <a href={sourceHref}>Library of Congress floor plan</a> · Routes, table, elevator outage and obstruction are simulated.
        </footer>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<JudgeDemo />);

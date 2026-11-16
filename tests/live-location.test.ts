import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LOCATION_CONFIG,
  validateLocationInput,
  isImplausibleJump,
  decideSend,
  computeLocationStatus,
  customerMayTrackJob,
  plumberMayShareLocation,
  deriveCustomerTrackingState,
  deriveJobTripState,
  googleMapsDirectionsUrl,
} from "../src/lib/live-location.ts";
import {
  decimatePoints,
  parseOsrmRoute,
  parseOrsRoute,
  routeCacheKey,
} from "../src/lib/routing.ts";
import {
  NAV_CONFIG,
  shortestAngleDelta,
  smoothHeading,
  isAcceptableNavFix,
  extrapolatePosition,
  projectPointOntoRoute,
  splitRouteAtProjection,
  updateOffRouteState,
  createFixBufferState,
  pushFixToBuffer,
  sampleBufferedPosition,
  stepCameraFollow,
  computeFrameAlpha,
} from "../src/lib/live-navigation.ts";

describe("validateLocationInput", () => {
  const now = 1_750_000_000_000;

  it("accepts valid coordinates and metadata", () => {
    const res = validateLocationInput(
      { lat: 12.0022, lng: 8.592, accuracy: 18, heading: 90, speed: 6.5, timestamp: now - 5_000 },
      now
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.lat, 12.0022);
      assert.equal(res.value.accuracyM, 18);
    }
  });

  it("rejects out-of-range, NaN, and (0,0) coordinates", () => {
    assert.equal(validateLocationInput({ lat: 95, lng: 8.5 }, now).ok, false);
    assert.equal(validateLocationInput({ lat: 12, lng: 185 }, now).ok, false);
    assert.equal(validateLocationInput({ lat: Number.NaN, lng: 8.5 }, now).ok, false);
    assert.equal(validateLocationInput({ lat: 0, lng: 0 }, now).ok, false);
  });

  it("rejects poor GPS accuracy above threshold", () => {
    const res = validateLocationInput(
      { lat: 12.0022, lng: 8.592, accuracy: LOCATION_CONFIG.MAX_ACCEPTABLE_ACCURACY_M + 50 },
      now
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "poor_accuracy");
  });

  it("rejects stale or far-future timestamps", () => {
    const stale = validateLocationInput(
      { lat: 12.0022, lng: 8.592, timestamp: now - LOCATION_CONFIG.MAX_FIX_AGE_MS - 1_000 },
      now
    );
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "stale_fix");

    const future = validateLocationInput(
      { lat: 12.0022, lng: 8.592, timestamp: now + LOCATION_CONFIG.MAX_CLOCK_SKEW_MS + 10_000 },
      now
    );
    assert.equal(future.ok, false);
    if (!future.ok) assert.equal(future.code, "invalid_timestamp");
  });
});

describe("isImplausibleJump", () => {
  it("flags teleportation >250 km/h", () => {
    const t0 = 1_750_000_000_000;
    const jumped = isImplausibleJump(
      { lat: 12.0, lng: 8.5, fixTimeMs: t0, accuracyM: 15 },
      { lat: 12.5, lng: 8.5, fixTimeMs: t0 + 10_000, accuracyM: 15 }
    );
    assert.equal(jumped, true);
  });

  it("allows normal urban driving", () => {
    const t0 = 1_750_000_000_000;
    const ok = isImplausibleJump(
      { lat: 12.0, lng: 8.5, fixTimeMs: t0, accuracyM: 20 },
      { lat: 12.003, lng: 8.5, fixTimeMs: t0 + 30_000, accuracyM: 20 }
    );
    assert.equal(ok, false);
  });
});

describe("decideSend", () => {
  const t0 = 1_750_000_000_000;

  it("sends immediately when there is no previous fix", () => {
    assert.equal(
      decideSend({ previous: null, next: { lat: 12.0, lng: 8.5 }, nowMs: t0 }),
      "send"
    );
  });

  it("skips within minimum send interval", () => {
    assert.equal(
      decideSend({
        previous: { lat: 12.0, lng: 8.5, sentAtMs: t0 },
        next: { lat: 12.01, lng: 8.5 },
        nowMs: t0 + LOCATION_CONFIG.MIN_SEND_INTERVAL_MS - 1_000,
      }),
      "skip"
    );
  });

  it("sends when moved >= MIN_MOVE_METERS after min interval", () => {
    assert.equal(
      decideSend({
        previous: { lat: 12.0, lng: 8.5, sentAtMs: t0 },
        next: { lat: 12.001, lng: 8.5 },
        nowMs: t0 + LOCATION_CONFIG.MIN_SEND_INTERVAL_MS + 1_000,
      }),
      "send"
    );
  });

  it("sends heartbeat when stationary after HEARTBEAT_INTERVAL_MS", () => {
    assert.equal(
      decideSend({
        previous: { lat: 12.0, lng: 8.5, sentAtMs: t0 },
        next: { lat: 12.0, lng: 8.5 },
        nowMs: t0 + LOCATION_CONFIG.HEARTBEAT_INTERVAL_MS + 1_000,
      }),
      "heartbeat"
    );
  });
});

describe("computeLocationStatus", () => {
  const now = 1_750_000_000_000;

  it("distinguishes LIVE, UPDATING (stale), LAST SEEN, UNAVAILABLE, NOT SHARING", () => {
    assert.equal(
      computeLocationStatus({ sharingEnabled: false }, now).status,
      "not_sharing"
    );
    assert.equal(
      computeLocationStatus({ latitude: null, longitude: null, sharingEnabled: true }, now).status,
      "unavailable"
    );
    assert.equal(
      computeLocationStatus(
        {
          latitude: 12.0,
          longitude: 8.5,
          locationTimestamp: new Date(now - 20_000).toISOString(),
          lastSeenAt: new Date(now - 20_000).toISOString(),
          sharingEnabled: true,
        },
        now
      ).status,
      "live"
    );
    // Stationary plumber with fresh heartbeat stays LIVE even if fix is older
    assert.equal(
      computeLocationStatus(
        {
          latitude: 12.0,
          longitude: 8.5,
          locationTimestamp: new Date(now - 90_000).toISOString(),
          lastSeenAt: new Date(now - 10_000).toISOString(),
          sharingEnabled: true,
        },
        now
      ).status,
      "live"
    );
    assert.equal(
      computeLocationStatus(
        {
          latitude: 12.0,
          longitude: 8.5,
          locationTimestamp: new Date(now - 120_000).toISOString(),
          lastSeenAt: new Date(now - 120_000).toISOString(),
          sharingEnabled: true,
        },
        now
      ).status,
      "stale"
    );
    assert.equal(
      computeLocationStatus(
        {
          latitude: 12.0,
          longitude: 8.5,
          locationTimestamp: new Date(now - 300_000).toISOString(),
          lastSeenAt: new Date(now - 300_000).toISOString(),
          sharingEnabled: true,
        },
        now
      ).status,
      "last_seen"
    );
  });
});

describe("authorisation & lifecycle", () => {
  it("customerMayTrackJob enforces ownership, assignment, and active status", () => {
    const job = {
      status: "in_progress",
      assignedPlumberId: "p-1",
      customerId: "c-1",
      customerPhoneLast10: "8012345678",
    };
    assert.equal(customerMayTrackJob(job, { id: "c-1" }), true);
    assert.equal(customerMayTrackJob(job, { id: "c-2", phoneLast10: "8012345678" }), true);
    assert.equal(customerMayTrackJob(job, { id: "c-2", phoneLast10: "8099999999" }), false);
    assert.equal(customerMayTrackJob({ ...job, status: "completed" }, { id: "c-1" }), false);
    assert.equal(customerMayTrackJob({ ...job, status: "cancelled" }, { id: "c-1" }), false);
    assert.equal(customerMayTrackJob({ ...job, assignedPlumberId: null }, { id: "c-1" }), false);
  });

  it("plumberMayShareLocation requires approval and (On Duty OR active job)", () => {
    assert.equal(
      plumberMayShareLocation({ isApproved: false, isOnDuty: true, hasActiveJob: true }),
      false
    );
    assert.equal(
      plumberMayShareLocation({ isApproved: true, isOnDuty: false, hasActiveJob: false }),
      false
    );
    assert.equal(
      plumberMayShareLocation({ isApproved: true, isOnDuty: false, hasActiveJob: true }),
      true
    );
    assert.equal(
      plumberMayShareLocation({ isApproved: true, isOnDuty: true, hasActiveJob: false }),
      true
    );
  });

  it("deriveCustomerTrackingState covers all 8 customer states", () => {
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "completed",
        hasAssignedPlumber: true,
        locationStatus: "live",
        distanceMeters: 10,
      }),
      "completed"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "cancelled",
        hasAssignedPlumber: true,
        locationStatus: "live",
        distanceMeters: 10,
      }),
      "cancelled"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "new",
        hasAssignedPlumber: false,
        locationStatus: null,
        distanceMeters: null,
      }),
      "waiting_assignment"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "scheduled",
        hasAssignedPlumber: true,
        locationStatus: "unavailable",
        distanceMeters: null,
      }),
      "waiting_first_location"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "in_progress",
        hasAssignedPlumber: true,
        locationStatus: "stale",
        distanceMeters: 500,
      }),
      "temporarily_unavailable"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "in_progress",
        hasAssignedPlumber: true,
        locationStatus: "live",
        distanceMeters: 50,
      }),
      "arrived"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "in_progress",
        hasAssignedPlumber: true,
        locationStatus: "live",
        distanceMeters: 600,
      }),
      "approaching"
    );
    assert.equal(
      deriveCustomerTrackingState({
        requestStatus: "in_progress",
        hasAssignedPlumber: true,
        locationStatus: "live",
        distanceMeters: 3000,
      }),
      "live"
    );
  });

  it("builds valid Google Maps directions URL", () => {
    const url = googleMapsDirectionsUrl({ lat: 12.0022, lng: 8.592 }, { lat: 12.01, lng: 8.58 });
    assert.ok(url.startsWith("https://www.google.com/maps/dir/?"));
    assert.ok(url.includes("destination=12.0022%2C8.592"));
    assert.ok(url.includes("origin=12.01%2C8.58"));
  });
});

describe("routing parsers & helpers", () => {
  it("parses OSRM route payload into [lat, lng] points", () => {
    const parsed = parseOsrmRoute({
      code: "Ok",
      routes: [
        {
          distance: 2450,
          duration: 320,
          geometry: {
            coordinates: [
              [8.58, 12.0],
              [8.59, 12.005],
            ],
          },
          legs: [
            {
              steps: [
                { maneuver: { type: "depart", modifier: "right" }, name: "Zaria Rd", distance: 1200 },
                { maneuver: { type: "arrive" }, name: "", distance: 0 },
              ],
            },
          ],
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.distanceM, 2450);
    assert.equal(parsed.durationS, 320);
    assert.deepEqual(parsed.points[0], [12.0, 8.58]);
    assert.equal(parsed.trafficAware, false);
  });

  it("parses OpenRouteService GeoJSON payload", () => {
    const parsed = parseOrsRoute({
      features: [
        {
          properties: {
            summary: { distance: 1800, duration: 240 },
            segments: [{ steps: [{ instruction: "Turn left", distance: 500 }] }],
          },
          geometry: {
            coordinates: [
              [8.58, 12.0],
              [8.585, 12.002],
            ],
          },
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed.provider, "openrouteservice");
    assert.equal(parsed.distanceM, 1800);
    assert.deepEqual(parsed.points[1], [12.002, 8.585]);
  });

  it("decimates large route arrays and buckets cache keys", () => {
    const pts: [number, number][] = Array.from({ length: 1000 }, (_, i) => [12 + i * 0.0001, 8.5]);
    const reduced = decimatePoints(pts, 100);
    assert.equal(reduced.length, 100);
    assert.deepEqual(reduced[0], pts[0]);
    assert.deepEqual(reduced[99], pts[999]);
    assert.equal(
      routeCacheKey({ lat: 12.00001, lng: 8.50001 }, { lat: 12.01, lng: 8.51 }),
      "12.0000,8.5000>12.0100,8.5100"
    );
  });
});

describe("live-navigation pure helpers", () => {
  it("computes shortest-angle rotation and smooths heading across 0/360 wraparound", () => {
    assert.equal(shortestAngleDelta(350, 10), 20);
    assert.equal(shortestAngleDelta(10, 350), -20);
    // Low-pass filter from 350 toward 10 with alpha=0.5 should move clockwise to 0
    assert.equal(smoothHeading(350, 10, 0.5), 0);
    // From 10 toward 350 with alpha=0.25 should move counter-clockwise to 5
    assert.equal(smoothHeading(10, 350, 0.25), 5);
  });

  it("rejects bad fixes (>100m accuracy or impossible jump)", () => {
    const t0 = 1_750_000_000_000;
    const goodPrev = { lat: 12.0022, lng: 8.592, accuracy: 15, timestampMs: t0 };
    assert.equal(isAcceptableNavFix(goodPrev), true);

    // Accuracy > 100 m rejected
    assert.equal(
      isAcceptableNavFix({ lat: 12.0023, lng: 8.592, accuracy: 120, timestampMs: t0 + 2000 }, goodPrev),
      false
    );

    // Impossible jump (~11 km in 2s) rejected
    assert.equal(
      isAcceptableNavFix({ lat: 12.1022, lng: 8.592, accuracy: 15, timestampMs: t0 + 2000 }, goodPrev),
      false
    );

    // Normal 20 m move in 2s accepted
    assert.equal(
      isAcceptableNavFix({ lat: 12.00238, lng: 8.592, accuracy: 15, timestampMs: t0 + 2000 }, goodPrev),
      true
    );
  });

  it("caps extrapolation at 3s (own) / 5s (remote) and stops when stationary or >100m accuracy", () => {
    // Stationary (< 0.5 m/s) -> no extrapolation
    const stat = extrapolatePosition({
      lat: 12.0,
      lng: 8.5,
      speedMps: 0.2,
      headingDeg: 0,
      elapsedMs: 2000,
      accuracyMeters: 10,
    });
    assert.equal(stat.extrapolated, false);
    assert.equal(stat.lat, 12.0);

    // Poor accuracy (> 100 m) -> no extrapolation
    const poor = extrapolatePosition({
      lat: 12.0,
      lng: 8.5,
      speedMps: 10,
      headingDeg: 0,
      elapsedMs: 2000,
      accuracyMeters: 150,
    });
    assert.equal(poor.extrapolated, false);

    // Capped at 3s even if elapsedMs is 10s
    const at3s = extrapolatePosition({
      lat: 12.0,
      lng: 8.5,
      speedMps: 10,
      headingDeg: 0,
      elapsedMs: 3000,
      accuracyMeters: 10,
      maxExtrapolationMs: NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS,
    });
    const at10s = extrapolatePosition({
      lat: 12.0,
      lng: 8.5,
      speedMps: 10,
      headingDeg: 0,
      elapsedMs: 10000,
      accuracyMeters: 10,
      maxExtrapolationMs: NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS,
    });
    assert.equal(at3s.extrapolated, true);
    assert.equal(at10s.lat, at3s.lat);
  });

  it("projects onto route and splits passed vs remaining segments", () => {
    const route: [number, number][] = [
      [12.0, 8.5],
      [12.01, 8.5],
      [12.01, 8.51],
    ];
    const proj = projectPointOntoRoute([12.005, 8.5001], route);
    assert.ok(proj);
    assert.equal(proj.segmentIndex, 0);
    assert.ok(proj.distanceMeters < 20);
    const { passed, remaining } = splitRouteAtProjection(route, proj);
    assert.equal(passed.length, 2);
    assert.equal(remaining.length, 3);
  });

  it("triggers reroute only after >50m off-route for 10s with 15s cooldown", () => {
    let state = { offRouteSinceMs: null as number | null, lastRerouteAtMs: 0 };
    const t0 = 100_000;

    // First off-route sample at t0: starts timer, no reroute yet
    let res = updateOffRouteState(state, 65, t0);
    assert.equal(res.shouldReroute, false);
    state = res.nextState;

    // 5s later: still < 10s
    res = updateOffRouteState(state, 65, t0 + 5_000);
    assert.equal(res.shouldReroute, false);
    state = res.nextState;

    // 10.5s later: triggers reroute
    res = updateOffRouteState(state, 65, t0 + 10_500);
    assert.equal(res.shouldReroute, true);
    state = res.nextState;

    // Another 11s later (within 15s cooldown of t0 + 10_500): suppressed
    res = updateOffRouteState(state, 65, t0 + 21_500);
    assert.equal(res.shouldReroute, false);
  });

  it("derives job trip state from history without changing main status", () => {
    assert.equal(deriveJobTripState(undefined), "idle");
    assert.equal(deriveJobTripState([{ action: "Status updated to accepted" }]), "idle");
    assert.equal(
      deriveJobTripState([{ action: "Status updated to accepted" }, { action: "trip_started" }]),
      "on_the_way"
    );
    assert.equal(
      deriveJobTripState([
        { action: "trip_started" },
        { action: "arrived" },
      ]),
      "arrived"
    );
    assert.equal(
      deriveJobTripState([
        { action: "trip_started" },
        { action: "trip_cancelled" },
      ]),
      "idle"
    );
  });
});

describe("live-movement & camera-follow lifecycle", () => {
  it("1 & 2. interpolates straight-line and continuous movement across consecutive GPS updates", () => {
    let buf = createFixBufferState();
    const r1 = pushFixToBuffer(
      buf,
      { lat: 12.0, lng: 8.5, accuracy: 10, speed: 10, heading: 0, timestampMs: 1_000 },
      1_000
    );
    assert.equal(r1.accepted, true);
    buf = r1.nextState;

    const r2 = pushFixToBuffer(
      buf,
      { lat: 12.001, lng: 8.5, accuracy: 10, speed: 10, heading: 0, timestampMs: 2_000 },
      2_000
    );
    assert.equal(r2.accepted, true);
    buf = r2.nextState;

    const mid = sampleBufferedPosition(buf, 2_500, NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS);
    assert.ok(mid && mid.lat > 12.0004 && mid.lat < 12.0006);

    // Consecutive update preserves continuity from currentDisplayed
    const r3 = pushFixToBuffer(
      buf,
      { lat: 12.002, lng: 8.5, accuracy: 10, speed: 10, heading: 0, timestampMs: 3_000 },
      2_500,
      { currentDisplayed: { lat: mid!.lat, lng: mid!.lng } }
    );
    assert.equal(r3.accepted, true);
    const startOfSeg3 = sampleBufferedPosition(r3.nextState, 2_500, NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS);
    assert.ok(Math.abs(startOfSeg3!.lat - mid!.lat) < 1e-9);
  });

  it("3 & 4. handles 90-degree turns and 359 -> 1 degree shortest-angle camera bearing", () => {
    const pose90 = stepCameraFollow(
      { lat: 12.0, lng: 8.5, bearing: 0 },
      { lat: 12.001, lng: 8.5, bearing: 90 },
      16.67
    );
    assert.ok(pose90.bearing > 0 && pose90.bearing < 90);

    const wrap = stepCameraFollow(
      { lat: 12.0, lng: 8.5, bearing: 359 },
      { lat: 12.0, lng: 8.5, bearing: 1 },
      50
    );
    // Must cross 360 -> 0 -> 1 (not backwards through 180)
    assert.ok(wrap.bearing >= 359 || wrap.bearing <= 1.1);
    assert.ok(computeFrameAlpha(16, 120) > 0 && computeFrameAlpha(16, 120) < 1);
  });

  it("5. stops movement prediction when stationary", () => {
    let buf = createFixBufferState();
    buf = pushFixToBuffer(
      buf,
      { lat: 12.0, lng: 8.5, accuracy: 8, speed: 0.1, heading: 90, timestampMs: 1_000 },
      1_000
    ).nextState;
    const after5s = sampleBufferedPosition(buf, 6_000, NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS);
    assert.equal(after5s?.extrapolating, false);
    assert.equal(after5s?.lat, 12.0);
    assert.equal(after5s?.lng, 8.5);
  });

  it("6, 7 & 8. rejects duplicate timestamps, out-of-order updates, and poor accuracy spikes", () => {
    let buf = createFixBufferState();
    buf = pushFixToBuffer(
      buf,
      { lat: 12.0, lng: 8.5, accuracy: 12, speed: 5, heading: 0, timestampMs: 5_000 },
      5_000
    ).nextState;

    // Duplicate timestamp
    const dup = pushFixToBuffer(
      buf,
      { lat: 12.001, lng: 8.5, accuracy: 12, speed: 5, heading: 0, timestampMs: 5_000 },
      5_100
    );
    assert.equal(dup.accepted, false);

    // Out-of-order timestamp
    const older = pushFixToBuffer(
      buf,
      { lat: 11.999, lng: 8.5, accuracy: 12, speed: 5, heading: 0, timestampMs: 4_000 },
      5_200
    );
    assert.equal(older.accepted, false);

    // Poor accuracy spike right after an accurate fix
    const poor = pushFixToBuffer(
      buf,
      { lat: 12.005, lng: 8.505, accuracy: 220, speed: 5, heading: 0, timestampMs: 6_000 },
      6_000
    );
    assert.equal(poor.accepted, false);
  });

  it("9, 10 & 11. bounds dead reckoning on network loss/long gap and resumes smoothly", () => {
    let buf = createFixBufferState();
    buf = pushFixToBuffer(
      buf,
      { lat: 12.0, lng: 8.5, accuracy: 10, speed: 10, heading: 0, timestampMs: 1_000 },
      1_000
    ).nextState;

    // During 5s remote extrapolation window (after 400ms interp): extrapolating = true
    const during = sampleBufferedPosition(buf, 3_000, NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS);
    assert.equal(during?.extrapolating, true);
    assert.ok(during!.lat > 12.0);

    // After 10s connection loss: extrapolation stops & marks stale
    const after10s = sampleBufferedPosition(buf, 11_400, NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS);
    const at5s = sampleBufferedPosition(buf, 6_400, NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS);
    assert.equal(after10s?.stale, true);
    assert.equal(after10s?.lat, at5s?.lat);

    // Resuming after interruption interpolates smoothly from held position
    const resumed = pushFixToBuffer(
      buf,
      { lat: 12.002, lng: 8.5, accuracy: 12, speed: 8, heading: 0, timestampMs: 12_000 },
      12_000,
      { currentDisplayed: { lat: after10s!.lat, lng: after10s!.lng } }
    );
    assert.equal(resumed.accepted, true);
    const s = sampleBufferedPosition(resumed.nextState, 12_000, NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS);
    assert.equal(s?.lat, after10s?.lat);
  });

  it("12 & 13. preserves route-snapping continuity across parallel roads and detects off-route", () => {
    // Route goes along lng 8.5000 (segments 0..2), while a parallel road sits at lng 8.50025
    const route: [number, number][] = [
      [12.0, 8.5],
      [12.001, 8.5],
      [12.002, 8.5],
      [12.002, 8.50025],
      [12.001, 8.50025],
      [12.0, 8.50025],
    ];
    // Near segment 0 with prevSegmentIndex=0: stays on segment 0 (doesn't jump to parallel seg 4)
    const proj = projectPointOntoRoute([12.0005, 8.5002], route, {
      prevSegmentIndex: 0,
      forwardLookaheadSegments: 2,
      backwardToleranceSegments: 0,
    });
    assert.ok(proj && proj.segmentIndex <= 2);

    // Moving >50m beyond the route for 10s triggers reroute
    let off = { offRouteSinceMs: null as number | null, lastRerouteAtMs: 0 };
    off = updateOffRouteState(off, 70, 1_000).nextState;
    const reroute = updateOffRouteState(off, 70, 11_500);
    assert.equal(reroute.shouldReroute, true);
  });

  it("14 & 15. LiveMap decouples remotePlumber animation from React object identity and supports camera modes", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/map/LiveMap.tsx"),
      "utf8"
    );
    // Remote ingestion must depend on primitive coordinates/timestamps, NOT [remotePlumber]
    assert.equal(src.includes("}, [remotePlumber]);"), false);
    assert.ok(src.includes("[remLat, remLng, remCoordMs, remSpeed, remHeading, remAcc]"));
    assert.ok(src.includes("[remLabel, remStatus]"));
    // Explicit camera modes & continuous rAF camera controller
    assert.ok(src.includes('"following-own"'));
    assert.ok(src.includes('"following-remote"'));
    assert.ok(src.includes('"overview"'));
    assert.ok(src.includes('"free"'));
    assert.ok(src.includes("stepCameraFollow("));
  });
});

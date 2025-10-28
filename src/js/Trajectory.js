import * as THREE from 'three';
import { LanePosition } from './LanePosition.js';

class BezierPath {
  constructor(curve) {
    this.curve = curve;
    this.length = Math.max(this.curve.getLength(), 1e-6);
  }

  getLength() {
    return this.length;
  }

  getPointAt(t) {
    return this.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  }

  getTangentAt(t) {
    return this.curve.getTangent(THREE.MathUtils.clamp(t, 0, 1)).normalize();
  }
}

// Manages the car's presence across lanes, including transitional curves when
// switching lanes. The structure mirrors the reference simulator by keeping
// three lane positions: the current lane, a temporary bezier path during the
// change, and a shadow reservation on the destination lane.
export class Trajectory {
  constructor({ car, lanePosition }) {
    if (!car) {
      throw new Error('Trajectory requires a car reference');
    }
    if (!lanePosition) {
      throw new Error('Trajectory requires an initial LanePosition');
    }

    this.car = car;
    this.current = lanePosition;
    this.current.isPrimary = true;
    this.current.free = false;

    this.next = new LanePosition({ car });
    this.transition = null;
    this.isChanging = false;
  }

  getCurrentLane() {
    return this.current?.lane || null;
  }

  getCurrentLaneIndex() {
    return this.getCurrentLane()?.laneIndex ?? 0;
  }

  getSpatialState() {
    if (this.transition) {
      const length = this.transition.length;
      const position = this.transition.position;
      const t = length > 0 ? THREE.MathUtils.clamp(position / length, 0, 1) : 0;
      return {
        path: this.transition.path,
        length,
        position,
        t
      };
    }

    const lane = this.getCurrentLane();
    const length = lane?.getLength() ?? 0;
    const position = this.current?.position ?? 0;
    const t = length > 0 ? THREE.MathUtils.euclideanModulo(position / length, 1) : 0;

    return {
      path: lane,
      length,
      position,
      t
    };
  }

  advance(distance) {
    const delta = Math.max(distance, 0);
    if (!this.current?.lane) {
      return;
    }

    this._incrementLanePosition(this.current, delta);

    if (!this.isChanging || !this.transition) {
      return;
    }

    this.transition.position = Math.min(this.transition.position + delta, this.transition.length);
    this._incrementLanePosition(this.next, delta);

    const epsilon = 1e-3;
    if (this.transition.position + epsilon >= this.transition.length) {
      this._finishLaneChange();
    }
  }

  tryChangeLane(direction) {
    if (!Number.isInteger(direction) || direction === 0) {
      return false;
    }

    if (this.isChanging) {
      return false;
    }

    const currentLane = this.getCurrentLane();
    if (!currentLane) {
      return false;
    }

    const road = this.car.getRoad?.();
    if (!road) {
      return false;
    }

    const targetLane = road.getLane(currentLane.laneIndex + direction);
    if (!targetLane) {
      return false;
    }

    this._startLaneChange(targetLane);
    return true;
  }

  updateLaneLength(length) {
    if (!this.current?.lane) {
      return;
    }
    const updated = THREE.MathUtils.euclideanModulo(this.current.position, length);
    this.current.position = updated;
    if (this.isChanging && this.next?.lane) {
      const nextLength = this.next.lane.getLength();
      this.next.position = THREE.MathUtils.euclideanModulo(this.next.position, nextLength);
    }
  }

  _incrementLanePosition(lanePosition, delta) {
    if (!lanePosition?.lane) {
      return;
    }
    const updated = lanePosition.position + delta;
    lanePosition.setPosition(updated);
  }

  _startLaneChange(targetLane) {
    if (!targetLane) {
      return;
    }
    if (this.isChanging) {
      return;
    }

    const sourceLane = this.getCurrentLane();
    if (!sourceLane) {
      return;
    }

    const sourceLength = Math.max(sourceLane.getLength(), 1e-6);
    const targetLength = Math.max(targetLane.getLength(), 1e-6);
    const startPosition = this.current.position;
    const forwardTravel = Math.max(this.car.length * 3, sourceLength * 0.05);
    const endPosition = startPosition + forwardTravel;

    const startRelative = THREE.MathUtils.euclideanModulo(startPosition / sourceLength, 1);
    const endRelative = THREE.MathUtils.euclideanModulo(endPosition / targetLength, 1);

    this.next.setLane(targetLane);
    this.next.isPrimary = false;

    const startPoint = sourceLane.getPointAt(startRelative);
    const endPoint = targetLane.getPointAt(endRelative);
    const startTangent = sourceLane.getTangentAt(startRelative).clone().normalize();
    const endTangent = targetLane.getTangentAt(endRelative).clone().normalize();

    const controlOffset = Math.min(Math.max(forwardTravel * 0.5, this.car.length), targetLength * 0.25);
    const lateralVector = new THREE.Vector3().subVectors(endPoint, startPoint);
    const lateralFactor = 0.5;

    const controlPoint1 = startPoint.clone()
      .addScaledVector(startTangent, controlOffset)
      .addScaledVector(lateralVector, lateralFactor);
    const controlPoint2 = endPoint.clone()
      .addScaledVector(endTangent, -controlOffset)
      .addScaledVector(lateralVector, -lateralFactor);

    const curve = new THREE.CubicBezierCurve3(
      startPoint.clone(),
      controlPoint1,
      controlPoint2,
      endPoint.clone()
    );

    const curveLength = Math.max(curve.getLength(), 1e-6);
    const initialNextPosition = endPosition - curveLength;

    this.next.setPosition(initialNextPosition);
    this.next.acquire();

    this.transition = {
      curve,
      path: new BezierPath(curve),
      position: 0,
      length: curveLength,
      startPosition,
      endPosition
    };

    this.isChanging = true;
  }

  _finishLaneChange() {
    if (!this.isChanging) {
      return;
    }

    const previousLanePosition = this.current;

    this.current = this.next;
    this.current.isPrimary = true;

    previousLanePosition.release();

    this.next = new LanePosition({ car: this.car });
    this.transition = null;
    this.isChanging = false;

    this.car.laneIndex = this.getCurrentLaneIndex();
  }
}

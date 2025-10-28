import * as THREE from 'three';

// Tracks a single car's reservation on a lane, including whether the car is
// actively controlled by that lane (primary) or simply reserving space while
// transitioning in from an adjacent lane.
export class LanePosition {
  constructor({
    car,
    lane = null,
    position = 0,
    isPrimary = true
  } = {}) {
    this.car = car;
    this.lane = lane;
    this.position = position;
    this.isPrimary = isPrimary;
    this.free = true;
    this.node = null;
  }

  setLane(lane) {
    if (lane === this.lane) {
      return;
    }
    this.release();
    this.lane = lane;
  }

  setPosition(position) {
    if (!this.lane) {
      this.position = position;
      return;
    }
    const length = Math.max(this.lane.getLength(), 1e-6);
    this.position = THREE.MathUtils.euclideanModulo(position, length);
  }

  acquire() {
    if (!this.lane || !this.free) {
      return;
    }
    this.lane.registerPosition(this);
    this.free = false;
  }

  release() {
    if (this.free || !this.lane) {
      return;
    }
    this.lane.unregisterPosition(this);
    this.free = true;
  }
}

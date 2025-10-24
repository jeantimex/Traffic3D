import * as THREE from 'three';

// Internal node for the circular doubly-linked list that keeps cars ordered
// by their arc-length position on the curve.
class LaneNode {
  constructor(car) {
    this.car = car;
    this.prev = null;
    this.next = null;
  }
}

// A Lane owns a Curve and manages a set of Car instances on that curve. It keeps
// the cars sorted, computes IDM leader/follower relationships, and advances the
// simulation each frame.
export class Lane {
  constructor(curve) {
    this.curve = curve;
    this.nodes = [];
    this.totalLength = this.curve.getLength(); // meters
    this.head = null;
  }

  getLength() {
    return this.totalLength;
  }

  addCar(car, initialPosition = 0) {
    const node = new LaneNode(car);
    this.nodes.push(node);

    car.setTrackLength(this.totalLength);
    // Seed the car somewhere along the closed curve (arc-length coordinate).
    car.position = THREE.MathUtils.euclideanModulo(initialPosition, this.totalLength);
    car.updatePose(this.totalLength);

    this.sortAndLink();
    return node;
  }

  removeCar(car) {
    const index = this.nodes.findIndex(node => node.car === car);
    if (index === -1) return;
    this.nodes.splice(index, 1);
    this.sortAndLink();
  }

  update(deltaTime) {
    if (this.nodes.length === 0) {
      return;
    }

    // Keep cached length in sync so spacing on the closed curve stays accurate.
    this.totalLength = this.curve.getLength();
    for (const node of this.nodes) {
      node.car.setTrackLength(this.totalLength);
    }

    this.sortAndLink();
    const nodeCount = this.nodes.length;
    const accelerations = new Array(nodeCount);

    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      const car = node.car;

      if (nodeCount === 1) {
        // No leader: run free-road IDM term only.
        accelerations[i] = car.computeAcceleration(Infinity, 0);
        continue;
      }

      const leader = node.next.car;
      let gap = leader.position - car.position;
      if (gap <= 0) {
        gap += this.totalLength;
      }
      gap = Math.max(0, gap - car.halfLength - leader.halfLength);

      // deltaSpeed is positive when this car is faster than the leader.
      const deltaSpeed = car.speed - leader.speed;
      accelerations[i] = car.computeAcceleration(gap, deltaSpeed);
    }

    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      node.car.integrate(accelerations[i], deltaTime, this.totalLength);
    }
  }

  // Sorts cars by arc-length position and rebuilds circular list connections.
  sortAndLink() {
    if (this.nodes.length === 0) {
      this.head = null;
      return;
    }

    this.nodes.sort((a, b) => a.car.position - b.car.position);

    const len = this.nodes.length;
    for (let i = 0; i < len; i++) {
      const node = this.nodes[i];
      node.next = this.nodes[(i + 1) % len];
      node.prev = this.nodes[(i - 1 + len) % len];
    }

    this.head = this.nodes[0];
  }
}

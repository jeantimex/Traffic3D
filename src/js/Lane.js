import * as THREE from 'three';

class LaneNode {
  constructor(car) {
    this.car = car;
    this.prev = null;
    this.next = null;
  }
}

export class Lane {
  constructor(curve) {
    this.curve = curve;
    this.nodes = [];
    this.totalLength = this.curve.curve.getLength();
    this.head = null;
  }

  getLength() {
    return this.totalLength;
  }

  addCar(car, initialS = 0) {
    const node = new LaneNode(car);
    this.nodes.push(node);

    car.setTrackLength(this.totalLength);
    car.s = THREE.MathUtils.euclideanModulo(initialS, this.totalLength);
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

    this.totalLength = this.curve.curve.getLength();
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
        accelerations[i] = car.computeAcceleration(Infinity, 0);
        continue;
      }

      const leader = node.next.car;
      let gap = leader.s - car.s;
      if (gap <= 0) {
        gap += this.totalLength;
      }
      gap = Math.max(0, gap - car.halfLength - leader.halfLength);

      const deltaSpeed = car.speed - leader.speed;
      accelerations[i] = car.computeAcceleration(gap, deltaSpeed);
    }

    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      node.car.integrate(accelerations[i], deltaTime, this.totalLength);
    }
  }

  sortAndLink() {
    if (this.nodes.length === 0) {
      this.head = null;
      return;
    }

    this.nodes.sort((a, b) => a.car.s - b.car.s);

    const len = this.nodes.length;
    for (let i = 0; i < len; i++) {
      const node = this.nodes[i];
      node.next = this.nodes[(i + 1) % len];
      node.prev = this.nodes[(i - 1 + len) % len];
    }

    this.head = this.nodes[0];
  }
}

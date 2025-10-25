import * as THREE from 'three';
import { ShapeSegment } from './ShapeSegment.js';

// Straight segment defined by a start and end point (meters in world space).
export class LineSegment extends ShapeSegment {
  constructor(start, end) {
    super();
    this.start = start.clone();
    this.end = end.clone();
    this.delta = new THREE.Vector3().subVectors(this.end, this.start);
    this.length = this.delta.length();
    this.direction = this.length > 0 ? this.delta.clone().normalize() : new THREE.Vector3(1, 0, 0);
  }

  getLength() {
    return this.length;
  }

  getStart() {
    return this.start.clone();
  }

  getEnd() {
    return this.end.clone();
  }

  getPointAt(t) {
    return new THREE.Vector3().copy(this.delta).multiplyScalar(THREE.MathUtils.clamp(t, 0, 1)).add(this.start);
  }

  getTangentAt() {
    return this.direction.clone();
  }

  getSpacedPoints(divisions = 10) {
    const points = [];
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      points.push(this.getPointAt(t));
    }
    return points;
  }
}

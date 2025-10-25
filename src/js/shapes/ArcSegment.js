import * as THREE from 'three';
import { ShapeSegment } from './ShapeSegment.js';

// Circular arc segment constrained to the XZ plane (constant Y). Useful for
// running track bends and other smooth turns.
export class ArcSegment extends ShapeSegment {
  constructor({ start, end, center, clockwise = false }) {
    super();
    this.start = start.clone();
    this.end = end.clone();
    this.center = center.clone();
    this.clockwise = clockwise;

    this.radius = new THREE.Vector2(this.start.x - this.center.x, this.start.z - this.center.z).length();
    this.startAngle = Math.atan2(this.start.z - this.center.z, this.start.x - this.center.x);
    this.endAngle = Math.atan2(this.end.z - this.center.z, this.end.x - this.center.x);
    this.angleSpan = this.computeAngleSpan();
    this.length = this.radius * this.angleSpan;
    this.normal = new THREE.Vector3(0, 1, 0);
  }

  computeAngleSpan() {
    const fullTurn = Math.PI * 2;
    let span = this.endAngle - this.startAngle;
    if (this.clockwise) {
      if (span > 0) {
        span -= fullTurn;
      }
      return Math.abs(span);
    }
    if (span < 0) {
      span += fullTurn;
    }
    return span;
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

  angleAt(t) {
    const clampedT = THREE.MathUtils.clamp(t, 0, 1);
    const direction = this.clockwise ? -1 : 1;
    return this.startAngle + direction * this.angleSpan * clampedT;
  }

  getPointAt(t) {
    const angle = this.angleAt(t);
    const x = this.center.x + this.radius * Math.cos(angle);
    const z = this.center.z + this.radius * Math.sin(angle);
    return new THREE.Vector3(x, this.start.y, z);
  }

  getTangentAt(t) {
    const direction = this.clockwise ? -1 : 1;
    const angle = this.angleAt(t);
    const tangent = new THREE.Vector3(
      -Math.sin(angle) * direction,
      0,
      Math.cos(angle) * direction
    );
    return tangent.normalize();
  }

  getSpacedPoints(divisions = 32) {
    const points = [];
    for (let i = 0; i <= divisions; i++) {
      points.push(this.getPointAt(i / divisions));
    }
    return points;
  }
}

import * as THREE from 'three';

// Defines a closed Catmull-Rom spline used as the driving lane.
// Responsible for authoring the control points, visualising the path,
// and exposing helpers to query points/tangents/length along the track.
export class Curve {
  constructor(points) {
    this.points = points || this.generateDefaultPoints();

    this.curve = new THREE.CatmullRomCurve3(this.points, true);

    this.createVisualization();
  }

  // Builds a wavy loop that sits above ground. This shapes the lane,
  // introducing elevation and radial variation so the cars experience
  // hills and gentle bends while remaining on a closed track.
  generateDefaultPoints() {
    const segments = 16;
    const radius = 45;
    const heightAmplitude = 10;
    const baseHeight = 12;
    const points = [];

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      const radialOffset = radius + Math.sin(angle * 3) * 6;
      const x = Math.cos(angle) * radialOffset;
      const z = Math.sin(angle) * radialOffset;
      const y = baseHeight + Math.sin(angle * 2) * heightAmplitude;
      points.push(new THREE.Vector3(x, y, z));
    }

    return points;
  }

  createVisualization() {
    const curvePoints = this.curve.getSpacedPoints(100);
    const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const material = new THREE.LineBasicMaterial({ color: 0x000000 });
    this.mesh = new THREE.Line(geometry, material);
  }

  getPointAt(t) {
    return this.curve.getPointAt(t);
  }

  getTangentAt(t) {
    return this.curve.getTangentAt(t);
  }

  // Returns the total arc length of the curve (in world units).
  getLength() {
    return this.curve.getLength();
  }

  getMesh() {
    return this.mesh;
  }
}

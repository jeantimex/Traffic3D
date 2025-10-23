import * as THREE from 'three';

export class Curve {
  constructor(points) {
    this.points = points || this.generateDefaultPoints();

    this.curve = new THREE.CatmullRomCurve3(this.points, true);

    this.createVisualization();
  }

  generateDefaultPoints() {
    const segments = 12;
    const radius = 25;
    const heightAmplitude = 8;
    const baseHeight = 12;
    const points = [];

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
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

  getMesh() {
    return this.mesh;
  }
}

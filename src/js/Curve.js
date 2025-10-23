import * as THREE from 'three';

export class Curve {
  constructor(points) {
    this.points = points || [
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(-10, 0, 20),
      new THREE.Vector3(10, 0, 20),
      new THREE.Vector3(20, 0, -20)
    ];

    this.curve = new THREE.CatmullRomCurve3(this.points);
    this.curve.closed = true;

    this.createVisualization();
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

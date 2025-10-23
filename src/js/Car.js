import * as THREE from 'three';

export class Car {
  constructor(curve, color = 0xff0000, duration = 10) {
    this.curve = curve;
    this.color = color;
    this.duration = duration;

    this.tempDirection = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempUp = new THREE.Vector3();

    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.rotationMatrix = new THREE.Matrix4();
    this.targetQuaternion = new THREE.Quaternion();
    this.currentQuaternion = new THREE.Quaternion();
    this.hasOrientation = false;

    this.createMesh();
    this.createAnimation();
  }

  createMesh() {
    const geometry = new THREE.BoxGeometry(2, 1, 4);
    const material = new THREE.MeshBasicMaterial({ color: this.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.5;
  }

  createAnimation() {
    // Use getSpacedPoints for even arc length distribution
    const points = this.curve.curve.getSpacedPoints(100);

    // Store the spaced points for orientation calculation
    this.spacedPoints = points;

    let arr = [];
    for (let i = 0; i < 101; i++) {
      arr.push(i * this.duration / 100);
    }
    const times = new Float32Array(arr);

    let posArr = [];
    points.forEach(elem => {
      posArr.push(elem.x, elem.y + 0.5, elem.z);
    });
    const values = new Float32Array(posArr);

    const posTrack = new THREE.KeyframeTrack(this.mesh.name + '.position', times, values);
    const clip = new THREE.AnimationClip("move", this.duration, [posTrack]);

    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.action = this.mixer.clipAction(clip);
    this.action.setLoop(THREE.LoopRepeat);
    this.action.play();
  }

  update(deltaTime) {
    if (this.mixer) {
      this.mixer.update(deltaTime);
      this.updateOrientation();
    }
  }

  updateOrientation() {
    if (!this.spacedPoints || this.spacedPoints.length < 3 || !this.action) {
      return;
    }

    const wrappedTime = (this.action.time % this.duration + this.duration) % this.duration;
    const progress = wrappedTime / this.duration;

    const tangent = this.curve.getTangentAt(progress);
    if (tangent.lengthSq() < 1e-6) {
      return;
    }

    this.tempDirection.copy(tangent).normalize();

    // Build an orientation basis that keeps the car upright relative to world up
    this.tempRight.crossVectors(this.worldUp, this.tempDirection);
    if (this.tempRight.lengthSq() < 1e-6) {
      // Tangent is nearly parallel to up; choose an arbitrary perpendicular axis
      this.tempRight.set(1, 0, 0);
      this.tempRight.cross(this.tempDirection);
    }
    this.tempRight.normalize();

    this.tempUp.crossVectors(this.tempDirection, this.tempRight).normalize();

    this.rotationMatrix.makeBasis(this.tempRight, this.tempUp, this.tempDirection);
    this.targetQuaternion.setFromRotationMatrix(this.rotationMatrix);

    if (!this.hasOrientation) {
      this.currentQuaternion.copy(this.targetQuaternion);
      this.mesh.quaternion.copy(this.currentQuaternion);
      this.hasOrientation = true;
      return;
    }

    const damping = 0.2;
    this.currentQuaternion.slerp(this.targetQuaternion, damping);
    this.mesh.quaternion.copy(this.currentQuaternion);
  }

  setSpeed(speed) {
    if (this.action) {
      this.action.timeScale = speed;
    }
  }

  getMesh() {
    return this.mesh;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
  }
}

import * as THREE from 'three';

export class Car {
  constructor(curve, color = 0xff0000, duration = 10) {
    this.curve = curve;
    this.color = color;
    this.duration = duration;

    this.tempDirection = new THREE.Vector3();
    this.tempFlatDirection = new THREE.Vector3();
    this.lastLoggedIndex = -1;
    this.twoPi = Math.PI * 2;

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
    if (!this.spacedPoints || this.spacedPoints.length < 3) {
      return;
    }

    const wrappedTime = (this.action.time % this.duration + this.duration) % this.duration;
    const progress = wrappedTime / this.duration;

    const segmentCount = this.spacedPoints.length - 1;
    const scaledIndex = progress * segmentCount;
    const baseIndex = Math.floor(scaledIndex) % segmentCount;

    const segmentStart = this.spacedPoints[baseIndex];
    const segmentEnd = this.spacedPoints[baseIndex + 1];

    // Derive forward direction from the actual segment the car is travelling on
    this.tempDirection.subVectors(segmentEnd, segmentStart);

    if (this.tempDirection.lengthSq() > 1e-6) {
      this.tempFlatDirection.set(this.tempDirection.x, 0, this.tempDirection.z).normalize();

      if (this.tempFlatDirection.lengthSq() > 1e-6) {
        const targetAngle = Math.atan2(this.tempFlatDirection.x, this.tempFlatDirection.z);

        const referenceAngle = this.lastAngle !== undefined ? this.lastAngle : targetAngle;
        const wrappedTarget = this.normalizeAngleToReference(targetAngle, referenceAngle);
        const previousAngle = this.lastAngle !== undefined ? this.lastAngle : wrappedTarget;

        let angleDiff = wrappedTarget - previousAngle;

        if (this.lastLoggedIndex !== baseIndex) {
          this.lastLoggedIndex = baseIndex;
          console.log(`Segment ${baseIndex}: heading ${wrappedTarget.toFixed(3)} rad`);
        }

        if (Math.abs(angleDiff) > 1.0) {
          const start = segmentStart;
          const end = segmentEnd;
          console.warn(
            `Heading spike at segment ${baseIndex} (progress ${progress.toFixed(3)}): ` +
            `angleDiff=${angleDiff.toFixed(3)} target=${wrappedTarget.toFixed(3)} ` +
            `start=(${start.x.toFixed(2)}, ${start.y.toFixed(2)}, ${start.z.toFixed(2)}) ` +
            `end=(${end.x.toFixed(2)}, ${end.y.toFixed(2)}, ${end.z.toFixed(2)})`
          );
        }

        const damping = 0.2;
        const smoothedAngle = previousAngle + angleDiff * damping;
        this.lastAngle = this.normalizeAngle(smoothedAngle);
        this.mesh.rotation.set(0, this.lastAngle, 0);
      }
    }
  }

  normalizeAngle(angle) {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, this.twoPi) - Math.PI;
  }

  normalizeAngleToReference(angle, reference) {
    const delta = angle - reference;
    const wrappedDelta = THREE.MathUtils.euclideanModulo(delta + Math.PI, this.twoPi) - Math.PI;
    return reference + wrappedDelta;
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

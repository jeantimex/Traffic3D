import * as THREE from 'three';

export class Car {
  constructor(curve, {
    color = 0xff0000,
    length = 4,
    width = 2,
    height = 1,
    desiredSpeed = 12,
    maxAcceleration = 3,
    comfortableDeceleration = 2,
    timeHeadway = 1.5,
    minGap = 2,
    constantGap = 3,
    initialSpeed = 0,
    initialS = 0
  } = {}) {
    this.curve = curve;
    this.color = color;

    this.length = length;
    this.width = width;
    this.height = height;
    this.halfLength = this.length * 0.5;

    this.desiredSpeed = desiredSpeed;
    this.maxAcceleration = maxAcceleration;
    this.comfortableDeceleration = comfortableDeceleration;
    this.timeHeadway = timeHeadway;
    this.minGap = minGap;
    this.constantGap = constantGap;

    this.speed = Math.max(0, initialSpeed);
    this.acceleration = 0;
    this.s = initialS;
    this.curveLength = this.curve.curve.getLength();

    this.tempDirection = new THREE.Vector3();
    this.tempRight = new THREE.Vector3();
    this.tempUp = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.rotationMatrix = new THREE.Matrix4();
    this.targetQuaternion = new THREE.Quaternion();
    this.currentQuaternion = new THREE.Quaternion();
    this.hasOrientation = false;

    this.createMesh();
    this.updatePose(this.curveLength);
  }

  createMesh() {
    const geometry = new THREE.BoxGeometry(this.width, this.height, this.length);
    const material = new THREE.MeshBasicMaterial({ color: this.color });
    this.mesh = new THREE.Mesh(geometry, material);
  }

  setTrackLength(length) {
    this.curveLength = length;
  }

  computeAcceleration(gap, deltaSpeed) {
    const freeRoadTerm = Math.pow(this.speed / Math.max(this.desiredSpeed, 1e-3), 4);

    let desiredGap = Math.max(this.minGap, this.constantGap);
    if (deltaSpeed > 0 && this.maxAcceleration > 0 && this.comfortableDeceleration > 0) {
      const brakingTerm = (this.speed * deltaSpeed) / (2 * Math.sqrt(this.maxAcceleration * this.comfortableDeceleration));
      desiredGap += Math.max(0, brakingTerm);
    }

    let interactionTerm = 0;
    if (Number.isFinite(gap)) {
      const safeGap = Math.max(this.minGap, gap);
      interactionTerm = Math.pow(desiredGap / safeGap, 2);
    }

    const acceleration = this.maxAcceleration * (1 - freeRoadTerm - interactionTerm);
    return acceleration;
  }

  integrate(acceleration, deltaTime, trackLength) {
    this.acceleration = acceleration;
    this.speed = Math.max(0, this.speed + this.acceleration * deltaTime);

    const nextS = this.s + this.speed * deltaTime;
    this.s = THREE.MathUtils.euclideanModulo(nextS, trackLength);

    this.updatePose(trackLength);
  }

  updatePose(trackLength) {
    if (trackLength > 0) {
      this.curveLength = trackLength;
    }

    const length = Math.max(this.curveLength, 1e-6);
    const u = THREE.MathUtils.euclideanModulo(this.s / length, 1);

    const point = this.curve.getPointAt(u);
    const tangent = this.curve.getTangentAt(u);

    this.tempDirection.copy(tangent).normalize();
    this.tempRight.crossVectors(this.worldUp, this.tempDirection);
    if (this.tempRight.lengthSq() < 1e-6) {
      this.tempRight.set(1, 0, 0).cross(this.tempDirection);
    }
    this.tempRight.normalize();
    this.tempUp.crossVectors(this.tempDirection, this.tempRight).normalize();

    this.rotationMatrix.makeBasis(this.tempRight, this.tempUp, this.tempDirection);
    this.targetQuaternion.setFromRotationMatrix(this.rotationMatrix);

    if (!this.hasOrientation) {
      this.currentQuaternion.copy(this.targetQuaternion);
      this.hasOrientation = true;
    } else {
      const damping = 0.25;
      this.currentQuaternion.slerp(this.targetQuaternion, damping);
    }
    this.mesh.quaternion.copy(this.currentQuaternion);

    this.mesh.position.copy(point).addScaledVector(this.tempUp, this.height * 0.5);
  }

  setSpeed(speed) {
    this.speed = Math.max(0, speed);
  }

  setDesiredSpeed(speed) {
    this.desiredSpeed = Math.max(0.1, speed);
  }

  getMesh() {
    return this.mesh;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

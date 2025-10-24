import * as THREE from 'three';

export class Car {
  constructor(curve, {
    color = 0xff0000,
    length = 4,
    width = 2,
    height = 1,
    maxSpeed = 12,
    maxAcceleration = 3,
    comfortableDeceleration = 2,
    safeTimeHeadway = 1.5,
    minGap = 1,
    distanceGap = 3,
    initialSpeed = 0,
    initialPosition = 0
  } = {}) {
    this.curve = curve;
    this.color = color;

    this.length = length;
    this.width = width;
    this.height = height;
    this.halfLength = this.length * 0.5;

    this.maxSpeed = Math.max(0.1, maxSpeed);
    this.maxAcceleration = maxAcceleration;
    this.comfortableDeceleration = comfortableDeceleration;
    this.safeTimeHeadway = safeTimeHeadway;
    this.minGap = minGap;
    this.distanceGap = distanceGap;

    this.speed = THREE.MathUtils.clamp(initialSpeed, 0, this.maxSpeed);
    this.acceleration = 0;
    this.position = initialPosition;
    this.curveLength = this.curve.getLength();

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

  setColor(color) {
    this.color = color;
    if (this.mesh?.material) {
      this.mesh.material.color.setHex(color);
    }
  }

  setDimensions({ length, width, height }) {
    const needsUpdate =
      (typeof length === 'number' && length > 0 && length !== this.length) ||
      (typeof width === 'number' && width > 0 && width !== this.width) ||
      (typeof height === 'number' && height > 0 && height !== this.height);

    if (!needsUpdate) {
      return;
    }

    if (typeof length === 'number' && length > 0) {
      this.length = length;
      this.halfLength = this.length * 0.5;
    }

    if (typeof width === 'number' && width > 0) {
      this.width = width;
    }

    if (typeof height === 'number' && height > 0) {
      this.height = height;
    }

    const geometry = new THREE.BoxGeometry(this.width, this.height, this.length);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }

  setTrackLength(length) {
    this.curveLength = length;
  }

  computeAcceleration(gap, deltaSpeed) {
    const freeRoadTerm = Math.pow(this.speed / Math.max(this.maxSpeed, 1e-3), 4);

    let desiredGap = Math.max(this.minGap, this.distanceGap);
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
    this.speed = THREE.MathUtils.clamp(this.speed + this.acceleration * deltaTime, 0, this.maxSpeed);

    const nextPosition = this.position + this.speed * deltaTime;
    this.position = THREE.MathUtils.euclideanModulo(nextPosition, trackLength);

    this.updatePose(trackLength);
  }

  updatePose(trackLength) {
    if (trackLength > 0) {
      this.curveLength = trackLength;
    }

    const length = Math.max(this.curveLength, 1e-6);
    const u = THREE.MathUtils.euclideanModulo(this.position / length, 1);

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
    this.speed = THREE.MathUtils.clamp(speed, 0, this.maxSpeed);
  }

  setMaxSpeed(speed) {
    this.maxSpeed = Math.max(0.1, speed);
    this.speed = Math.min(this.speed, this.maxSpeed);
  }

  setMaxAcceleration(value) {
    if (typeof value === 'number' && value > 0) {
      this.maxAcceleration = value;
    }
  }

  setComfortableDeceleration(value) {
    if (typeof value === 'number' && value > 0) {
      this.comfortableDeceleration = value;
    }
  }

  setSafeTimeHeadway(value) {
    if (typeof value === 'number' && value >= 0) {
      this.safeTimeHeadway = value;
    }
  }

  setDistanceGap(value) {
    if (typeof value === 'number' && value > 0) {
      this.distanceGap = value;
    }
  }

  getMesh() {
    return this.mesh;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

import * as THREE from 'three';

// Represents a single vehicle travelling along a lane path. The car keeps track
// of its kinematic state (position, speed, acceleration) and updates itself
// using the Intelligent Driver Model (IDM) to follow the vehicle ahead while
// respecting a target speed. The class is also responsible for orienting the
// mesh so that it matches the curve tangent and for reacting to dat.GUI edits.
export class Car {
  constructor(path, {
    color = 0xff0000,
    length = 4,                 // meters
    width = 2,                  // meters
    height = 1,                 // meters
    maxSpeed = 12,              // meters / second
    maxAcceleration = 3,        // meters / second^2
    comfortableDeceleration = 2,// meters / second^2
    safeTimeHeadway = 1.5,      // seconds
    minGap = 1,                 // meters (minimum bumper-to-bumper)
    distanceGap = 3,            // meters (constant desired spacing)
    initialSpeed = 0,           // meters / second
    initialPosition = 0         // meters along the curve
  } = {}) {
    this.path = path;
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
    this.curveLength = this.path.getLength();

    // Temporary vectors/quaternions reused per frame to avoid allocations.
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

  // Creates a simple box to represent the car body. Geometry is rebuilt when
  // the dimensions change via the GUI.
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

  // Rebuilds the box geometry when a dimension slider is changed.
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

  setPathLength(length) {
    this.curveLength = length;
  }

  // Intelligent Driver Model (IDM) acceleration response.
  // gap........ distance to the next car (meters) along the curve.
  // deltaSpeed. positive when we are faster than the car ahead.
  computeAcceleration(gap, deltaSpeed) {
    // Free-road term pulls the car toward its max speed when traffic is clear.
    const freeRoadTerm = Math.pow(this.speed / Math.max(this.maxSpeed, 1e-3), 4);

    // Desired spacing blends constant distance with braking compensation for closing speeds.
    let desiredGap = Math.max(this.minGap, this.distanceGap);
    if (deltaSpeed > 0 && this.maxAcceleration > 0 && this.comfortableDeceleration > 0) {
      const brakingTerm = (this.speed * deltaSpeed) / (2 * Math.sqrt(this.maxAcceleration * this.comfortableDeceleration));
      desiredGap += Math.max(0, brakingTerm);
    }

    // Interaction term penalises following too closely relative to the desired gap.
    let interactionTerm = 0;
    if (Number.isFinite(gap)) {
      const safeGap = Math.max(this.minGap, gap);
      interactionTerm = Math.pow(desiredGap / safeGap, 2);
    }

    const acceleration = this.maxAcceleration * (1 - freeRoadTerm - interactionTerm);
    return acceleration;
  }

  // Semi-implicit Euler step for the arc-length position along the lane.
  integrate(acceleration, deltaTime, trackLength) {
    this.acceleration = acceleration;
    this.speed = THREE.MathUtils.clamp(this.speed + this.acceleration * deltaTime, 0, this.maxSpeed);

    const nextPosition = this.position + this.speed * deltaTime;
    // Wrap the arc-length position because the curve is closed.
    this.position = THREE.MathUtils.euclideanModulo(nextPosition, trackLength);

    this.updatePose(trackLength);
  }

  // Aligns the car with the curve tangent and keeps the mesh hovering above it.
  updatePose(trackLength) {
    if (trackLength > 0) {
      this.curveLength = trackLength;
    }

    const length = Math.max(this.curveLength, 1e-6);
    const u = THREE.MathUtils.euclideanModulo(this.position / length, 1);

    const point = this.path.getPointAt(u);
    const tangent = this.path.getTangentAt(u);

    this.tempDirection.copy(tangent).normalize();
    // Build a Frenet-like frame: project the world up vector onto a plane
    // perpendicular to the tangent so that the car stays upright while
    // still following banking changes in the curve.
    this.tempRight.crossVectors(this.worldUp, this.tempDirection);
    if (this.tempRight.lengthSq() < 1e-6) {
      this.tempRight.set(1, 0, 0).cross(this.tempDirection);
    }
    this.tempRight.normalize();
    // Recompute a local up vector that is orthogonal to both forward and right.
    this.tempUp.crossVectors(this.tempDirection, this.tempRight).normalize();

    // Construct an ONB where +Z is forward, +Y is local up, +X is right.
    this.rotationMatrix.makeBasis(this.tempRight, this.tempUp, this.tempDirection);
    this.targetQuaternion.setFromRotationMatrix(this.rotationMatrix);

    if (!this.hasOrientation) {
      this.currentQuaternion.copy(this.targetQuaternion);
      this.hasOrientation = true;
    } else {
      // Ease toward the new orientation so the car does not snap during
      // tight turns or large changes in the tangent direction.
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

  // Expose mesh for scene graph parenting.
  getMesh() {
    return this.mesh;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

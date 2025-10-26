import * as THREE from 'three';

// Represents a single vehicle travelling along a lane path. The car keeps track
// of its kinematic state (position, speed, acceleration) and updates itself
// using the Intelligent Driver Model (IDM) to follow the vehicle ahead while
// respecting a target speed. The class is also responsible for orienting the
// mesh so that it matches the curve tangent and for reacting to dat.GUI edits.
export class Car {
  constructor({
    road = null,                // Road instance this car belongs to (used for lane context).
    laneIndex = 0,              // Lane index within the current road (0 = left-most).
    path = null,                // Optional explicit path override (defaults to road lane path).
    color = 0xff0000,
    length = 4,                 // meters
    width = 2,                  // meters
    height = 1,                 // meters
    maxSpeed = 12,               // Target cruise speed; higher values let IDM pursue faster free-road motion.
    maxAcceleration = 3,         // How quickly the driver is willing to speed up when the road is free.
    comfortableDeceleration = 2, // Maximum comfortable braking strength; higher values allow sharper slowdowns.
    safeTimeHeadway = 1.5,       // Desired temporal buffer to the leader (seconds) that influences desired following distance.
    minGap = 1,                  // Absolute minimum spacing (meters) the driver insists on even when stopped.
    distanceGap = 3,             // Constant spacing preference (meters) added to the dynamic headway.
    initialSpeed = 0,            // Initial velocity along the lane (m/s).
    initialPosition = 0          // Starting arc-length offset along the composed lane (meters, wraps automatically).
  } = {}) {
    this.road = road;
    this.laneIndex = laneIndex;
    this.path = path || (road ? road.getLane(laneIndex) : null);
    if (!this.path) {
      throw new Error('Car requires a valid lane path. Provide a road with lanes or a `path` override.');
    }
    this.color = color;
    this.highlighted = false;

    this.length = length;
    this.width = width;
    this.height = height;
    this.halfLength = this.length * 0.5;

    // IDM behaviour knobs. Together they define how assertive the driver is
    // when accelerating, braking, and choosing their personal space.
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
    this.laneChange = null;
    this.state = 'DRIVING';

    // Autonomous lane switching properties
    this.laneChangeTimer = 0;
    this.nextLaneChangeTime = this.getRandomLaneChangeInterval();

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

  highlight(color = 0xffff00) {
    if (this.mesh?.material) {
      this.mesh.material.color.setHex(color);
      this.highlighted = true;
    }
  }

  clearHighlight() {
    if (this.highlighted && this.mesh?.material) {
      this.mesh.material.color.setHex(this.color);
      this.highlighted = false;
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
    if (this.laneChange?.retainSpeed) {
      return 0;
    }

    // Free-road term pulls the car toward its max speed when traffic is clear.
    const freeRoadTerm = Math.pow(this.speed / Math.max(this.maxSpeed, 1e-3), 4);

    // Desired spacing blends the driver's constant distance preference and a speed-proportional
    // term (safeTimeHeadway) so faster motion increases the buffer in front.
    let desiredGap = Math.max(this.minGap, this.distanceGap + this.speed * this.safeTimeHeadway);
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

    // During lane change with retainSpeed, keep the original speed constant
    if (this.laneChange?.retainSpeed && this.laneChange.desiredSpeed !== null) {
      this.speed = this.laneChange.desiredSpeed;
    } else {
      this.speed = THREE.MathUtils.clamp(this.speed + this.acceleration * deltaTime, 0, this.maxSpeed);
    }

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

    let point = this.path.getPointAt(u);
    let tangent = this.path.getTangentAt(u);
    if (this.laneChange) {
      const { curve, progress } = this.laneChange;
      point = this.evaluateBezier(curve, progress);
      tangent = this.evaluateBezierDerivative(curve, progress).normalize();
    }

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

  adjustSpeed(delta) {
    this.setSpeed(this.speed + delta);
  }

  startLaneChange(fromLane, fromProgress, targetLane, targetProgress, targetDistance, duration = 0.8, retainSpeed = false) {
    if (this.state === 'MERGING') return;
    const startPoint = fromLane.getPointAt(fromProgress);
    const endPoint = targetLane.getPointAt(targetProgress);
    const startDir = fromLane.getTangentAt(fromProgress).normalize();
    const endDir = targetLane.getTangentAt(targetProgress).normalize();
    const span = endPoint.distanceTo(startPoint);
    const forward = Math.max(5, span * 0.5);
    const control1 = startPoint.clone().addScaledVector(startDir, forward);
    const control2 = endPoint.clone().addScaledVector(endDir, -forward * 0.5);
    this.laneChange = {
      duration,
      elapsed: 0,
      progress: 0,
      startPosition: this.position,
      targetDistance: Math.max(1, targetDistance),
      curve: { startPoint, control1, control2, endPoint },
      retainSpeed,
      desiredSpeed: retainSpeed ? this.speed : null
    };
    this.state = 'MERGING';
  }

  updateLaneChange(deltaTime) {
    if (!this.laneChange) return;
    const state = this.laneChange;
    const laneLength = this.path?.getLength() ?? 0;
    if (laneLength > 0) {
      const travelled = THREE.MathUtils.euclideanModulo(this.position - state.startPosition, laneLength);
      state.progress = Math.min(1, travelled / state.targetDistance);
    } else {
      state.elapsed += deltaTime;
      state.progress = Math.min(1, state.elapsed / state.duration);
    }

    if (state.progress >= 1) {
      // Set the merging speed as the new baseline speed
      if (state.retainSpeed && state.desiredSpeed !== null) {
        this.speed = state.desiredSpeed;
      }
      this.laneChange = null;
      this.state = 'DRIVING';
    }
  }

  evaluateBezier({ startPoint, control1, control2, endPoint }, t) {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    const point = new THREE.Vector3();
    point.addScaledVector(startPoint, uuu);
    point.addScaledVector(control1, 3 * uu * t);
    point.addScaledVector(control2, 3 * u * tt);
    point.addScaledVector(endPoint, ttt);
    return point;
  }

  evaluateBezierDerivative({ startPoint, control1, control2, endPoint }, t) {
    const u = 1 - t;
    const derivative = new THREE.Vector3();
    derivative
      .addScaledVector(startPoint, -3 * u * u)
      .addScaledVector(control1, 3 * u * u - 6 * u * t)
      .addScaledVector(control2, 6 * u * t - 3 * t * t)
      .addScaledVector(endPoint, 3 * t * t);
    return derivative;
  }

  getRandomLaneChangeInterval() {
    // Random interval between 3-8 seconds
    return 3 + Math.random() * 5;
  }

  updateAutonomousLaneChange(deltaTime) {
    if (this.state === 'MERGING' || !this.road) return;

    this.laneChangeTimer += deltaTime;

    // Check if it's time to consider a lane change
    if (this.laneChangeTimer >= this.nextLaneChangeTime) {
      this.attemptAutonomousLaneChange();
      this.laneChangeTimer = 0;
      this.nextLaneChangeTime = this.getRandomLaneChangeInterval();
    }
  }

  attemptAutonomousLaneChange() {
    if (!this.road || this.state === 'MERGING') return;

    const laneCount = this.road.getLaneCount();
    if (laneCount <= 1) return;

    // Randomly choose direction: -1 (left) or 1 (right)
    const direction = Math.random() < 0.5 ? -1 : 1;
    const targetIndex = this.laneIndex + direction;

    // Check if target lane exists
    if (targetIndex < 0 || targetIndex >= laneCount) return;

    const currentLane = this.getLane();
    const targetLane = this.road.getLane(targetIndex);
    const progress = currentLane ? (this.position / currentLane.getLength()) : 0;
    const targetPosition = progress * targetLane.getLength();
    const neighbors = targetLane.findNeighbors(targetPosition);

    // Check if lane change is safe
    const safety = this.isLaneChangeSafe(neighbors);
    if (safety.allowed) {
      this.performAutonomousLaneChange(currentLane, targetLane, targetIndex, targetPosition, progress, safety.maintainSpeed);
    }
  }

  isLaneChangeSafe(neighbors) {
    const frontRequirement = this.distanceGap + this.safeTimeHeadway * this.speed + this.length;
    const frontClear = !neighbors.front || neighbors.frontDistance > frontRequirement;

    const follower = neighbors.back;
    let followerRequirement = this.length * 0.5;
    if (follower) {
      followerRequirement += follower.distanceGap + follower.safeTimeHeadway * follower.speed + follower.length;
    }
    const backClear = !follower || neighbors.backDistance > followerRequirement;

    const maintainSpeed = frontClear && backClear &&
      (!neighbors.front || neighbors.front.speed >= this.speed - 0.5);

    return {
      allowed: frontClear && backClear,
      maintainSpeed
    };
  }

  performAutonomousLaneChange(currentLane, targetLane, targetIndex, targetPosition, progress, retainSpeed) {
    if (currentLane) {
      const fromLane = currentLane;
      const fromLength = fromLane.getLength();
      const fromProgress = fromLength > 0 ? this.position / fromLength : 0;
      const targetLength = targetLane.getLength();
      const duration = 1.0;
      const predictedDistance = Math.max(5, this.speed * duration + 0.5 * this.maxAcceleration * duration * duration);
      const targetDistance = Math.min(predictedDistance, targetLength > 0 ? targetLength * 0.5 : predictedDistance);
      let endPosition = targetPosition;
      if (targetLength > 0) {
        if (targetLane.closed) {
          endPosition = THREE.MathUtils.euclideanModulo(targetPosition + targetDistance, targetLength);
        } else {
          endPosition = Math.min(targetPosition + targetDistance, targetLength);
          if (endPosition >= targetLength) {
            return;
          }
        }
      }
      currentLane.removeCar(this);
      targetLane.addCar(this, targetPosition);
      this.setLaneIndex(targetIndex);
      this.updatePose(targetLane.getLength());
      this.startLaneChange(fromLane, fromProgress, targetLane, endPosition / targetLength, targetDistance, duration, retainSpeed);
      return;
    }
    targetLane.addCar(this, targetPosition);
    this.setLaneIndex(targetIndex);
    this.updatePose(targetLane.getLength());
  }


  setRoad(road) {
    this.road = road;
    if (road && typeof this.laneIndex === 'number') {
      const lane = road.getLane(this.laneIndex);
      if (lane) {
        this.path = lane;
        this.setPathLength(lane.getLength());
      }
    }
  }

  getRoad() {
    return this.road;
  }

  setLaneIndex(index) {
    this.laneIndex = index;
    if (this.road) {
      const lane = this.road.getLane(index);
      if (lane) {
        this.path = lane;
        this.setPathLength(lane.getLength());
      }
    }
  }

  getLane() {
    return this.path;
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

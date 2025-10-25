import * as THREE from 'three';

// Internal node for the circular doubly-linked list that keeps cars ordered
// by their arc-length position on the lane.
class CarNode {
  constructor(car) {
    this.car = car;
    this.prev = null;
    this.next = null;
  }
}

// Internal node tracking an individual geometric segment (line or curve).
class ShapeNode {
  constructor(segment) {
    this.segment = segment;
    this.length = segment.getLength();
    this.prev = null;
    this.next = null;
    this.startLength = 0; // Cumulative start distance along the lane.
  }
}

// A Lane manages both the geometric path (built from line/curve segments) and
// the ordered list of cars driving along it using the IDM model.
export class Lane {
  constructor({ shapes = [], samplesPerSegment = 24, color = 0x000000 } = {}) {
    this.samplesPerSegment = samplesPerSegment;
    this.lineColor = color;

    // Car bookkeeping
    this.carNodes = [];
    this.carHead = null;

    // Shape bookkeeping
    this.shapeNodes = [];
    this.shapeHead = null;
    this.totalLength = 0; // meters

    this.mesh = null;
    this.setShapes(shapes);
  }

  setShapes(shapes = []) {
    this.disposeMesh();
    this.shapeNodes = shapes.map(shape => new ShapeNode(shape));

    if (this.shapeNodes.length === 0) {
      this.totalLength = 0;
      this.shapeHead = null;
      return;
    }

    const len = this.shapeNodes.length;
    let cumulative = 0;
    for (let i = 0; i < len; i++) {
      const node = this.shapeNodes[i];
      node.prev = this.shapeNodes[(i - 1 + len) % len];
      node.next = this.shapeNodes[(i + 1) % len];
      node.startLength = cumulative;
      cumulative += node.length;
    }

    this.totalLength = cumulative;
    this.shapeHead = this.shapeNodes[0];
    this.buildMesh();
  }

  getLength() {
    return this.totalLength;
  }

  getMesh() {
    return this.mesh;
  }

  disposeMesh() {
    if (this.mesh) {
      this.mesh.traverse(child => {
        if (child.isLine && child.geometry && child.material) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
  }

  buildMesh() {
    if (!this.shapeNodes.length) {
      return;
    }

    const group = new THREE.Group();
    this.shapeNodes.forEach(node => {
      const points = node.segment.getSpacedPoints(this.samplesPerSegment);
      if (points.length < 2) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: this.lineColor });
      group.add(new THREE.Line(geometry, material));
    });

    this.mesh = group;
  }

  getSpacedPoints(divisionsPerSegment = 24) {
    if (!this.shapeNodes.length) {
      return [];
    }

    const points = [];
    this.shapeNodes.forEach((node, index) => {
      const segmentPoints = node.segment.getSpacedPoints(divisionsPerSegment);
      if (index > 0) {
        segmentPoints.shift(); // Avoid duplicating shared endpoints.
      }
      points.push(...segmentPoints);
    });

    return points;
  }

  mapDistanceToShapeNode(distance) {
    if (!this.shapeNodes.length || this.totalLength === 0) {
      return null;
    }

    const target = THREE.MathUtils.euclideanModulo(distance, this.totalLength);
    for (const node of this.shapeNodes) {
      const end = node.startLength + node.length;
      if (target <= end || node === this.shapeNodes[this.shapeNodes.length - 1]) {
        const localDistance = target - node.startLength;
        const localT = node.length > 0 ? THREE.MathUtils.clamp(localDistance / node.length, 0, 1) : 0;
        return { node, localT };
      }
    }
    return null;
  }

  getPointAt(t) {
    if (!this.shapeNodes.length) {
      return new THREE.Vector3();
    }
    const distance = THREE.MathUtils.euclideanModulo(t, 1) * this.totalLength;
    const mapping = this.mapDistanceToShapeNode(distance);
    return mapping ? mapping.node.segment.getPointAt(mapping.localT) : new THREE.Vector3();
  }

  getTangentAt(t) {
    if (!this.shapeNodes.length) {
      return new THREE.Vector3(1, 0, 0);
    }
    const distance = THREE.MathUtils.euclideanModulo(t, 1) * this.totalLength;
    const mapping = this.mapDistanceToShapeNode(distance);
    return mapping ? mapping.node.segment.getTangentAt(mapping.localT) : new THREE.Vector3(1, 0, 0);
  }

  addCar(car, initialPosition = 0) {
    if (!this.totalLength) return null;

    const node = new CarNode(car);
    this.carNodes.push(node);

    car.setPathLength(this.totalLength);
    car.position = THREE.MathUtils.euclideanModulo(initialPosition, this.totalLength);
    car.updatePose(this.totalLength);

    this.sortCars();
    return node;
  }

  removeCar(car) {
    const index = this.carNodes.findIndex(node => node.car === car);
    if (index === -1) return;
    this.carNodes.splice(index, 1);
    this.sortCars();
  }

  update(deltaTime) {
    if (this.carNodes.length === 0 || this.totalLength === 0) {
      return;
    }

    // Keep cached length in sync in case shapes changed dynamically.
    this.totalLength = 0;
    for (const node of this.shapeNodes) {
      node.length = node.segment.getLength();
      node.startLength = this.totalLength;
      this.totalLength += node.length;
    }

    for (const carNode of this.carNodes) {
      carNode.car.setPathLength(this.totalLength);
    }

    this.sortCars();
    const nodeCount = this.carNodes.length;
    const accelerations = new Array(nodeCount);

    for (let i = 0; i < nodeCount; i++) {
      const node = this.carNodes[i];
      const car = node.car;

      if (nodeCount === 1) {
        accelerations[i] = car.computeAcceleration(Infinity, 0);
        continue;
      }

      const leader = node.next.car;
      let gap = leader.position - car.position;
      if (gap <= 0) {
        gap += this.totalLength;
      }
      gap = Math.max(0, gap - car.halfLength - leader.halfLength);

      const deltaSpeed = car.speed - leader.speed;
      accelerations[i] = car.computeAcceleration(gap, deltaSpeed);
    }

    for (let i = 0; i < nodeCount; i++) {
      const node = this.carNodes[i];
      node.car.integrate(accelerations[i], deltaTime, this.totalLength);
    }
  }

  sortCars() {
    if (this.carNodes.length === 0) {
      this.carHead = null;
      return;
    }

    this.carNodes.sort((a, b) => a.car.position - b.car.position);

    const len = this.carNodes.length;
    for (let i = 0; i < len; i++) {
      const node = this.carNodes[i];
      node.next = this.carNodes[(i + 1) % len];
      node.prev = this.carNodes[(i - 1 + len) % len];
    }

    this.carHead = this.carNodes[0];
  }
}

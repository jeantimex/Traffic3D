class Node {
  constructor(value) {
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedList {
  constructor() {
    this.length = 0;
    this.head = null;
    this.tail = null;
  }

  get(index) {
    if (!this.length || index < 0 || index >= this.length) {
      return null;
    } else {
      let currentNode;

      if (index < this.length / 2) {
        let counter = 0;
        currentNode = this.head;

        while (counter < index) {
          currentNode = currentNode.next;
          counter += 1;
        }
      } else {
        let counter = this.length - 1;

        currentNode = this.tail;

        while (counter > index) {
          currentNode = currentNode.prev;
          counter -= 1;
        }
      }

      return currentNode;
    }
  }

  set(index, value) {
    const currentNode = this.get(index);

    if (currentNode) {
      currentNode.value = value;
      return currentNode;
    } else {
      return null;
    }
  }

  push(value) {
    const newNode = new Node(value);
    if (!this.length) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail.next = newNode;
      newNode.prev = this.tail;
      this.tail = newNode;
    }

    this.length += 1;

    return newNode;
  }

  pop() {
    if (!this.length) {
      return null;
    } else {
      const nodeToRemove = this.tail;

      if (this.length === 1) {
        this.head = null;
        this.tail = null;
      } else {
        this.tail = this.tail.prev;
        this.tail.next = null;
        nodeToRemove.prev = null;
      }

      this.length -= 1;

      return nodeToRemove;
    }
  }

  unshift(value) {
    const newNode = new Node(value);

    if (!this.length) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.next = this.head;
      this.head.prev = newNode;
      this.head = newNode;
    }

    this.length += 1;

    return newNode;
  }

  shift() {
    if (!this.length) {
      return null;
    }

    const nodeToRemove = this.head;

    if (this.length === 1) {
      this.head = null;
      this.tail = null;
    } else {
      this.head = nodeToRemove.next;
      this.head.prev = null;
      nodeToRemove.next = null;
    }

    this.length -= 1;

    return nodeToRemove;
  }

  insert(index, value) {
    if (index < 0 || index > this.length) {
      return null;
    } else if (index === 0) {
      return this.unshift(value);
    } else if (index === this.length) {
      return this.push(value);
    } else {
      const newNode = new Node(value);

      const newPrevNode = this.get(index - 1);
      const newNextNode = newPrevNode.next;

      newNode.prev = newPrevNode;
      newPrevNode.next = newNode;

      newNode.next = newNextNode;
      newNextNode.prev = newNode;

      this.length += 1;

      return newNode;
    }
  }

  remove(index) {
    if (!this.length || index < 0 || index >= this.length) {
      return null;
    } else if (index === 0) {
      return this.shift();
    } else if (index === this.length - 1) {
      return this.pop();
    } else {
      const nodeToRemove = this.get(index);
      const prevNodeToRemove = nodeToRemove.prev;
      const nextNodeToRemove = nodeToRemove.next;

      nodeToRemove.prev = null;
      nodeToRemove.next = null;

      prevNodeToRemove.next = nextNodeToRemove;
      nextNodeToRemove.prev = prevNodeToRemove;

      this.length -= 1;

      return nodeToRemove;
    }
  }
}

class Car {
  constructor(options) {
    this.width = options.width; // meters
    this.height = options.height; // meters

    this.speed_ = 0;
    this.maxSpeed = 5; // meters per second
    this.maxAcceleration = 1; // meters/second^2
    this.comfortableDeceleration = 1.67; // meters/second^2
    this.distanceGap = 2; // Minimum distance, unit: meters
    this.safeTimeHeadway = 3; // seconds

    this.x = options.x;
    this.y = options.y;
  }

  get speed() {
    return this.speed_;
  }

  set speed(value) {
    this.speed_ = Math.max(0, Math.min(value, this.maxSpeed));
  }

  getAcceleration(distance, distanceToStopLine, deltaSpeed) {
    if (distance <= 0 || distanceToStopLine <= 0) {
      return 0;
    }

    const a = this.maxAcceleration;
    const b = this.comfortableDeceleration;

    const accelerationExponent = 4;
    const freeRoadCoeff = (this.speed / this.maxSpeed) ** accelerationExponent;

    const timeGap = this.speed * this.safeTimeHeadway;
    const breakGap = this.speed * deltaSpeed / (2 * Math.sqrt(a * b));
    const safeDistance = this.distanceGap + timeGap + breakGap;
    const busyRoadCoeff = (safeDistance / distance) ** 2;
    const safeIntersectionDistance = 1 + timeGap + this.speed ** 2 / (2 * b);
    const intersectionCoeff =
      (safeIntersectionDistance / distanceToStopLine) ** 2;
    const coeff = 1 - freeRoadCoeff - busyRoadCoeff - intersectionCoeff;
    return this.maxAcceleration * coeff;
  }

  move(delta) {
    const node = nodes.get(this);
    const previousCar = node.prev ? node.prev.value : null;

    const distanceToStopLine = Math.max(0, (goal - this.x) / pixelsPerMeter) - this.width / 2;
    let distannceToFrontCar = Infinity;
    let deltaSpeed = 0;
    if (previousCar) {
      distannceToFrontCar = Math.max(0, (previousCar.x - this.x) / pixelsPerMeter) - this.width / 2 - previousCar.width / 2;
      deltaSpeed = this.speed - previousCar.speed;
    }

    const acceleration = this.getAcceleration(distannceToFrontCar, distanceToStopLine, deltaSpeed);

    this.speed += acceleration * delta;
    let step = Math.max(0, this.speed * delta + 0.5 * acceleration * delta ** 2);
    step = Math.min(step, distannceToFrontCar, distanceToStopLine) * pixelsPerMeter;

    this.x += step;
    this.y += 0;
  }

  render() {
    ctx.beginPath();
    const width = this.width * pixelsPerMeter;
    const height = this.height * pixelsPerMeter;
    ctx.rect(this.x - width / 2, this.y - height / 2, width, height);
    ctx.stroke();
  }
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cars = new DoublyLinkedList();
const nodes = new Map();
const pixelsPerMeter = 5;
const goal = 500;
const totalCars = 5;

let previousTime = 0;

function init() {
  for (let i = 0; i < totalCars; i++) {
    const car = new Car({width: 5, height: 2, x: 0, y: 50});
    const node = cars.push(car);
    nodes.set(car, node);
  }
}

function resizeAsNeeded() {
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function mainLoop(currentTime) {
  const delta = (currentTime - previousTime) || 0;
  previousTime = currentTime;
  resizeAsNeeded();
  clearCanvas();

  ctx.beginPath();
  ctx.moveTo(goal, 0);
  ctx.lineTo(goal, 150);
  ctx.stroke();

  let node = cars.head;
  while (node) {
    const car = node.value;
    car.move(delta / 100);
    car.render();
    node = node.next;
  }

  requestAnimationFrame(mainLoop);
}

init();
mainLoop();

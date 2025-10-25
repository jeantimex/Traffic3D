import './style.css';
import * as THREE from 'three';
import { Scene } from './js/Scene.js';
import { Car } from './js/Car.js';
import { Lane } from './js/Lane.js';
import { Road } from './js/Road.js';
import { GUI } from 'dat.gui';
import { LineSegment } from './js/shapes/LineSegment.js';
import Stats from 'stats.js';

// Orchestrates the traffic simulation: builds the lane, instantiates cars,
// wires up the IDM lane manager, and exposes runtime tweaking via dat.GUI.
class TrafficSimulation {
  constructor() {
    this.scene = new Scene();
    this.clock = new THREE.Clock();
    this.gui = new GUI({ width: 280 });
    this.guiFolders = [];
    this.stats = new Stats();
    this.stats.showPanel(0);
    document.body.appendChild(this.stats.dom);
    this.highlightedCars = new Set();
    this.controlledCar = null;

    this.setupScene();
    this.bindControls();
    this.animate();
  }

  setupScene() {
    const laneLength = 200;
    const laneWidth = 4;
    const laneColors = [0xff0000, 0x00ff00, 0x0000ff];

    const laneConfigs = [0, 1, 2].map(index => ({
      start: new THREE.Vector3(0, 12, index * laneWidth),
      end: new THREE.Vector3(laneLength, 12, index * laneWidth),
      color: laneColors[index]
    }));

    const lanes = laneConfigs.map(config => {
      const shapes = createStraightLaneShapes(config);
      return new Lane({ shapes, color: config.color });
    });

    this.road = new Road(lanes);
    lanes.forEach(lane => this.scene.add(lane.getMesh()));
    this.primaryLane = lanes[0];
    this.cars = [];

    // Initial car presets. Speeds/headways can be overridden via the GUI.
    const baseCarConfig = {
      maxSpeed: 14,
      initialSpeed: 7,
      safeTimeHeadway: 0.5,
      minGap: 1.5,
      distanceGap: 1.5
    };

    const laneCount = this.road.getLaneCount();
    const randomFloat = (min, max) => min + Math.random() * (max - min);

    this.road.lanes.forEach((lane, index) => {
      const carsInLane = index === 0 ? 1 : 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < carsInLane; i++) {
        const speedScale = randomFloat(0.5, 1.2);
        const accelScale = randomFloat(0.8, 1.2);
        const comfortScale = randomFloat(0.8, 1.2);
        const laneFactor = index === 0 ? 1 : 1.5;
        const headway = baseCarConfig.safeTimeHeadway * randomFloat(0.6, 1.4) * laneFactor;
        const minGap = baseCarConfig.minGap * randomFloat(0.8, 1.5) * laneFactor;
        const distGap = baseCarConfig.distanceGap * randomFloat(0.7, 1.5) * laneFactor;
        const car = new Car({
          road: this.road,
          laneIndex: index,
          color: laneColors[index % laneColors.length],
          maxSpeed: baseCarConfig.maxSpeed * speedScale,
          initialSpeed: baseCarConfig.initialSpeed * speedScale,
          maxAcceleration: 2 * accelScale,
          comfortableDeceleration: 2.5 * comfortScale,
          safeTimeHeadway: headway,
          minGap,
          distanceGap: distGap
        });

        const spacing = 25;
        const offset = randomFloat(0, spacing * laneCount);
        const initialPosition = (i * spacing + offset) % laneLength;
        lane.addCar(car, initialPosition);
        this.cars.push(car);
        this.scene.add(car.getMesh());

        if (index === 0 && i === 0) {
          this.controlledCar = car;
        }
      }
    });

    this.setupGUI();
  }

  setupGUI() {
    if (!this.gui) {
      return;
    }

    // Remove previous folders if setupScene is called again
    this.guiFolders.forEach(folder => this.gui.removeFolder?.(folder));
    this.guiFolders = [];

    this.cars.forEach((car, index) => {
      const folder = this.gui.addFolder(`Car ${index + 1}`);

      const params = {
        color: `#${car.color.toString(16).padStart(6, '0')}`,
        length: car.length,
        width: car.width,
        height: car.height,
        maxSpeed: car.maxSpeed,
        maxAcceleration: car.maxAcceleration,
        comfortableDeceleration: car.comfortableDeceleration,
        safeTimeHeadway: car.safeTimeHeadway,
        distanceGap: car.distanceGap,
        minGap: car.minGap
      };

      folder.addColor(params, 'color')
        .name('Color')
        .onChange(value => {
          const hex = typeof value === 'string' ? parseInt(value.replace('#', ''), 16) : value;
          car.setColor(hex);
        });

      folder.add(params, 'length', 2, 10, 0.1)
        .name('Length')
        .onChange(value => {
          car.setDimensions({ length: value });
        });

      folder.add(params, 'width', 1, 5, 0.1)
        .name('Width')
        .onChange(value => {
          car.setDimensions({ width: value });
        });

      folder.add(params, 'height', 0.5, 4, 0.1)
        .name('Height')
        .onChange(value => {
          car.setDimensions({ height: value });
        });

      folder.add(params, 'maxSpeed', 5, 100, 0.1)
        .name('Max speed')
        .onChange(value => {
          car.setMaxSpeed(value);
          car.setSpeed(car.speed);
        });

      folder.add(params, 'maxAcceleration', 1, 8, 0.1)
        .name('Max accel')
        .onChange(value => car.setMaxAcceleration(value));

      folder.add(params, 'comfortableDeceleration', 0.5, 8, 0.1)
        .name('Comfort decel')
        .onChange(value => car.setComfortableDeceleration(value));

      folder.add(params, 'safeTimeHeadway', 0, 3, 0.05)
        .name('Safe headway')
        .onChange(value => car.setSafeTimeHeadway(value));

      folder.add(params, 'distanceGap', 0, 10, 0.1)
        .name('Distance gap')
        .onChange(value => car.setDistanceGap(value));

      folder.add(params, 'minGap', 0, 5, 0.1)
        .name('Min gap')
        .onChange(value => {
          car.minGap = Math.max(0, value);
        });

      folder.open();
      this.guiFolders.push(folder);
    });
  }

  bindControls() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  handleKeyDown(event) {
    if (!this.controlledCar) return;
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      this.requestLaneChange(-1);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      this.requestLaneChange(1);
    } else if (event.code === 'ArrowUp') {
      event.preventDefault();
      this.adjustControlledCarSpeed(1);
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      this.adjustControlledCarSpeed(-1);
    }
  }

  requestLaneChange(direction) {
    const car = this.controlledCar;
    if (!car) return;

    this.clearHighlights();

    const targetIndex = car.laneIndex + direction;
    if (targetIndex < 0 || targetIndex >= this.road.getLaneCount()) {
      return;
    }

    const currentLane = car.getLane();
    const targetLane = this.road.getLane(targetIndex);
    const progress = currentLane ? (car.position / currentLane.getLength()) : 0;
    const targetPosition = progress * targetLane.getLength();
    const neighbors = targetLane.findNeighbors(targetPosition);

    this.highlightNeighbors(neighbors);

    if (this.isLaneChangeSafe(car, neighbors)) {
      this.performLaneChange(car, currentLane, targetLane, targetIndex, targetPosition);
    }
  }

  highlightNeighbors({ front, back }) {
    if (front) {
      front.highlight(0x00ffff);
      this.highlightedCars.add(front);
    }
    if (back) {
      back.highlight(0xff00ff);
      this.highlightedCars.add(back);
    }
  }

  clearHighlights() {
    this.highlightedCars.forEach(car => car.clearHighlight());
    this.highlightedCars.clear();
  }

  isLaneChangeSafe(car, neighbors) {
    const frontRequirement = car.distanceGap + car.safeTimeHeadway * car.speed + car.length;
    const frontClear = !neighbors.front || neighbors.frontDistance > frontRequirement;

    const follower = neighbors.back;
    let followerRequirement = car.length * 0.5;
    if (follower) {
      followerRequirement += follower.distanceGap + follower.safeTimeHeadway * follower.speed + follower.length;
    }
    const backClear = !follower || neighbors.backDistance > followerRequirement;

    return frontClear && backClear;
  }

  adjustControlledCarSpeed(direction) {
    if (!this.controlledCar) return;
    const speedDelta = direction > 0 ? 1 : -1;
    const maxDelta = direction > 0 ? 0.5 : -0.5;
    const targetMax = Math.max(2, this.controlledCar.maxSpeed + maxDelta);
    this.controlledCar.setMaxSpeed(targetMax);
    this.controlledCar.adjustSpeed(speedDelta);
  }

  performLaneChange(car, currentLane, targetLane, targetIndex, targetPosition) {
    if (currentLane) {
      currentLane.removeCar(car);
    }
    targetLane.addCar(car, targetPosition);
    car.setLaneIndex(targetIndex);
    car.updatePose(targetLane.getLength());
  }

  animate() {
    this.stats.begin();
    requestAnimationFrame(() => this.animate());
    const deltaTime = this.clock.getDelta();

    const laneCount = this.road.getLaneCount();
    for (let i = 0; i < laneCount; i++) {
      this.road.getLane(i)?.update(deltaTime);
    }

    this.scene.update();
    this.scene.render();
    this.stats.end();
  }
}

new TrafficSimulation();

function createStraightLaneShapes({
  start = new THREE.Vector3(0, 0, 0),
  end = new THREE.Vector3(100, 0, 0)
} = {}) {
  return [new LineSegment(start, end)];
}

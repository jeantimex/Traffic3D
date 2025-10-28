import './style.css';
import * as THREE from 'three';
import { Scene } from './js/Scene.js';
import { Car } from './js/Car.js';
import { Lane } from './js/Lane.js';
import { Road } from './js/Road.js';
import { GUI } from 'dat.gui';
import { LineSegment } from './js/shapes/LineSegment.js';

// Orchestrates the traffic simulation: builds the lane, instantiates cars,
// wires up the IDM lane manager, and exposes runtime tweaking via dat.GUI.
class TrafficSimulation {
  constructor() {
    this.scene = new Scene();
    this.clock = new THREE.Clock();
    this.gui = new GUI({ width: 280 });
    this.guiFolders = [];

    this.setupScene();
    this.animate();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  setupScene() {
    const laneLength = 100;
    const halfLength = laneLength / 2;
    const laneWidth = 4;
    const laneColors = [0x000000, 0x333333, 0x666666];
    const baseHeight = 12;

    const lanes = [0, 1, 2].map(index => {
      const lateralOffset = (index - 1) * laneWidth;
      const shapes = createRunningTrackShapes({
        start: new THREE.Vector3(-halfLength, baseHeight, lateralOffset),
        end: new THREE.Vector3(halfLength, baseHeight, lateralOffset)
      });
      return new Lane({ shapes, color: laneColors[index] });
    });

    this.road = new Road(lanes);
    lanes.forEach(lane => this.scene.add(lane.getMesh()));
    this.primaryLane = lanes[0];
    this.cars = [];

    // Initial car presets. Speeds/headways can be overridden via the GUI.
    const carConfigs = [
      { color: 0xff0000, maxSpeed: 10, initialSpeed: 5, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 1 },
      { color: 0x00ff00, maxSpeed: 18, initialSpeed: 12, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 2.5 },
      { color: 0x0000ff, maxSpeed: 25, initialSpeed: 15, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 2.5 }
    ];

    carConfigs.forEach((config, index) => {
      const { color, maxSpeed, initialSpeed, safeTimeHeadway, minGap, distanceGap } = config;
      const car = new Car({
        road: this.road,
        laneIndex: index,
        color,
        maxSpeed,
        initialSpeed,
        safeTimeHeadway,
        minGap,
        distanceGap
      });

      const lane = this.road.getLane(index);
      const lanePosition = lane?.addCar(car, 0);
      if (lanePosition) {
        car.attachToLanePosition(lanePosition);
      }
      this.cars.push(car);
      this.scene.add(car.getMesh());
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

  handleKeyDown(event) {
    const primaryCar = this.cars[0];
    if (!primaryCar) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (primaryCar.requestLaneChange(-1)) {
        event.preventDefault();
      }
    } else if (event.key === 'ArrowRight') {
      if (primaryCar.requestLaneChange(1)) {
        event.preventDefault();
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    const laneCount = this.road.getLaneCount();
    for (let i = 0; i < laneCount; i++) {
      this.road.getLane(i)?.update(deltaTime);
    }

    this.scene.update();
    this.scene.render();
  }
}

new TrafficSimulation();

function createRunningTrackShapes({
  start = new THREE.Vector3(-50, 12, 0),
  end = new THREE.Vector3(50, 12, 0)
} = {}) {
  return [
    new LineSegment(start, end)
  ];
}

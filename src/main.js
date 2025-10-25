import './style.css';
import * as THREE from 'three';
import { Scene } from './js/Scene.js';
import { Car } from './js/Car.js';
import { Lane } from './js/Lane.js';
import { Road } from './js/Road.js';
import { GUI } from 'dat.gui';
import { LineSegment } from './js/shapes/LineSegment.js';
import { ArcSegment } from './js/shapes/ArcSegment.js';

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
  }

  setupScene() {
    const baseStraight = 100;
    const baseHalfStraight = baseStraight / 2;
    const baseRadius = (400 - 2 * baseStraight) / (2 * Math.PI);
    const laneWidth = 4;
    const laneColors = [0x000000, 0x333333, 0x666666];

    const laneConfigs = [0, 1, 2].map(index => ({
      halfStraight: baseHalfStraight + index * laneWidth,
      radius: baseRadius + index * laneWidth,
      baseHeight: 12,
      color: laneColors[index]
    }));

    const lanes = laneConfigs.map(config => {
      const shapes = createRunningTrackShapes(config);
      return new Lane({ shapes, color: config.color });
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

    const primaryLane = this.road.getLane(0);
    const laneLength = primaryLane.getLength();
    const initialSpacing = 8;

    carConfigs.forEach(({ color, maxSpeed, initialSpeed, safeTimeHeadway, minGap, distanceGap }, index) => {
      const car = new Car({
        road: this.road,
        laneIndex: 0,
        color,
        maxSpeed,
        initialSpeed,
        safeTimeHeadway,
        minGap,
        distanceGap
      });

      const initialPosition = (initialSpacing * index) % laneLength;
      primaryLane.addCar(car, initialPosition);
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
  halfStraight = 50,
  radius = 32,
  baseHeight = 12
} = {}) {
  const y = baseHeight;
  const topLeft = new THREE.Vector3(-halfStraight, y, radius);
  const topRight = new THREE.Vector3(halfStraight, y, radius);
  const bottomRight = new THREE.Vector3(halfStraight, y, -radius);
  const bottomLeft = new THREE.Vector3(-halfStraight, y, -radius);

  return [
    new LineSegment(topLeft, topRight),
    new ArcSegment({
      start: topRight,
      end: bottomRight,
      center: new THREE.Vector3(halfStraight, y, 0),
      clockwise: true
    }),
    new LineSegment(bottomRight, bottomLeft),
    new ArcSegment({
      start: bottomLeft,
      end: topLeft,
      center: new THREE.Vector3(-halfStraight, y, 0),
      clockwise: true
    })
  ];
}

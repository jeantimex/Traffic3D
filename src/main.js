import './style.css';
import * as THREE from 'three';
import { Scene } from './js/Scene.js';
import { Curve } from './js/Curve.js';
import { Car } from './js/Car.js';
import { Lane } from './js/Lane.js';
import { GUI } from 'dat.gui';

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
    this.curve = new Curve();
    this.scene.add(this.curve.getMesh());

    this.lane = new Lane(this.curve);
    this.cars = [];

    const carConfigs = [
      { color: 0xff0000, maxSpeed: 10, initialSpeed: 5, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 1 },
      { color: 0x00ff00, maxSpeed: 18, initialSpeed: 12, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 2.5 },
      { color: 0x0000ff, maxSpeed: 25, initialSpeed: 15, safeTimeHeadway: 0.3, minGap: 1.0, distanceGap: 2.5 }
    ];

    const laneLength = this.lane.getLength();
    const initialSpacing = 8;

    carConfigs.forEach(({ color, maxSpeed, initialSpeed, safeTimeHeadway, minGap, distanceGap }, index) => {
      const car = new Car(this.curve, {
        color,
        maxSpeed,
        initialSpeed,
        safeTimeHeadway,
        minGap,
        distanceGap
      });

      const initialPosition = (initialSpacing * index) % laneLength;
      this.lane.addCar(car, initialPosition);
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
        distanceGap: car.distanceGap
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

      folder.add(params, 'maxSpeed', 5, 30, 0.1)
        .name('Max speed')
        .onChange(value => {
          car.setMaxSpeed(value);
          car.setSpeed(car.speed);
        });

      folder.add(params, 'maxAcceleration', 1, 8, 0.1)
        .name('Max accel')
        .onChange(value => car.setMaxAcceleration(value));

      folder.add(params, 'comfortableDeceleration', 0.5, 5, 0.1)
        .name('Comfort decel')
        .onChange(value => car.setComfortableDeceleration(value));

      folder.add(params, 'safeTimeHeadway', 0, 3, 0.05)
        .name('Safe headway')
        .onChange(value => car.setSafeTimeHeadway(value));

      folder.add(params, 'distanceGap', 0.5, 10, 0.1)
        .name('Distance gap')
        .onChange(value => car.setDistanceGap(value));

      folder.open();
      this.guiFolders.push(folder);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    this.lane.update(deltaTime);

    this.scene.update();
    this.scene.render();
  }
}

new TrafficSimulation();

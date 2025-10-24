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
      const params = { maxSpeed: car.maxSpeed };

      folder.add(params, 'maxSpeed', 5, 30, 0.1)
        .name('Max speed')
        .onChange(value => {
          car.setMaxSpeed(value);
          car.setSpeed(car.speed);
        });

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

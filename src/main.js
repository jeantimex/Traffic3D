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
      { color: 0xff0000, desiredSpeed: 10, initialSpeed: 5, timeHeadway: 0.3, minGap: 1.0, constantGap: 2.5 },
      { color: 0x00ff00, desiredSpeed: 5, initialSpeed: 2, timeHeadway: 0.3, minGap: 1.0, constantGap: 2.5 },
      { color: 0x0000ff, desiredSpeed: 20, initialSpeed: 10, timeHeadway: 0.3, minGap: 1.0, constantGap: 2.5 }
    ];

    const laneLength = this.lane.getLength();
    const initialSpacing = 8;

    carConfigs.forEach(({ color, desiredSpeed, initialSpeed, timeHeadway, minGap, constantGap }, index) => {
      const car = new Car(this.curve, {
        color,
        desiredSpeed,
        initialSpeed,
        timeHeadway,
        minGap,
        constantGap
      });

      const initialS = (initialSpacing * index) % laneLength;
      this.lane.addCar(car, initialS);
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
      const params = { desiredSpeed: car.desiredSpeed };

      folder.add(params, 'desiredSpeed', 5, 30, 0.1)
        .name('Desired speed')
        .onChange(value => {
          car.setDesiredSpeed(value);
          if (car.speed > value) {
            car.setSpeed(value);
          }
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

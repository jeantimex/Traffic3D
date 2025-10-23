import './style.css';
import * as THREE from 'three';
import { Scene } from './js/Scene.js';
import { Curve } from './js/Curve.js';
import { Car } from './js/Car.js';

class TrafficSimulation {
  constructor() {
    this.scene = new Scene();
    this.clock = new THREE.Clock();

    this.setupScene();
    this.animate();
  }

  setupScene() {
    this.curve = new Curve();
    this.scene.add(this.curve.getMesh());

    this.cars = [];
    const carConfigs = [
      { color: 0xff0000, speed: 1.0 },
      { color: 0x00ff00, speed: 1.3 },
      { color: 0x0000ff, speed: 0.7 }
    ];

    carConfigs.forEach(({ color, speed }, index) => {
      const car = new Car(this.curve, color, 10);
      car.setSpeed(speed);
      const phaseOffset = (car.action.getClip().duration / carConfigs.length) * index;
      car.action.time = phaseOffset;
      this.cars.push(car);
      this.scene.add(car.getMesh());
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    this.cars.forEach(car => {
      car.update(deltaTime);
    });

    this.scene.update();
    this.scene.render();
  }
}

new TrafficSimulation();

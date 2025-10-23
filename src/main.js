import './style.css';
import { Scene } from './js/Scene.js';

class TrafficSimulation {
  constructor() {
    this.scene = new Scene();
    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.scene.update();
    this.scene.render();
  }
}

new TrafficSimulation();
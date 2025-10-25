// Represents a group of parallel lanes that form a single-direction road.
// Lanes are stored in a doubly linked list where `prev` points to the lane on
// the driver's left-hand side and `next` points to the lane on the right-hand
// side. This structure makes it easy to reason about lane changes in either
// direction.
class RoadLaneNode {
  constructor(lane) {
    this.lane = lane;
    this.prev = null; // Lane to the left of the driving direction
    this.next = null; // Lane to the right of the driving direction
  }
}

export class Road {
  constructor(lanes = []) {
    this.nodes = [];
    this.currentNode = null;
    this.setLanes(lanes);
  }

  setLanes(lanes = []) {
    this.nodes = lanes.map(lane => new RoadLaneNode(lane));

    const len = this.nodes.length;
    for (let i = 0; i < len; i++) {
      const node = this.nodes[i];
      node.prev = i > 0 ? this.nodes[i - 1] : null;
      node.next = i < len - 1 ? this.nodes[i + 1] : null;
    }

    this.currentNode = this.nodes[0] || null;
  }

  addLane(lane, index = this.nodes.length) {
    const node = new RoadLaneNode(lane);
    this.nodes.splice(index, 0, node);
    this.setLanes(this.nodes.map(n => n.lane));
    return node;
  }

  getCurrentLane() {
    return this.currentNode ? this.currentNode.lane : null;
  }

  setCurrentLaneByIndex(index) {
    if (index < 0 || index >= this.nodes.length) return null;
    this.currentNode = this.nodes[index];
    return this.currentNode.lane;
  }

  getLaneNodes() {
    return this.nodes;
  }
}

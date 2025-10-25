// Represents a group of parallel lanes travelling in the same direction. Lanes
// are stored in a simple array where index 0 is the left-most lane, index 1 is
// immediately to the right, and so on. This keeps reasoning about lane changes
// straightforward and avoids extra pointer bookkeeping.
export class Road {
  constructor(lanes = []) {
    this.lanes = [];
    this.currentLaneIndex = 0;
    lanes.forEach(lane => this.addLane(lane));
  }

  reindexLanes() {
    this.lanes.forEach((lane, index) => {
      if (typeof lane.setLaneIndex === 'function') {
        lane.setLaneIndex(index);
      } else {
        lane.laneIndex = index;
      }
    });
    if (this.currentLaneIndex >= this.lanes.length) {
      this.currentLaneIndex = Math.max(0, this.lanes.length - 1);
    }
  }

  addLane(lane, index = this.lanes.length) {
    this.lanes.splice(index, 0, lane);
    this.reindexLanes();
    return lane;
  }

  removeLane(index) {
    if (index < 0 || index >= this.lanes.length) return null;
    const [removed] = this.lanes.splice(index, 1);
    this.reindexLanes();
    return removed;
  }

  getLane(index) {
    return this.lanes[index] || null;
  }

  getLaneCount() {
    return this.lanes.length;
  }

  getCurrentLane() {
    return this.getLane(this.currentLaneIndex);
  }

  setCurrentLaneByIndex(index) {
    if (index < 0 || index >= this.lanes.length) return null;
    this.currentLaneIndex = index;
    return this.getCurrentLane();
  }
}

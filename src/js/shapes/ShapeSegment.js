// Lightweight interface-like base class for lane segments. Concrete
// implementations should override every method to supply geometry data.
export class ShapeSegment {
  getLength() {
    throw new Error('getLength() must be implemented');
  }

  getStart() {
    throw new Error('getStart() must be implemented');
  }

  getEnd() {
    throw new Error('getEnd() must be implemented');
  }

  getPointAt(t) {
    throw new Error('getPointAt() must be implemented');
  }

  getTangentAt(t) {
    throw new Error('getTangentAt() must be implemented');
  }

  getSpacedPoints(divisions = 10) {
    throw new Error('getSpacedPoints() must be implemented');
  }
}

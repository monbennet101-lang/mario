/**
 * Entity — Base Class for Stage 6 & Stage 9 Dynamic Gameplay Entities
 * =====================================================================
 * Deterministic 60 Hz simulation base with interpolated render coordinates
 * and exact AABB helpers.
 */

class Entity {
  constructor(x, y, width, height, type = 'entity') {
    this.pos = { x, y };
    this.prevPos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.width = width;
    this.height = height;
    this.active = true;
    this.type = type;
    this.facingRight = true;
    this.grounded = false;
  }

  get centerX() {
    return this.pos.x + this.width * 0.5;
  }

  get centerY() {
    return this.pos.y + this.height * 0.5;
  }

  syncPrevPos() {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
  }

  getRenderPos(alpha = 1.0) {
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha,
    };
  }

  update(_dt, _collision) {
    // Override in subclasses
  }

  getAABB() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      width: this.width,
      height: this.height,
    };
  }

  overlapsAABB(other) {
    return (
      this.pos.x < other.x + other.width &&
      this.pos.x + this.width > other.x &&
      this.pos.y < other.y + other.height &&
      this.pos.y + this.height > other.y
    );
  }

  destroy() {
    this.active = false;
  }
}

export default Entity;

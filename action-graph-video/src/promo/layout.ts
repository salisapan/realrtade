/**
 * 3D extension of the live site's `.cc-card` circular-carousel arc math
 * (flow-landing/index.html, the "Performance" stats carousel JS). The site
 * version positions cards on a 2D arc (x, y) inside a flat DOM stage; this
 * version swaps the depth axis to z (so the "active" card sits closer to
 * camera) and adds a scale/opacity falloff suited to a real 3D scene.
 */
export type ArcPlacement = {
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
};

export function arcPosition(
  index: number,
  total: number,
  activeIndex: number,
  radiusX: number,
  radiusZ: number,
): ArcPlacement {
  let offset = index - activeIndex;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;

  const angle = (offset / total) * Math.PI;
  const x = Math.sin(angle) * radiusX;
  const z = -Math.cos(angle) * radiusZ;
  const d = Math.abs(offset);
  const scale = Math.max(0.72, 1 - d * 0.16);
  const opacity = Math.max(0.35, 1 - d * 0.5);

  return { x, y: 0, z, scale, opacity };
}

/** Linear blend between two arc placements — used to spring a card from its
 * scattered "chaos" position into its arc slot, and later from its arc slot
 * into the single converged point where the [Do It] button forms. */
export function lerpPlacement(a: ArcPlacement, b: ArcPlacement, t: number): ArcPlacement {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    scale: a.scale + (b.scale - a.scale) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}

/**
 * Manual perspective projection — a virtual camera sits on the +Z axis at
 * `distance`, looking toward the origin. Same technique as the live site's
 * own 2D-canvas Action Graph projection (flow-landing/index.html's proj()).
 *
 * This exists because drei's <Html transform> depends on R3F's useFrame
 * render loop to position its DOM portal every tick — Remotion renders
 * single frozen frames rather than running a continuous loop, so that
 * positioning logic never fires and the portal content never appears.
 * Plain absolutely-positioned DOM driven by this projection is a pure
 * function of useCurrentFrame(), so it's frame-perfect under Remotion.
 */
export type Camera2D = { fov: number; distance: number };

export type Projected = { left: number; top: number; scale: number };

export function project(
  x: number,
  y: number,
  z: number,
  cam: Camera2D,
  screenWidth: number,
  screenHeight: number,
): Projected {
  const focal = 1 / Math.tan((cam.fov * Math.PI) / 360);
  const baseScale = (focal * (screenHeight / 2)) / cam.distance;
  const zRel = Math.max(0.5, cam.distance - z);
  const scale = (focal * (screenHeight / 2)) / zRel / baseScale;
  const px = screenWidth / 2 + x * scale * baseScale;
  const py = screenHeight / 2 - y * scale * baseScale;
  return { left: px, top: py, scale };
}

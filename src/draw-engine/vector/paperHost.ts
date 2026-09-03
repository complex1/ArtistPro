/**
 * Paper.js owns advanced vector path editing (anchors, curvature, boolean ops).
 * Konva stays the stage/selection host; this module is the seam for path work.
 * Do not import Paper into raster brush code.
 */
export type VectorPathHost = {
  editPath: (points: { x: number; y: number }[]) => { x: number; y: number }[]
}

export function createPaperHost(): VectorPathHost {
  return {
    editPath: (points) => points,
  }
}

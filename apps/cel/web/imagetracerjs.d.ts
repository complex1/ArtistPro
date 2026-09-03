declare module 'imagetracerjs' {
  interface ImageTracerApi {
    imagedataToSVG(
      imageData: { width: number; height: number; data: Uint8ClampedArray },
      options?: Record<string, unknown>,
    ): string
  }

  const ImageTracer: ImageTracerApi
  export default ImageTracer
}

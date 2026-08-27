/// <reference types="bmapgl" />

declare namespace AMap {
  interface MapOptions {
    center?: [number, number]
    viewMode?: '2D' | '3D'
    zoom?: number
  }

  class Map {
    constructor(container: string | HTMLElement, options?: MapOptions)
    getCenter(): { lat: number; lng: number }
  }
}

declare namespace BMap {
  class Map extends BMapGL.Map {}
  class Point extends BMapGL.Point {}
}

declare const TMap: any

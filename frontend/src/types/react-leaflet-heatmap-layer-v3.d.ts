declare module 'react-leaflet-heatmap-layer-v3' {
  import * as React from 'react';
  interface HeatmapLayerProps<Point = unknown> { // Используем Point для обобщения
    points: Array<Point>; // Point может быть вашим [number, number, number]
    longitudeExtractor: (p: Point) => number;
    latitudeExtractor: (p: Point) => number;
    intensityExtractor: (p: Point) => number;
    radius?: number;
    max?: number;
    blur?: number;
    maxZoom?: number;
    gradient?: { [key: number]: string };
    // Добавьте любые другие props, которые вы используете или которые есть в документации
  }


  export const HeatmapLayer: React.ForwardRefExoticComponent<
    HeatmapLayerProps<[number, number, number]> & React.RefAttributes<any> // RefAttributes<Heatmap<unknown>> из оригинала
  >;

  // Убедитесь, что нет `export default` для HeatmapLayer, если рантайм ожидает именованный.
}
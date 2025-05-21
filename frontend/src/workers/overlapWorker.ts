// Web Worker for calculating overlap intensity
interface GridPoint {
  lat: number;
  lng: number;
  density: number;
}

interface OverlapCalculationData {
  type: 'calculate';
  species1Points: GridPoint[];
  species2Points: GridPoint[];
  intersectionGeometry: any;
}

// Helper function to check if point is inside polygon
function pointInPolygon(point: [number, number], polygon: any): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;

  // Handle both Polygon and MultiPolygon geometries
  let coordinates: number[][][][];
  
  if (polygon.type === 'MultiPolygon') {
    coordinates = polygon.coordinates;
  } else if (polygon.type === 'Polygon') {
    coordinates = [polygon.coordinates];
  } else if (polygon.geometry) {
    // Handle Feature type
    if (polygon.geometry.type === 'MultiPolygon') {
      coordinates = polygon.geometry.coordinates;
    } else if (polygon.geometry.type === 'Polygon') {
      coordinates = [polygon.geometry.coordinates];
    } else {
      console.error('Unsupported geometry type:', polygon.geometry.type);
      return false;
    }
  } else {
    console.error('Invalid polygon structure:', polygon);
    return false;
  }

  // Process each polygon in MultiPolygon or single polygon
  coordinates.forEach((polygonRings: number[][][]) => {
    // Process each ring (outer and holes) of the polygon
    polygonRings.forEach((ring: number[][]) => {
      if (!Array.isArray(ring) || ring.length < 3) {
        return; // Skip invalid rings silently
      }

      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
    });
  });
  
  return inside;
}

// Helper function to calculate distance between points
function distance(point1: [number, number], point2: [number, number]): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1[1] * Math.PI/180;
  const φ2 = point2[1] * Math.PI/180;
  const Δφ = (point2[1] - point1[1]) * Math.PI/180;
  const Δλ = (point2[0] - point1[0]) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data as OverlapCalculationData;

  if (data.type !== 'calculate') {
    console.error('Invalid message type');
    return;
  }

  const { species1Points, species2Points, intersectionGeometry } = data;
  
  if (!species1Points || !species2Points || !intersectionGeometry) {
    console.error('Missing required data for calculation');
    return;
  }

  const intersectionPoints: Array<{lat: number; lng: number; intensity: number}> = [];
  let maxIntensity = 0;

  // Для каждой точки первого вида проверяем, находится ли она в пересечении
  species1Points.forEach((point1: GridPoint) => {
    const point: [number, number] = [point1.lng, point1.lat];
    if (pointInPolygon(point, intersectionGeometry)) {
      // Находим ближайшую точку второго вида
      const nearestPoint2 = species2Points.reduce((nearest: GridPoint | null, point2: GridPoint) => {
        const dist1 = distance(point, [point2.lng, point2.lat]);
        const dist2 = nearest ? distance(point, [nearest.lng, nearest.lat]) : Infinity;
        return dist1 < dist2 ? point2 : nearest;
      }, null);

      if (nearestPoint2) {
        // Рассчитываем интенсивность пересечения как среднее геометрическое
        const intersectionIntensity = Math.sqrt(point1.density * nearestPoint2.density);
        maxIntensity = Math.max(maxIntensity, intersectionIntensity);
        
        intersectionPoints.push({
          lat: point1.lat,
          lng: point1.lng,
          intensity: intersectionIntensity
        });
      }
    }
  });

  // Log only final results
  console.log('Overlap calculation completed:', {
    totalPoints: species1Points.length,
    intersectionPoints: intersectionPoints.length,
    maxIntensity
  });

  self.postMessage({
    points: intersectionPoints,
    maxIntensity
  });
}; 
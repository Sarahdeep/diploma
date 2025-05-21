// src/utils/mapUtils.ts
// Утилиты для работы с картой и математическими преобразованиями

/**
 * Преобразует строку в консистентный цвет в формате hex.
 * @param str - входная строка
 * @returns hex-код цвета
 */
export function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
  }
  
  /**
   * Конвертирует метры в градусы широты/долготы, приближенно.
   * @param meters - расстояние в метрах
   * @param latitude - широта точки (для поправки на конверсию в долготе)
   * @returns приблизительное значение в градусах
   */
  export function metersToDegrees(meters: number, latitude: number = 0): number {
    const EARTH_RADIUS = 6371000; // в метрах
    const radians = meters / EARTH_RADIUS;
    const degrees = (radians * 180) / Math.PI;
    return degrees / Math.cos((latitude * Math.PI) / 180);
  }
  
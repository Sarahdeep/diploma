import React, { useState, useEffect, useCallback, CSSProperties, useRef } from 'react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import L, { LatLngExpression, LeafletEvent, Layer as LeafletLayer } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, LayersControl, FeatureGroup, ScaleControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { Spin, Alert, Row, Col, Card } from 'antd';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import {
  Species,
  GridPoint,
  HabitatOverlap,
  ObservationResponse,
  ObservationFeature,
  HabitatAreaFeature,
  HabitatAreaResponse,
  MapFeature,
  HabitatAreaPreviewResponse,
  OverlapResult,
  CalculatedHabitat,
  LayerVisibility,
  ObservationCache,
  HeatmapPoint
} from '@/types/map';
import MapControls from '@/components/MapControls/MapControls';
import ObservationsLayer from '@/components/MapLayers/ObservationsLayer';

// --- Leaflet Icon Setup ---
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

// --- Configuration ---
const API_BASE_URL = '/api/v1';
const MAP_INITIAL_CENTER: LatLngExpression = [55.75, 37.61];
const MAP_INITIAL_ZOOM = 4;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

// --- Helper Function for Color ---
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

// Add conversion function
const metersToDegrees = (meters: number, latitude: number = 55.75): number => {
  const EARTH_RADIUS = 6371000;
  const radians = meters / EARTH_RADIUS;
  const degrees = radians * (180 / Math.PI);
  return degrees / Math.cos(latitude * (Math.PI / 180));
};

function GeoDataMapPage(): JSX.Element {
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<[string, string]>(['', '']);
  const [showObservations, setShowObservations] = useState(true);
  const [showMCP, setShowMCP] = useState(true);
  const [showKDE, setShowKDE] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const [observations, setObservations] = useState<ObservationFeature[]>([]);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [habitatAreas, setHabitatAreas] = useState<HabitatAreaFeature[]>([]);

  const [mapCenter, setMapCenter] = useState<LatLngExpression>(MAP_INITIAL_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(MAP_INITIAL_ZOOM);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);

  const [isLoadingSpecies, setIsLoadingSpecies] = useState<boolean>(false);
  const [isLoadingObservations, setIsLoadingObservations] = useState<boolean>(false);
  const [isLoadingHabitats, setIsLoadingHabitats] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [overlapData, setOverlapData] = useState<HabitatOverlap | null>(null);
  const [isLoadingOverlap, setIsLoadingOverlap] = useState<boolean>(false);

  const [calculatedKDE, setCalculatedKDE] = useState<HabitatAreaFeature | null>(null);
  const [calculatedMCP, setCalculatedMCP] = useState<HabitatAreaFeature | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [lastPreviewRequest, setLastPreviewRequest] = useState<any>(null);

  const [mcpInputParams, setMcpInputParams] = useState<{ percentage: number }>({ percentage: 95 });
  const [kdeInputParams, setKdeInputParams] = useState<{ h_meters: number; level_percent: number; grid_size: number }>({ 
    h_meters: 1000,
    level_percent: 90, 
    grid_size: 100 
  });

  const mapRef = React.useRef<L.Map | null>(null);

  const [heatmapLayer, setHeatmapLayer] = useState<L.Layer | null>(null);
  const [maxDensity, setMaxDensity] = useState<number | null>(null);
  const [overlapResult, setOverlapResult] = useState<OverlapResult | null>(null);
  const [calculatedHabitats, setCalculatedHabitats] = useState<CalculatedHabitat[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({});
  const [heatmapDataReady, setHeatmapDataReady] = useState<{[key: number]: boolean}>({});
  const [observationCache, setObservationCache] = useState<ObservationCache[]>([]);
  const [isLoadingNewObservations, setIsLoadingNewObservations] = useState<boolean>(false);
  const [isCalculatingOverlap, setIsCalculatingOverlap] = useState<boolean>(false);
  const [overlapCalculationProgress, setOverlapCalculationProgress] = useState<number>(0);
  const overlapWorkerRef = useRef<Worker | null>(null);
  const [needsOverlapRecalculation, setNeedsOverlapRecalculation] = useState<boolean>(false);
  const [overlapResults, setOverlapResults] = useState<Array<{
    species1: CalculatedHabitat;
    species2: CalculatedHabitat;
    overlap: OverlapResult;
  }>>([]);

  useEffect(() => {
    overlapWorkerRef.current = new Worker(new URL('../workers/overlapWorker.ts', import.meta.url), { type: 'module' });
    
    overlapWorkerRef.current.onmessage = (e) => {
      const { points, maxIntensity } = e.data;
      
      setOverlapResults(prev => prev.map(result => {
        if (result.overlap.intensity_data) {
          return {
            ...result,
            overlap: {
              ...result.overlap,
              intensity_data: {
                points,
                max_intensity: maxIntensity
              }
            }
          };
        }
        return result;
      }));
      
      setIsCalculatingOverlap(false);
      setOverlapCalculationProgress(0);
    };

    return () => {
      overlapWorkerRef.current?.terminate();
    };
  }, []);

  const fetchSpecies = useCallback(async () => {
    setIsLoadingSpecies(true);
    setError(null);
    try {
      const response = await axiosInstance.get<Species[]>('/species/');
      setSpeciesList(response.data);
    } catch (e: any) {
      setError(`Failed to load species: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      toast.error('Ошибка загрузки списка видов');
    } finally {
      setIsLoadingSpecies(false);
    }
  }, []);

  const fetchObservations = useCallback(async (forceRefresh: boolean = false) => {
    if ((!showObservations && !showHeatmap) || selectedSpeciesIds.length === 0) {
      setObservations([]);
      setHeatmapPoints([]);
      return;
    }

    if (!mapBounds) return;

    const existingCache = observationCache.find(cache => 
      cache.bounds.contains(mapBounds.getNorthEast()) && 
      cache.bounds.contains(mapBounds.getSouthWest())
    );

    if (existingCache && !forceRefresh) {
      if (showObservations) {
        setObservations(existingCache.observations);
      }
      if (showHeatmap) {
        setHeatmapPoints(existingCache.observations.map(obs => ({
          lat: obs.geometry.coordinates[1],
          lng: obs.geometry.coordinates[0],
          intensity: 1.0
        })));
      }
      return;
    }

    const needsNewData = !existingCache || 
      !existingCache.bounds.contains(mapBounds.getNorthEast()) || 
      !existingCache.bounds.contains(mapBounds.getSouthWest());

    if (!needsNewData && !forceRefresh) return;

    setIsLoadingNewObservations(true);
    setError(null);

    try {
      const fetchPromises = selectedSpeciesIds.map(speciesId => {
        const params = new URLSearchParams();
        params.append('species_id', speciesId.toString());
        if (dateRange[0]) params.append('start_date', dateRange[0]);
        if (dateRange[1]) params.append('end_date', dateRange[1]);
        params.append('limit', '2000');

        const bufferedBounds = mapBounds.pad(0.1);
        params.append('min_lon', bufferedBounds.getWest().toString());
        params.append('min_lat', bufferedBounds.getSouth().toString());
        params.append('max_lon', bufferedBounds.getEast().toString());
        params.append('max_lat', bufferedBounds.getNorth().toString());

        return axiosInstance.get<ObservationResponse>('/observations/', { params });
      });

      const responses = await Promise.all(fetchPromises);
      const allObsFeatures: ObservationFeature[] = [];
      const currentHeatmapPoints: HeatmapPoint[] = [];

      responses.forEach((response) => {
        (response.data.observations || []).forEach((obs: any) => {
          const feature = {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: obs.location.coordinates
            },
            properties: {
              id: obs.id,
              species_id: obs.species_id,
              species_name: (speciesList.find(s => s.id === obs.species_id)?.name) || `Species ${obs.species_id}`,
              timestamp: obs.timestamp,
              image_url: obs.image_url,
              source: obs.source,
              classification_confidence: obs.classification_confidence,
              user_id: obs.user_id
            }
          } as ObservationFeature;
          allObsFeatures.push(feature);
          
          currentHeatmapPoints.push({
            lat: obs.location.coordinates[1],
            lng: obs.location.coordinates[0],
            intensity: obs.density || 1.0
          });
        });
      });

      setObservationCache(prev => {
        const newCache = {
          bounds: mapBounds.pad(0.1),
          observations: allObsFeatures
        };
        
        const filteredCache = prev.filter(cache => 
          !cache.bounds.intersects(newCache.bounds)
        );

        const mergedObservations = [...allObsFeatures];
        prev.forEach(cache => {
          if (cache.bounds.intersects(newCache.bounds)) {
            cache.observations.forEach(obs => {
              if (!mergedObservations.some(newObs => newObs.properties.id === obs.properties.id)) {
                mergedObservations.push(obs);
              }
            });
          }
        });
        
        return [...filteredCache, { ...newCache, observations: mergedObservations }];
      });
      
      if (showObservations) {
        setObservations(allObsFeatures);
      }
      if (showHeatmap) {
        setHeatmapPoints(currentHeatmapPoints);
      }

    } catch (e: any) {
      console.error('Failed to fetch observations:', e);
      setError(`Failed to load observations: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      toast.error('Ошибка загрузки наблюдений');
    } finally {
      setIsLoadingNewObservations(false);
    }
  }, [selectedSpeciesIds, dateRange, mapBounds, showObservations, showHeatmap, speciesList, axiosInstance, observationCache]);

  const fetchHabitatAreas = useCallback(async () => {
    setIsLoadingHabitats(true);
    setError(null);
    setHabitatAreas([]);

    if (selectedSpeciesIds.length === 0) {
        setIsLoadingHabitats(false);
        return;
    }

    try {
        const responses = await Promise.all(
            selectedSpeciesIds.map(speciesId => 
                axiosInstance.get<HabitatAreaResponse[]>(`/habitats/?species_id=${speciesId}&limit=100`)
            )
        );

        const allHabitats: HabitatAreaFeature[] = responses.flatMap((response) => {
            return response.data.map(habitat => ({
                type: 'Feature' as const,
                geometry: habitat.polygon,
                properties: {
                    id: habitat.id,
                    species_id: habitat.species_id,
                    species_name: habitat.species.name,
                    method: habitat.method.toUpperCase() as 'MCP' | 'KDE',
                    parameters: habitat.parameters,
                    calculated_at: habitat.calculated_at,
                    source_observation_count: habitat.source_observation_count,
                    user_id: habitat.user_id,
                }
            })) as HabitatAreaFeature[];
        });
        setHabitatAreas(allHabitats);

    } catch (e: any) {
      console.error('Failed to fetch saved habitat areas:', e);
      setError(`Failed to load saved habitat areas: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      toast.error('Ошибка загрузки сохраненных ареалов обитания');
      setHabitatAreas([]);
    } finally {
      setIsLoadingHabitats(false);
    }
  }, [selectedSpeciesIds, axiosInstance]);

  const fetchOverlapData = useCallback(async (species1Id: number, species2Id: number) => {
    if (!species1Id || !species2Id) {
      setOverlapData(null);
      return;
    }

    setIsLoadingOverlap(true);
    setError(null);

    try {
      const response = await axiosInstance.post<HabitatOverlap>(`/habitats/overlap/${species1Id}/${species2Id}`, {
        method: 'kde'
      });
      setOverlapData(response.data);
    } catch (e: any) {
      console.error('Failed to fetch overlap data:', e);
      setError(`Failed to load overlap data: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      toast.error('Ошибка загрузки данных о перекрытии ареалов');
      setOverlapData(null);
    } finally {
      setIsLoadingOverlap(false);
    }
  }, []);

  const calculateAllOverlaps = useCallback((habitats: CalculatedHabitat[]) => {
    const overlaps: Array<{
      species1: CalculatedHabitat;
      species2: CalculatedHabitat;
      overlap: OverlapResult;
    }> = [];

    const kdeHabitats = habitats.filter(h => h.method === 'KDE');

    for (let i = 0; i < kdeHabitats.length; i++) {
      for (let j = i + 1; j < kdeHabitats.length; j++) {
        try {
          const intersectionResult = (window as any).turf.intersect(
            kdeHabitats[i].geometry,
            kdeHabitats[j].geometry
          );
          
          if (intersectionResult) {
            const overlapArea = (window as any).turf.area(intersectionResult) / 1000000;
            const species1Area = (window as any).turf.area(kdeHabitats[i].geometry) / 1000000;
            const species2Area = (window as any).turf.area(kdeHabitats[j].geometry) / 1000000;

            const overlapPercentage1 = (overlapArea / species1Area) * 100;
            const overlapPercentage2 = (overlapArea / species2Area) * 100;

            overlaps.push({
              species1: kdeHabitats[i],
              species2: kdeHabitats[j],
              overlap: {
                overlap_area: overlapArea,
                species1_area: species1Area,
                species2_area: species2Area,
                overlap_percentage: Math.max(overlapPercentage1, overlapPercentage2),
                geometry: intersectionResult,
                intensity_data: {
                  points: [],
                  max_intensity: 0
                }
              }
            });
          }
        } catch (error) {
          console.error('Error calculating overlap:', error);
        }
      }
    }

    setOverlapResults(overlaps);

    if (overlaps.length > 0 && overlapWorkerRef.current) {
      overlaps.forEach((overlap, index) => {
        const species1Points = overlap.species1.parameters?.grid_points || [];
        const species2Points = overlap.species2.parameters?.grid_points || [];
        
        overlapWorkerRef.current?.postMessage({
          type: 'calculate',
          species1Points,
          species2Points,
          intersectionGeometry: overlap.overlap.geometry
        });
        
        setOverlapCalculationProgress((index + 1) / overlaps.length * 100);
      });
    } else {
      setIsCalculatingOverlap(false);
      setNeedsOverlapRecalculation(false);
    }
  }, []);

  useEffect(() => {
    if (needsOverlapRecalculation && selectedSpeciesIds.length >= 2) {
      setOverlapResults([]);
      setIsCalculatingOverlap(true);
      const kdeHabitats = calculatedHabitats.filter(h => h.method === 'KDE');
      if (kdeHabitats.length >= 2) {
        calculateAllOverlaps(kdeHabitats);
      } else {
        setIsCalculatingOverlap(false);
        setNeedsOverlapRecalculation(false);
      }
    }
  }, [calculatedHabitats, needsOverlapRecalculation, selectedSpeciesIds.length, calculateAllOverlaps]);

  const calculateHabitatArea = async (method: 'MCP' | 'KDE') => {
    if (selectedSpeciesIds.length === 0) {
      toast.info('Пожалуйста, выберите хотя бы один вид для расчета ареала.');
      return;
    }
    
    setIsLoadingPreview(true);
    setError(null);
    setNeedsOverlapRecalculation(true);
    setOverlapResults([]);

    try {
      const calculationPromises = selectedSpeciesIds.map(async (speciesId) => {
        const speciesName = speciesList.find(s => s.id === speciesId)?.name || `Species ${speciesId}`;

        let calcParams: Record<string, any> = {};
        if (method === 'MCP') {
          calcParams = { percentage: mcpInputParams.percentage };
        } else if (method === 'KDE') {
          const h_degrees = metersToDegrees(kdeInputParams.h_meters);
          calcParams = { 
            h_meters: h_degrees,
            level_percent: kdeInputParams.level_percent,
            grid_size: kdeInputParams.grid_size
          };
        }

        const requestBody = {
          parameters: calcParams,
          filters: {
            start_date: dateRange[0] ? new Date(dateRange[0]).toISOString() : undefined,
            end_date: dateRange[1] ? new Date(dateRange[1]).toISOString() : undefined,
          },
        };

        const response = await axiosInstance.post<HabitatAreaPreviewResponse>(
          `/habitats/preview/${speciesId}/${method.toLowerCase()}`,
          requestBody
        );
        
        const data = response.data;
        
        if (data.polygon) {
          if (method === 'KDE' && data.grid_points && data.grid_points.length > 0) {
            setHeatmapDataReady(prev => ({
              ...prev,
              [speciesId]: true
            }));
          }

          return {
            id: Date.now() + speciesId,
            species_id: speciesId,
            species_name: speciesName,
            method: method,
            geometry: {
              type: 'Feature',
              geometry: data.polygon as Polygon | MultiPolygon,
              properties: {}
            },
            parameters: {
              ...calcParams,
              grid_points: data.grid_points || [],
              max_density: data.max_density || 1.0
            },
            calculated_at: new Date().toISOString(),
            source_observation_count: data.source_observation_count,
          } as CalculatedHabitat;
        }
        return null;
      });

      const results = await Promise.all(calculationPromises);
      const validResults = results.filter((result): result is CalculatedHabitat => result !== null);

      setCalculatedHabitats(prev => {
        const filtered = prev.filter(h => 
          !(selectedSpeciesIds.includes(h.species_id) && h.method === method)
        );
        return [...filtered, ...validResults];
      });

      if (validResults.length > 0) {
        setNeedsOverlapRecalculation(true);
        calculateAllOverlaps([...validResults]);
      }

      toast.success(`Расчет ${method} завершен для ${validResults.length} видов`);

    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || 'Unknown error';
      setError(`Failed to calculate areas: ${errorMsg}`);
      toast.error(`Ошибка расчета: ${errorMsg}`);
      setNeedsOverlapRecalculation(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  useEffect(() => {
    fetchSpecies();
  }, [fetchSpecies]);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  const handleMapMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      const newBounds = map.getBounds();
      setMapBounds(newBounds);
      
      const needsNewData = !observationCache.some(cache => 
        cache.bounds.contains(newBounds.getNorthEast()) && 
        cache.bounds.contains(newBounds.getSouthWest())
      );

      if (needsNewData) {
        fetchObservations();
      }
    }
  }, [fetchObservations, observationCache]);

  useEffect(() => {
      const map = mapRef.current;
      if (map) {
          map.on('moveend', handleMapMoveEnd);

          const handleOverlayAdd = (event: LeafletEvent) => {
              const layerName = (event as any).layer.options.name;
              if (layerName === 'Наблюдения') setShowObservations(true);
              if (layerName === 'MCP области') setShowMCP(true);
              if (layerName === 'KDE контур') setShowKDE(true);
              if (layerName === 'Тепловая карта') setShowHeatmap(true);
          };

          const handleOverlayRemove = (event: LeafletEvent) => {
              const layerName = (event as any).layer.options.name;
              if (layerName === 'Наблюдения') setShowObservations(false);
              if (layerName === 'KDE контур') setShowKDE(false);
              if (layerName === 'Тепловая карта') setShowHeatmap(false);
              if (layerName === 'MCP области') setShowMCP(false);
          };

          setShowObservations(true);
          setShowMCP(true);
          setShowKDE(true);
          setShowHeatmap(false);

          map.on('overlayadd', handleOverlayAdd);
          map.on('overlayremove', handleOverlayRemove);

          return () => {
              map.off('moveend', handleMapMoveEnd);
              map.off('overlayadd', handleOverlayAdd);
              map.off('overlayremove', handleOverlayRemove);
          };
      }
  }, [handleMapMoveEnd]);

  const handleSpeciesChange = async (selectedIds: number[]) => {
    setSelectedSpeciesIds(selectedIds);
    setCalculatedKDE(null);
    setCalculatedMCP(null);
    setHeatmapPoints([]);
    setMaxDensity(null);
    setOverlapData(null);
    setCalculatedHabitats([]);
    setOverlapResults([]);
    setOverlapResult(null);
    setHeatmapDataReady({});
    setObservationCache([]);
    setNeedsOverlapRecalculation(true);
    fetchObservations(true);
  };

  const handleDateChange = async (dates: any, dateStrings: [string, string]) => {
    setDateRange(dateStrings);
    setCalculatedKDE(null);
    setCalculatedMCP(null);
    setHeatmapPoints([]);
    setMaxDensity(null);
    setOverlapData(null);
    setObservationCache([]);
    fetchObservations(true);
  };

  const handleMcpParamsChange = (value: number | null) => {
    if (value !== null) {
      setMcpInputParams({ percentage: value });
    }
  };

  const handleKdeParamsChange = (field: 'h_meters' | 'level_percent' | 'grid_size', value: number | null) => {
    if (value !== null) {
      setKdeInputParams(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const isOverallLoading = isLoadingSpecies || isLoadingObservations || isLoadingHabitats || isLoadingOverlap || isLoadingPreview;

  const getHabitatStyle = (feature?: MapFeature): L.PathOptions => {
    if (!feature || !feature.properties || !(feature as HabitatAreaFeature).properties.species_name) {
        return { color: '#888888', weight: 2, opacity: 0.6, fillOpacity: 0.1 };
    }
    const props = (feature as HabitatAreaFeature).properties;
    const color = stringToColor(props.species_name || 'default');

    return {
      color: color,
      weight: props.method === 'KDE' ? 2 : 3,
      opacity: 0.8,
      fillColor: color,
      fillOpacity: props.method === 'KDE' ? 0.2 : 0.1,
      dashArray: props.method === 'KDE' ? '5, 5' : undefined,
    };
  };

  const onEachHabitatFeature = (feature: MapFeature, layer: L.Layer) => {
    if (feature.properties) {
        const props = (feature as HabitatAreaFeature).properties;
        const popupContent = `
        <strong>${props.species_name || 'Habitat Area'} (${props.method})</strong><br/>
        Species ID: ${props.species_id}<br/>
        Method: ${props.method}<br/>
        Calculated: ${new Date(props.calculated_at).toLocaleString()}<br/>
        Parameters: ${JSON.stringify(props.parameters)}<br/>
        ${props.source_observation_count ? `Source Points: ${props.source_observation_count}<br/>` : ''}
      `;
      layer.bindPopup(popupContent);
    }
  };

  const getOverlapStyle = (): L.PathOptions => {
    return {
      color: '#FF4500',
      weight: 2,
      opacity: 0.7,
      fillColor: '#FF4500',
      fillOpacity: 0.3
    };
  };

  const getMCPStyle = (): L.PathOptions => {
    return {
      color: '#FF0000',
      weight: 3,
      opacity: 0.9,
      fillColor: '#FF0000',
      fillOpacity: 0.2,
      dashArray: '5, 5'
    };
  };

  const getKDEStyle = (): L.PathOptions => {
    return {
      color: '#0000FF',
      weight: 2,
      opacity: 0.8,
      fillColor: '#0000FF',
      fillOpacity: 0.15,
      dashArray: '7, 7'
    };
  };

  const renderMCPLayer = () => {
    if (!showMCP || !calculatedMCP) return null;
    
    return (
      <GeoJSON
        key={`mcp-layer-${calculatedMCP.properties.parameters.percentage}`}
        data={{
          type: 'FeatureCollection',
          features: [calculatedMCP]
        } as FeatureCollection}
        style={getMCPStyle}
        onEachFeature={onEachHabitatFeature}
      />
    );
  };

  const renderKDELayer = () => {
    if (!showKDE || !calculatedKDE) return null;
    
    return (
      <GeoJSON
        key={`kde-layer-${calculatedKDE.properties.parameters.h_meters}-${calculatedKDE.properties.parameters.level_percent}-${calculatedKDE.properties.parameters.grid_size}`}
        data={{
          type: 'FeatureCollection',
          features: [calculatedKDE]
        } as FeatureCollection}
        style={getKDEStyle}
        onEachFeature={onEachHabitatFeature}
      />
    );
  };

  const renderHabitatLayers = () => {
    return calculatedHabitats.map(habitat => (
      <GeoJSON
        key={`${habitat.method}-${habitat.species_id}-${habitat.id}`}
        data={{
          type: 'FeatureCollection',
          features: [habitat.geometry]
        } as FeatureCollection}
        style={() => ({
          color: stringToColor(habitat.species_name),
          weight: habitat.method === 'KDE' ? 2 : 3,
          opacity: 0.8,
          fillColor: stringToColor(habitat.species_name),
          fillOpacity: habitat.method === 'KDE' ? 0.2 : 0.1,
          dashArray: habitat.method === 'KDE' ? '5, 5' : undefined,
        })}
        onEachFeature={(feature, layer) => {
          layer.bindPopup(`
            <div>
              <strong>${habitat.species_name} (${habitat.method})</strong><br/>
              Площадь: ${((window as any).turf.area(habitat.geometry) / 1000000).toFixed(2)} км²<br/>
              Количество точек: ${habitat.source_observation_count}<br/>
              Дата расчета: ${new Date(habitat.calculated_at).toLocaleString()}
            </div>
          `);
        }}
      />
    ));
  };

  const renderOverlapLayers = () => {
    return (
      <>
        {overlapResults.map((result, index) => (
          <React.Fragment key={`overlap-${index}`}>
            <GeoJSON
              data={result.overlap.geometry}
              style={() => ({
                color: '#FF4500',
                weight: 2,
                opacity: 0.7,
                fillColor: '#FF4500',
                fillOpacity: 0.3
              })}
              onEachFeature={(feature, layer) => {
                layer.bindPopup(`
                  <div>
                    <strong>Пересечение ареалов</strong><br/>
                    ${result.species1.species_name} и ${result.species2.species_name}<br/>
                    Площадь пересечения: ${result.overlap.overlap_area.toFixed(2)} км²<br/>
                    Процент пересечения: ${result.overlap.overlap_percentage.toFixed(2)}%
                  </div>
                `);
              }}
            />
            
            {!isCalculatingOverlap && result.overlap.intensity_data && result.overlap.intensity_data.points.length > 0 && (
              <HeatmapLayer
                key={`overlap-heatmap-${index}-${result.overlap.intensity_data.max_intensity}`}
                points={result.overlap.intensity_data.points.map(point => 
                  [point.lat, point.lng, point.intensity] as [number, number, number]
                )}
                longitudeExtractor={(m: [number, number, number]) => m[1]}
                latitudeExtractor={(m: [number, number, number]) => m[0]}
                intensityExtractor={(m: [number, number, number]) => m[2]}
                radius={25}
                max={result.overlap.intensity_data.max_intensity}
                blur={15}
                maxZoom={10}
                gradient={{
                  0.4: 'blue',
                  0.6: 'lime',
                  0.8: 'yellow',
                  1.0: 'red'
                }}
              />
            )}
          </React.Fragment>
        ))}
        
        {isCalculatingOverlap && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/90 p-5 rounded-lg shadow-md z-50">
            <Spin tip={`Расчет интенсивности пересечения: ${Math.round(overlapCalculationProgress)}%`} />
          </div>
        )}
      </>
    );
  };

  const renderSpeciesLayers = () => {
    return selectedSpeciesIds.map(speciesId => {
      const species = speciesList.find(s => s.id === speciesId);
      if (!species) return null;

      const speciesHabitats = calculatedHabitats.filter(h => h.species_id === speciesId);
      const mcpHabitat = speciesHabitats.find(h => h.method === 'MCP');
      const kdeHabitat = speciesHabitats.find(h => h.method === 'KDE');

      const kdeGridPoints: GridPoint[] = kdeHabitat?.parameters?.grid_points || [];
      const maxDensity = kdeHabitat?.parameters?.max_density || 1.0;
      const isHeatmapReady = heatmapDataReady[speciesId] && kdeGridPoints.length > 0;

      return (
        <React.Fragment key={`species-${speciesId}`}>
          <LayersControl.Overlay 
            key={`mcp-${speciesId}`}
            name={`${species.name} - MCP`}
            checked={true}
          >
            <FeatureGroup>
              {mcpHabitat && (
                <GeoJSON
                  key={`mcp-${speciesId}-${mcpHabitat.id}`}
                  data={{
                    type: 'FeatureCollection',
                    features: [mcpHabitat.geometry]
                  } as FeatureCollection}
                  style={() => ({
                    color: stringToColor(species.name),
                    weight: 3,
                    opacity: 0.8,
                    fillColor: stringToColor(species.name),
                    fillOpacity: 0.1
                  })}
                  onEachFeature={(feature, layer) => {
                    layer.bindPopup(`
                      <div>
                        <strong>${species.name} (MCP)</strong><br/>
                        Площадь: ${((window as any).turf.area(mcpHabitat.geometry) / 1000000).toFixed(2)} км²<br/>
                        Количество точек: ${mcpHabitat.source_observation_count}<br/>
                        Дата расчета: ${new Date(mcpHabitat.calculated_at).toLocaleString()}
                      </div>
                    `);
                  }}
                />
              )}
            </FeatureGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay 
            key={`kde-${speciesId}`}
            name={`${species.name} - KDE`}
            checked={true}
          >
            <FeatureGroup>
              {kdeHabitat && (
                <GeoJSON
                  key={`kde-${speciesId}-${kdeHabitat.id}`}
                  data={{
                    type: 'FeatureCollection',
                    features: [kdeHabitat.geometry]
                  } as FeatureCollection}
                  style={() => ({
                    color: stringToColor(species.name),
                    weight: 2,
                    opacity: 0.8,
                    fillColor: stringToColor(species.name),
                    fillOpacity: 0.2,
                    dashArray: '5, 5'
                  })}
                  onEachFeature={(feature, layer) => {
                    layer.bindPopup(`
                      <div>
                        <strong>${species.name} (KDE)</strong><br/>
                        Площадь: ${((window as any).turf.area(kdeHabitat.geometry) / 1000000).toFixed(2)} км²<br/>
                        Количество точек: ${kdeHabitat.source_observation_count}<br/>
                        Дата расчета: ${new Date(kdeHabitat.calculated_at).toLocaleString()}
                      </div>
                    `);
                  }}
                />
              )}
            </FeatureGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay 
            key={`heatmap-${speciesId}`}
            name={`${species.name} - Тепловая карта`}
            checked={false}
          >
            <FeatureGroup>
              {isHeatmapReady && kdeGridPoints.length > 0 && (
                <HeatmapLayer
                  key={`heatmap-${speciesId}-${kdeHabitat?.id}`}
                  points={kdeGridPoints.map((point: GridPoint) => [point.lat, point.lng, point.density] as [number, number, number])}
                  longitudeExtractor={(m: [number, number, number]) => m[1]}
                  latitudeExtractor={(m: [number, number, number]) => m[0]}
                  intensityExtractor={(m: [number, number, number]) => m[2]}
                  radius={25}
                  max={maxDensity}
                  blur={15}
                  maxZoom={10}
                  gradient={{
                    0.4: 'blue',
                    0.6: 'lime',
                    0.8: 'yellow',
                    1.0: 'red'
                  }}
                />
              )}
            </FeatureGroup>
          </LayersControl.Overlay>
        </React.Fragment>
      );
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <style>{globalStyles}</style>
      <Toaster richColors />
      
      <h1 className="text-3xl font-bold mb-6">Карта ареалов обитания</h1>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8} lg={6} style={styles.controlsColumn}>
          <MapControls
            speciesList={speciesList}
            selectedSpeciesIds={selectedSpeciesIds}
            onSpeciesChange={handleSpeciesChange}
            loadingSpecies={isLoadingSpecies}
            dateRange={dateRange}
            onDateRangeChange={handleDateChange}
            mcpInputParams={mcpInputParams}
            kdeInputParams={kdeInputParams}
            onMcpParamsChange={handleMcpParamsChange}
            onKdeParamsChange={handleKdeParamsChange}
            onCalculateHabitat={calculateHabitatArea}
            isLoadingPreview={isLoadingPreview}
            isOverallLoading={isOverallLoading}
          />
        </Col>

        <Col xs={24} md={16} lg={18}>
          <MapContainer 
            center={mapCenter} 
            zoom={mapZoom} 
            style={styles.mapContainer}
            whenReady={() => { 
              if (mapRef.current) {
                setMapBounds(mapRef.current.getBounds()); 
              } 
            }} 
            ref={mapRef}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ScaleControl position="bottomleft" />

            <LayersControl position="bottomright">
              <LayersControl.Overlay 
                name="Наблюдения" 
                checked={showObservations} 
              >
                <FeatureGroup>
                  <ObservationsLayer observations={observations} show={showObservations} />
                </FeatureGroup>
              </LayersControl.Overlay>

              {renderSpeciesLayers()}

              <LayersControl.Overlay name="Пересечения" checked={true}>
                <FeatureGroup>
                  {renderOverlapLayers()}
                </FeatureGroup>
              </LayersControl.Overlay>
            </LayersControl>
          </MapContainer>
        </Col>
      </Row>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  mapContainer: {
    height: 'calc(100vh - 64px - 32px)',
    width: '100%',
  },
  controlsColumn: {
    height: 'calc(100vh - 64px - 32px)',
    overflowY: 'auto' as const,
    backgroundColor: '#f0f2f5',
    padding: '10px'
  }
};

const globalStyles = `
  .leaflet-control-attribution {
    display: none !important;
  }
`;

export default GeoDataMapPage;
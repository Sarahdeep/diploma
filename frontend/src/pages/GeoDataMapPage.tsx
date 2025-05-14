import React, { useState, useEffect, useCallback, CSSProperties } from 'react';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
// Removed marker cluster CSS import - styles might be bundled
// import 'react-leaflet-markercluster/dist/styles.css'; 
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import L, { LatLngExpression, LeafletEvent } from 'leaflet';
import { Spin, Alert, Select, DatePicker, Button, Checkbox, Row, Col, Card, message } from 'antd';
import type { CheckboxChangeEvent } from 'antd/es/checkbox';
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson'; // Import GeoJSON types

const { RangePicker } = DatePicker;

// --- Leaflet Icon Setup ---
// (Ensure these images are available in your public/images folder)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

// --- Type Definitions (Align with Backend Schemas) ---

interface Species {
  id: number;
  name: string;
  description?: string;
}

// Observation GeoJSON Feature
interface ObservationFeature extends Feature<Point> {
  properties: {
    id: number;
    species_id: number;
    species_name?: string; // Add if backend includes this for convenience
    timestamp: string;
    image_url?: string;
    source?: string;
    classification_confidence?: number;
    user_id?: number;
  };
}

// Habitat Area GeoJSON Feature
interface HabitatAreaFeature extends Feature<Polygon | MultiPolygon> {
  properties: {
    id: number;
    species_id: number;
    species_name?: string; // Add if backend includes this
    method: 'MCP' | 'KDE';
    parameters: Record<string, any>; // JSON object
    calculated_at: string;
    source_observation_count?: number;
  };
}

// Combine into a single Feature type for GeoJSON component
type MapFeature = ObservationFeature | HabitatAreaFeature;

// --- Configuration ---
const API_BASE_URL = '/api/v1'; // Your FastAPI prefix
const MAP_INITIAL_CENTER: LatLngExpression = [55.75, 37.61]; // Centered somewhat on Moscow
const MAP_INITIAL_ZOOM = 4;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  // Add auth headers if needed
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

// --- Component ---

function GeoDataMapPage(): JSX.Element {
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<[string | null, string | null]>([null, null]);
  const [showObservations, setShowObservations] = useState(true);
  const [showMCP, setShowMCP] = useState(false);
  const [showKDE, setShowKDE] = useState(false);

  const [observations, setObservations] = useState<ObservationFeature[]>([]);
  const [habitatAreas, setHabitatAreas] = useState<HabitatAreaFeature[]>([]);

  const [mapCenter, setMapCenter] = useState<LatLngExpression>(MAP_INITIAL_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(MAP_INITIAL_ZOOM);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null); // Store current map bounds

  const [isLoadingSpecies, setIsLoadingSpecies] = useState<boolean>(false);
  const [isLoadingObservations, setIsLoadingObservations] = useState<boolean>(false);
  const [isLoadingHabitats, setIsLoadingHabitats] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mapRef = React.useRef<L.Map | null>(null);

  // --- Data Fetching Callbacks ---

  const fetchSpecies = useCallback(async () => {
    setIsLoadingSpecies(true);
      setError(null);
      try {
      const response = await axiosInstance.get<Species[]>('/species/');
      setSpeciesList(response.data);
      } catch (e: any) {
      console.error('Failed to fetch species:', e);
      setError(`Failed to load species: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      message.error('Failed to load species list.');
      } finally {
      setIsLoadingSpecies(false);
      }
  }, []);

  const fetchObservations = useCallback(async () => {
    if (!showObservations || selectedSpeciesIds.length === 0) {
        setObservations([]);
      return;
    }
    setIsLoadingObservations(true);
    setError(null);

    // Use Promise.all to fetch for multiple species
    const fetchPromises = selectedSpeciesIds.map(speciesId => {
        const params = new URLSearchParams();
        params.append('species_id', speciesId.toString());
        if (dateRange[0]) params.append('start_date', dateRange[0]);
        if (dateRange[1]) params.append('end_date', dateRange[1]);
        params.append('limit', '1000'); // Adjust limit as needed

        // Optional: Filter by map bounds
        if (mapBounds) {
          params.append('min_lon', mapBounds.getWest().toString());
          params.append('min_lat', mapBounds.getSouth().toString());
          params.append('max_lon', mapBounds.getEast().toString());
          params.append('max_lat', mapBounds.getNorth().toString());
        }

        return axiosInstance.get<ObservationFeature[]>('/observations/', { params });
    });

    try {
      const responses = await Promise.all(fetchPromises);
      // Combine results from all species, potentially adding species name
      const allObservations = responses.flatMap(response => {
        const speciesId = parseInt(new URL(response.config.url || '', response.config.baseURL).searchParams.get('species_id') || '0');
        const species = speciesList.find(s => s.id === speciesId);
        return response.data.map(obs => ({
             ...obs,
             // Convert backend lat/lon point to GeoJSON Feature
             type: 'Feature' as const,
             geometry: {
                 type: 'Point' as const,
                 // IMPORTANT: Ensure backend sends lon, lat in the correct order for GeoJSON
                 coordinates: (obs as any).location?.coordinates || [0,0], // Adapt based on actual backend response structure
             },
             properties: {
                 ...obs.properties,
                 id: (obs as any).id, // Ensure properties exist
                 species_id: speciesId,
                 species_name: species?.name || `Species ${speciesId}`,
                 timestamp: (obs as any).timestamp
             }
         }));
      });
      setObservations(allObservations);
      } catch (e: any) {
      console.error('Failed to fetch observations:', e);
      setError(`Failed to load observations: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      message.error('Failed to load observation data.');
      setObservations([]);
    } finally {
      setIsLoadingObservations(false);
    }
  }, [selectedSpeciesIds, dateRange, mapBounds, showObservations, speciesList]);

  const fetchHabitatAreas = useCallback(async () => {
    if ((!showMCP && !showKDE) || selectedSpeciesIds.length === 0) {
        setHabitatAreas([]);
      return;
    }
    setIsLoadingHabitats(true);
    setError(null);

    const methodsToShow: Array<'MCP' | 'KDE'> = [];
    if (showMCP) methodsToShow.push('MCP');
    if (showKDE) methodsToShow.push('KDE');

    const fetchPromises = selectedSpeciesIds.flatMap(speciesId =>
        methodsToShow.map(method => {
    const params = new URLSearchParams();
            params.append('species_id', speciesId.toString());
            params.append('method', method);
            params.append('limit', '100'); // Limit results per species/method
            return axiosInstance.get<HabitatAreaFeature[]>('/habitats/', { params });
        })
    );

    try {
        const responses = await Promise.all(fetchPromises);
        const allHabitats = responses.flatMap(response => {
            const speciesId = parseInt(new URL(response.config.url || '', response.config.baseURL).searchParams.get('species_id') || '0');
            const method = new URL(response.config.url || '', response.config.baseURL).searchParams.get('method') || '';
            const species = speciesList.find(s => s.id === speciesId);
            return response.data.map(habitat => ({
                ...habitat,
                type: 'Feature' as const,
                // IMPORTANT: Assuming backend sends GeoJSON Polygon/MultiPolygon directly
                geometry: (habitat as any).polygon, // Adapt based on actual backend response structure
                properties: {
                    ...(habitat as any).properties,
                    id: (habitat as any).id,
                    species_id: speciesId,
                    species_name: species?.name || `Species ${speciesId}`,
                    method: method.toUpperCase() as 'MCP' | 'KDE',
                    parameters: (habitat as any).parameters,
                    calculated_at: (habitat as any).calculated_at,
                    source_observation_count: (habitat as any).source_observation_count
                }
            }));
        });
        setHabitatAreas(allHabitats);
    } catch (e: any) {
      console.error('Failed to fetch habitat areas:', e);
      setError(`Failed to load habitat areas: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
      message.error('Failed to load habitat area data.');
      setHabitatAreas([]);
    } finally {
      setIsLoadingHabitats(false);
    }
  }, [selectedSpeciesIds, showMCP, showKDE, speciesList]);

  // --- Initial Data Load ---
  useEffect(() => {
    fetchSpecies();
  }, [fetchSpecies]);

  // --- Trigger Data Fetches on Filter Changes ---
  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]); // Re-fetch when filters or map bounds change

  useEffect(() => {
    fetchHabitatAreas();
  }, [fetchHabitatAreas]); // Re-fetch when species or visibility changes

  // --- Map Event Handlers ---
  const handleMapMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      setMapBounds(map.getBounds());
      // Optionally update zoom/center state if needed elsewhere
      // setMapZoom(map.getZoom());
      // setMapCenter(map.getCenter());
    }
  }, []);

  // Effect to attach map events
  useEffect(() => {
      const map = mapRef.current;
      if (map) {
          map.on('moveend', handleMapMoveEnd);
          // Clean up listener on component unmount or when handler changes
          return () => {
              map.off('moveend', handleMapMoveEnd);
          };
      }
  }, [handleMapMoveEnd]); // Rerun if handler changes

  // --- UI Event Handlers ---

  const handleSpeciesChange = (selectedIds: number[]) => {
    setSelectedSpeciesIds(selectedIds);
  };

  const handleDateChange = (dates: any, dateStrings: [string, string]) => {
    setDateRange(dateStrings);
  };

  const handleShowObservationsChange = (e: CheckboxChangeEvent) => {
    setShowObservations(e.target.checked);
  };

  const handleShowMCPChange = (e: CheckboxChangeEvent) => {
    setShowMCP(e.target.checked);
  };

  const handleShowKDEChange = (e: CheckboxChangeEvent) => {
    setShowKDE(e.target.checked);
  };

  // --- GeoJSON Styling ---
  const getHabitatStyle = (feature?: MapFeature): L.PathOptions => {
    if (!feature || !feature.properties || !(feature as HabitatAreaFeature).properties.species_name) {
        return { color: '#888888', weight: 2, opacity: 0.6, fillOpacity: 0.1 }; // Default style
    }
    const props = (feature as HabitatAreaFeature).properties;
    const color = stringToColor(props.species_name || 'default');

    return {
      color: color,
      weight: props.method === 'KDE' ? 2 : 3, // Thicker line for MCP
      opacity: 0.8,
      fillColor: color,
      fillOpacity: props.method === 'KDE' ? 0.2 : 0.1, // Slightly more fill for KDE
      dashArray: props.method === 'KDE' ? '5, 5' : undefined, // Dashed line for KDE
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

  // Combine observations and habitats into one GeoJSON object for rendering
  const combinedGeoJsonData: FeatureCollection<Point | Polygon | MultiPolygon, any> = {
    type: 'FeatureCollection',
    features: [...observations, ...habitatAreas] as Feature<Point | Polygon | MultiPolygon, any>[],
  };

  // Filter GeoJSON features based on visibility toggles before passing to GeoJSON component
  const filteredFeatures = combinedGeoJsonData.features.filter(feature => {
      if (feature.geometry.type === 'Point') {
          return showObservations;
      } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const props = (feature as HabitatAreaFeature).properties;
          return (props.method === 'MCP' && showMCP) || (props.method === 'KDE' && showKDE);
      }
      return false;
  });

  const filteredGeoJson: FeatureCollection<Point | Polygon | MultiPolygon, any> = {
      type: 'FeatureCollection',
      features: filteredFeatures
  }


  // --- Render ---

  const isLoading = isLoadingSpecies || isLoadingObservations || isLoadingHabitats;

  return (
    <div style={styles.pageContainer}>
      <Row gutter={[16, 16]}>
        {/* Controls Column */}
        <Col xs={24} md={8} lg={6} style={styles.controlsColumn}>
          <Card title="Map Controls" bordered={false}>
            {error && (
              <Alert
                message="Error"
                description={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: '16px' }}
              />
            )}

            <Spin spinning={isLoading}>
        <div style={styles.controlGroup}>
                <label htmlFor="species-select">Species:</label>
                <Select
                  id="species-select"
                  mode="multiple"
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="Select species to display"
                  value={selectedSpeciesIds}
                  onChange={handleSpeciesChange}
                  loading={isLoadingSpecies}
                  maxTagCount="responsive"
                >
                  {speciesList.map((s) => (
                    <Select.Option key={s.id} value={s.id}>
                      {s.name}
                    </Select.Option>
                  ))}
                </Select>
        </div>

        <div style={styles.controlGroup}>
                <label htmlFor="date-range-picker">Observation Date Range:</label>
                <RangePicker
                  id="date-range-picker"
                  style={{ width: '100%' }}
                  onChange={handleDateChange}
                  // value={dateRange} // Need to convert string[] to Dayjs[] if using controlled component
          />
        </div>

        <div style={styles.controlGroup}>
                <label>Show Layers:</label>
                <div>
                  <Checkbox checked={showObservations} onChange={handleShowObservationsChange}>Observations</Checkbox>
                </div>
                <div>
                  <Checkbox checked={showMCP} onChange={handleShowMCPChange}>MCP Areas</Checkbox>
        </div>
                <div>
                  <Checkbox checked={showKDE} onChange={handleShowKDEChange}>KDE Areas</Checkbox>
        </div>
      </div>

              {/* Optionally add a manual refresh button */}
              {/* <Button onClick={() => { fetchObservations(); fetchHabitatAreas(); }} loading={isLoadingObservations || isLoadingHabitats}>Refresh Data</Button> */}
            </Spin>
          </Card>
        </Col>

        {/* Map Column */}
        <Col xs={24} md={16} lg={18}>
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
            style={styles.mapContainer}
            // Access map instance via ref inside the callback if needed after ready
            whenReady={() => { 
              if (mapRef.current) {
                  setMapBounds(mapRef.current.getBounds()); 
              } 
            }} 
            ref={mapRef} // Ensure ref is assigned
            // onMoveEnd={handleMapMoveEnd} // Removed prop
        >
          <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

            {/* Render Observations using MarkerClusterGroup */}
            {showObservations && observations.length > 0 && (
          <MarkerClusterGroup>
                {observations.map((obs) => (
            <Marker
                    key={`obs-${obs.properties.id}`}
                    position={[obs.geometry.coordinates[1], obs.geometry.coordinates[0]]} // Lat, Lon for Leaflet Marker
            >
              <Popup>
                      <strong>Observation {obs.properties.id}</strong><br/>
                      Species: {obs.properties.species_name || 'N/A'} (ID: {obs.properties.species_id})<br/>
                      Date: {new Date(obs.properties.timestamp).toLocaleString()}<br/>
                      Source: {obs.properties.source || 'N/A'}<br/>
                      {obs.properties.image_url && <a href={obs.properties.image_url} target="_blank" rel="noopener noreferrer">View Image</a>}
              </Popup>
            </Marker>
                ))}
              </MarkerClusterGroup>
            )}

            {/* Render Habitat Areas using GeoJSON Layer */}
            {(showMCP || showKDE) && habitatAreas.length > 0 && (
                // Filter habitat areas based on current visibility toggles
                <GeoJSON
                    key={JSON.stringify(selectedSpeciesIds) + showMCP + showKDE} // Force re-render on filter change
                    data={{
                        type: 'FeatureCollection',
                        features: habitatAreas.filter(feature =>
                            (feature.properties.method === 'MCP' && showMCP) || (feature.properties.method === 'KDE' && showKDE)
                        )
                    } as FeatureCollection} // Ensure data is a FeatureCollection
                    style={getHabitatStyle as L.StyleFunction<HabitatAreaFeature>} // Cast style function type
                    onEachFeature={onEachHabitatFeature as L.GeoJSONOptions['onEachFeature']}
                />
            )}

        </MapContainer>
        </Col>
      </Row>
    </div>
  );
}

// --- Styles ---
const styles: { [key: string]: CSSProperties } = {
  pageContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 64px)', // Adjust if you have a header/navbar of different height
    padding: '16px',
  },
  controlsColumn: {
    height: 'calc(100vh - 64px - 32px)', // Full height minus padding
    overflowY: 'auto',
    backgroundColor: '#f0f2f5', // Light background for controls
    padding: '10px'
  },
  mapContainer: {
    height: 'calc(100vh - 64px - 32px)', // Full height minus padding
    width: '100%',
  },
  controlGroup: {
    marginBottom: '16px',
  },
  select: {
    width: '100%',
    padding: '8px',
    marginBottom: '10px',
  },
  dateInput: {
    width: 'calc(50% - 5px)',
    padding: '8px',
  },
  button: {
    padding: '10px 15px',
    cursor: 'pointer',
  },
  clearButton: {
    marginLeft: '10px',
    backgroundColor: '#ffc107',
    border: 'none',
  },
};

export default GeoDataMapPage;
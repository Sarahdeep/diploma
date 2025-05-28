import React, { useState, useEffect, useCallback } from 'react';
// Shadcn/ui components & utilities
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils"; // For conditional class names
import { AlertCircle, Info, Loader2, Search } from "lucide-react";

// Charting
import { Line } from '@ant-design/plots'; // Keep Ant Design plots for now, or replace if a Shadcn-styled alternative is preferred

// Leaflet
import { MapContainer, TileLayer, GeoJSON, FeatureGroup, Marker, Popup, LayersControl, ScaleControl } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Date handling
import { format, addDays, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns'; // Using date-fns as it's common with react-day-picker
import type { RangePickerProps } from 'antd/es/date-picker'; // For DateRangeSelector onChange prop

// Services and types
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { speciesService } from '@/services/speciesService';
import { analysisService } from '@/services/analysisService';
import type {
    AnalysisRequestParams,
    // OverlapTrendPointData, // Data directly used in API response type
    // SpeciesHabitatTimePointData, // Data directly used in API response type
    UIOverlapChartDataPoint,
    UIMapTimeSliceData,
    HabitatEvolutionApiResponse, // Keep this for response type
    OverlapTrendApiResponse,    // Keep this for response type
    SpeciesHabitatTimePointData // Keep for array type
} from '@/types/analysis';
import type { Species } from '@/types/map';

// Import the new DateRangeSelector
import DateRangeSelector from '@/components/MapControls/DateRangeSelector';

// Leaflet Icon Setup
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

const MAP_INITIAL_CENTER: LatLngExpression = [55.75, 37.61];
const MAP_INITIAL_ZOOM = 4;

const geoJsonPointToLeaflet = (point: GeoJSON.Point | null): [number, number] | null => {
  if (!point || !point.coordinates || point.coordinates.length < 2) return null;
  return [point.coordinates[1], point.coordinates[0]];
};

const AnalysisPage: React.FC = () => {
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [selectedSpeciesPair, setSelectedSpeciesPair] = useState<[number?, number?]>([undefined, undefined]);
  
  // Date range state using an array of two ISO strings or null
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  
  const [overlapChartData, setOverlapChartData] = useState<UIOverlapChartDataPoint[]>([]);
  const [allHabitatTimeData, setAllHabitatTimeData] = useState<SpeciesHabitatTimePointData[]>([]); 
  
  const [mapTimeIndex, setMapTimeIndex] = useState<number>(0);
  const [uniqueTimePoints, setUniqueTimePoints] = useState<string[]>([]); // Store as ISO strings

  const [isLoadingSpecies, setIsLoadingSpecies] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch species list
  useEffect(() => {
    const fetchSpecies = async () => {
      setIsLoadingSpecies(true);
      setError(null);
      try {
        const data = await speciesService.getAllSpecies();
        setSpeciesList(data || []);
      } catch (e: any) {
        const errMsg = e.response?.data?.detail || e.message || 'Не удалось загрузить виды';
        setError(errMsg);
        toast.error('Ошибка загрузки видов: ' + errMsg);
        setSpeciesList([]);
      }
      setIsLoadingSpecies(false);
    };
    fetchSpecies();
  }, []);

  // Perform analysis
  const performAnalysis = useCallback(async () => {
    if (!selectedSpeciesPair[0] || !selectedSpeciesPair[1] || !dateRange || !dateRange[0] || !dateRange[1]) {
      setOverlapChartData([]);
      setAllHabitatTimeData([]);
      setUniqueTimePoints([]);
      setMapTimeIndex(0);
      return;
    }

    setIsLoadingAnalysis(true);
    setError(null);

    const params: AnalysisRequestParams = {
      species1_id: selectedSpeciesPair[0]!,
      species2_id: selectedSpeciesPair[1]!,
      start_date: format(parseISO(dateRange[0]), 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx'),
      end_date: format(parseISO(dateRange[1]), 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx'),
      time_step_days: 7,
      observation_window_days: 30,
      kde_h_meters: 10000,
      kde_level_percent: 55,
      kde_grid_size: 100,
    };

    try {
      const [overlapRes, habitatRes]: [OverlapTrendApiResponse, HabitatEvolutionApiResponse] = await Promise.all([
        analysisService.getOverlapTrend(params),
        analysisService.getHabitatEvolution(params)
      ]);

      const chartData = overlapRes.data.map(d => ({
        time: format(parseISO(d.time), 'yyyy-MM-dd'),
        overlapValue: d.overlap_index,
      }));
      setOverlapChartData(chartData);
      setAllHabitatTimeData(habitatRes.data);
      
      const times = [...new Set(habitatRes.data.map(d => format(parseISO(d.time), 'yyyy-MM-dd')))].sort();
      setUniqueTimePoints(times);
      setMapTimeIndex(0);

      toast.success('Анализ завершен!');
    } catch (e: any) {
      const errMsg = e.response?.data?.detail || e.message || 'Ошибка анализа';
      setError(errMsg);
      toast.error('Ошибка анализа: ' + errMsg);
      setOverlapChartData([]);
      setAllHabitatTimeData([]);
      setUniqueTimePoints([]);
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [selectedSpeciesPair, dateRange]);

  useEffect(() => {
    // Trigger analysis only if all required inputs are present
    if (selectedSpeciesPair[0] && selectedSpeciesPair[1] && dateRange && dateRange[0] && dateRange[1]) {
        performAnalysis();
    } else {
        // Clear data if inputs are incomplete
        setOverlapChartData([]);
        setAllHabitatTimeData([]);
        setUniqueTimePoints([]);
        setMapTimeIndex(0);
    }
  }, [performAnalysis, selectedSpeciesPair, dateRange]);


  const handleSpecies1Change = (value: string) => { // Shadcn Select returns string value
    setSelectedSpeciesPair([Number(value), selectedSpeciesPair[1]]);
  };

  const handleSpecies2Change = (value: string) => { // Shadcn Select returns string value
    setSelectedSpeciesPair([selectedSpeciesPair[0], Number(value)]);
  };
  
  const handleDateRangeChange = (
    _dates: RangePickerProps['value'], // Ant Design Dayjs objects, not directly used here
    dateStrings: [string, string]
  ) => {
    if (dateStrings && dateStrings[0] && dateStrings[1]) {
        // Convert to ISO string format if not already, or ensure they are valid ISO strings
        // The antd DatePicker with dayjs usually returns "YYYY-MM-DD HH:mm:ss" or similar.
        // We need to ensure they are full ISO strings if the backend expects that (e.g., with timezone)
        // For now, assuming dateStrings are "YYYY-MM-DD" which parseISO can handle.
        // If specific time is needed, ensure dateStrings include it or append it.
        // For simplicity, we'll assume the date strings are sufficient for parseISO.
        // Consider using dayjs to format to full ISO string if backend is strict.
        setDateRange([
            startOfDay(parseISO(dateStrings[0])).toISOString(), 
            startOfDay(parseISO(dateStrings[1])).toISOString()
        ]);
    } else {
        setDateRange(null);
    }
  };

  const handleMapTimeChange = (value: number[]) => { // Shadcn Slider returns array
    setMapTimeIndex(value[0]);
  };

  const currentMapTime = uniqueTimePoints[mapTimeIndex]; // ISO string
  const displayedMapData: UIMapTimeSliceData[] = allHabitatTimeData
    .filter(d => format(parseISO(d.time), 'yyyy-MM-dd') === currentMapTime)
    .map(d => ({
      time: format(parseISO(d.time), 'yyyy-MM-dd'),
      speciesId: d.species_id,
      centroid: geoJsonPointToLeaflet(d.centroid as GeoJSON.Point | null),
      kdeArea: d.kde_polygon,
    }));

  const chartConfig = {
    data: overlapChartData,
    xField: 'time',
    yField: 'overlapValue',
    height: 300,
    smooth: true,
    xAxis: { title: { text: 'Время' } },
    yAxis: { title: { text: 'Индекс пересечения' }, min: 0, max: 1 },
    tooltip: {
      showCrosshairs: true,
      shared: true,
      items: [
        {
          channel: 'y', // Corresponds to the yField: 'overlapValue'
          valueFormatter: (value: number | null) => {
            // console.log('Item valueFormatter value:', value);
            if (value === null) return 'Нет данных';
            if (typeof value === 'number') return value.toFixed(3);
            return 'N/A';
          },
          // Optionally, customize the name if needed, though it defaults to yField or series name
          // name: 'Индекс' 
        }
      ]
    },
  };
  
  const getSpeciesColor = (speciesId: number): string => {
    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#8b5cf6', '#f97316']; // blue, red, green, purple, orange
    const index = speciesList.findIndex(s => s.id === speciesId);
    return colors[index % colors.length] || '#71717a'; // gray
  };

  const isLoading = isLoadingSpecies || isLoadingAnalysis;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Toaster richColors position="top-right" />
      <h2 className="text-2xl font-semibold tracking-tight">Анализ пересечения ареалов видов</h2>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Параметры</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSpecies ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Загрузка видов...</span>
                </div>
              ) : (
                <>
                  <Select
                    onValueChange={handleSpecies1Change}
                    value={selectedSpeciesPair[0]?.toString() || ""}
                    disabled={speciesList.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите первый вид" />
                    </SelectTrigger>
                    <SelectContent>
                      {speciesList.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    onValueChange={handleSpecies2Change}
                    value={selectedSpeciesPair[1]?.toString() || ""}
                    disabled={speciesList.length === 0 || !selectedSpeciesPair[0]}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите второй вид" />
                    </SelectTrigger>
                    <SelectContent>
                      {speciesList
                        .filter(s => s.id !== selectedSpeciesPair[0]) // Ensure species are different
                        .map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <DateRangeSelector 
                    value={dateRange} 
                    onChange={handleDateRangeChange} 
                  />
                </>
              )}
              
              {isLoadingAnalysis && (
                 <div className="flex items-center space-x-2 pt-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Выполнение анализа...</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Тренд пересечения</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingAnalysis && overlapChartData.length === 0 && (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoadingAnalysis && overlapChartData.length > 0 && <Line {...chartConfig} />}
              {!isLoadingAnalysis && overlapChartData.length === 0 && selectedSpeciesPair[0] && selectedSpeciesPair[1] && dateRange && dateRange[0] && dateRange[1] && (
                <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                  <Search className="h-12 w-12 mb-2" />
                  <p className="text-sm">Нет данных о пересечении для выбранных критериев.</p>
                  <p className="text-xs">Попробуйте другие параметры или диапазон дат.</p>
                </div>
              )}
              {(!selectedSpeciesPair[0] || !selectedSpeciesPair[1] || !dateRange || !dateRange[0] || !dateRange[1]) && !isLoadingAnalysis && (
                 <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                    <Info className="h-12 w-12 mb-2" />
                    <p className="text-sm">Выберите виды и временной интервал для просмотра тренда пересечения.</p>
                 </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Карта ареалов и эволюция во времени</CardTitle>
        </CardHeader>
        <CardContent>
        {isLoadingAnalysis && allHabitatTimeData.length === 0 && (
            <div className="h-[500px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2">Загрузка данных карты...</span>
            </div>
        )}
        {(!isLoadingAnalysis && allHabitatTimeData.length === 0 && selectedSpeciesPair[0] && selectedSpeciesPair[1] && dateRange && dateRange[0] && dateRange[1]) && (
             <div className="h-[500px] flex flex-col items-center justify-center text-muted-foreground">
                <Search className="h-16 w-16 mb-4" />
                <p>Нет данных об ареалах для отображения.</p>
                <p className="text-sm">Убедитесь, что существуют наблюдения для выбранного периода и видов.</p>
             </div>
        )}
        {((selectedSpeciesPair[0] && selectedSpeciesPair[1] && dateRange && dateRange[0] && dateRange[1]) || allHabitatTimeData.length > 0) && !isLoadingAnalysis && (
          <>
            {uniqueTimePoints.length > 0 && (
              <div className="mb-4 p-2 border rounded-md">
                <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-medium">
                        Шаг времени: <span className="font-normal">{format(parseISO(currentMapTime), "LLL dd, yyyy")}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Окно: {format(addDays(parseISO(currentMapTime), -30), "MMM dd")} - {format(parseISO(currentMapTime), "MMM dd, yyyy")}
                    </p>
                </div>
                <Slider
                  defaultValue={[0]}
                  min={0}
                  max={uniqueTimePoints.length - 1}
                  step={1}
                  value={[mapTimeIndex]}
                  onValueChange={handleMapTimeChange}
                  disabled={uniqueTimePoints.length === 0 || isLoadingAnalysis}
                  className="my-1"
                />
                 <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{format(parseISO(uniqueTimePoints[0]), "MMM dd")}</span>
                    <span>{format(parseISO(uniqueTimePoints[uniqueTimePoints.length - 1]), "MMM dd, yyyy")}</span>
                </div>
              </div>
            )}
            <MapContainer 
              center={MAP_INITIAL_CENTER} 
              zoom={MAP_INITIAL_ZOOM} 
              className="h-[500px] w-full rounded-md"
              key={uniqueTimePoints.join('-') + selectedSpeciesPair.join('-')}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          
              />
              <LayersControl position="topright">
                <LayersControl.Overlay checked name="Ареалы видов и центроиды">
                  <FeatureGroup>
                    {displayedMapData.map(data => (
                      <React.Fragment key={`${data.speciesId}-${data.time}`}>
                        {data.kdeArea && 
                          <GeoJSON 
                            data={data.kdeArea as GeoJSON.GeoJsonObject}
                            style={() => ({ 
                                color: getSpeciesColor(data.speciesId),
                                weight: 2,
                                opacity: 0.6,
                                fillColor: getSpeciesColor(data.speciesId),
                                fillOpacity: 0.2
                            })} 
                          />
                        }
                        {data.centroid && (
                          <Marker 
                            position={data.centroid} 
                            icon={L.divIcon({ 
                              className: 'custom-div-icon', // Can style this class globally if needed
                              html: `<div style="background-color:${getSpeciesColor(data.speciesId)};width:12px;height:12px;border-radius:50%;border:2px solid white; box-shadow: 0 0 0 1px ${getSpeciesColor(data.speciesId)};"></div>`,
                              iconSize: [12, 12],
                              iconAnchor: [6,6] 
                            })}
                          >
                            <Popup>
                              <span className="font-semibold">{speciesList.find(s => s.id === data.speciesId)?.name || data.speciesId}</span><br />
                              Время: {data.time}<br/>
                              Центроид: {data.centroid[0].toFixed(4)}, {data.centroid[1].toFixed(4)}
                            </Popup>
                          </Marker>
                        )}
                      </React.Fragment>
                    ))}
                  </FeatureGroup>
                </LayersControl.Overlay>
              </LayersControl>
              <ScaleControl />
            </MapContainer>
            </>
          )}
          {(!selectedSpeciesPair[0] || !selectedSpeciesPair[1] || !dateRange || !dateRange[0] || !dateRange[1]) && !isLoadingAnalysis && allHabitatTimeData.length === 0 && (
             <div className="h-[500px] flex flex-col items-center justify-center text-muted-foreground">
                <Info className="h-16 w-16 mb-4" />
                <p>Выберите пару видов и временной интервал для просмотра данных карты.</p>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalysisPage; 
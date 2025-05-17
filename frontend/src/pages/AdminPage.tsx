import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- UI Components ---
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePickerWithRangeAlternative } from '@/components/ui/daterangepicker-alt';
import { Toaster } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
// --- Icons ---
import { UploadCloud, Trash2, Settings, MapPin, Pencil } from 'lucide-react';
// --- Form Handling ---
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';
// --- Map Imports (Assuming react-leaflet & leaflet-geoman) ---
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { EditObservationModal } from '@/components/modals/EditObservationModal';
import Papa from 'papaparse'; // For CSV header parsing

// Import MarkerClusterGroup and its CSS
import MarkerClusterGroup from 'react-leaflet-markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// --- Services ---
import { speciesService } from '@/services/speciesService';
import { observationService } from '@/services/observationService'; // Ensure this import is present
import type { Species, ObservationRead, SpeciesCheckResponse, DBSpeciesBase, Point as GeoJSONPoint } from '@/types/api';
import type { ObservationFilterParams } from '@/types/api';

// --- Mock API Functions ---
// const mockApi = { ... }; // Removing the entire mockApi object

// --- Validation Schemas ---
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_ARCHIVE_TYPES = ['application/zip', 'application/x-zip-compressed'];
const ALLOWED_CSV_TYPES = ['text/csv'];

const datasetUploadSchema = z.object({
  datasetName: z.string().min(1, { message: "Название набора данных обязательно." }),
  datasetDescription: z.string().optional(), // Description can be optional
  archiveFile: z.instanceof(FileList)
    .refine(f => f?.length === 1, 'Необходим один архивный файл.')
    .refine(f => f?.[0]?.size <= MAX_FILE_SIZE, `Максимальный размер архива 500MB.`)
    .refine(f => ALLOWED_ARCHIVE_TYPES.includes(f?.[0]?.type), 'Неподдерживаемый тип архива. Используйте .zip'),
  csvFile: z.instanceof(FileList)
    .refine(f => f?.length === 1, 'Необходим один CSV файл.')
    .refine(f => ALLOWED_CSV_TYPES.includes(f?.[0]?.type), 'Неподдерживаемый тип файла. Используйте .csv'),
  columnMappings: z.object({
    filename: z.string().min(1, { message: "Необходимо сопоставить колонку для имени файла." }),
    species: z.string().min(1, { message: "Необходимо сопоставить колонку для вида." }),
  }),
  speciesMapping: z.record(z.string(), z.union([z.string(), z.object({ name: z.string(), createNew: z.boolean() })]))
    .optional(), // Species mapping might not be needed if all species match
});

const deleteByTimeSchema = z.object({
    dateRange: z.object({
        from: z.date().optional(),
        to: z.date().optional(),
    }).refine(data => !data.from || !data.to || data.from <= data.to, {
        message: "Начальная дата не может быть позже конечной.",
        path: ["from"],
    }),
});

const deleteBySpeciesSchema = z.object({
  species_id: z.string().min(1, { message: 'Необходимо выбрать вид.' }),
});

// Schema expects a GeoJSON-like object (or any object for simplicity now)
const deleteByAreaSchema = z.object({
   area: z.any().refine(val => typeof val === 'object' && val !== null && Object.keys(val).length > 0, { message: 'Необходимо нарисовать область на карте.' })
});

type DatasetUploadForm = z.infer<typeof datasetUploadSchema>;
type DeleteByTimeForm = z.infer<typeof deleteByTimeSchema>;
type DeleteBySpeciesForm = z.infer<typeof deleteBySpeciesSchema>;
type DeleteByAreaForm = z.infer<typeof deleteByAreaSchema>;

// --- Map Component with Drawing ---
interface DeletionMapProps {
    locations: ObservationRead[];
    selectedArea?: object; // GeoJSON geometry
    onAreaSelect: (geometry: object | null) => void;
    disabled?: boolean;
}

const DeletionMapComponentInternal: React.FC<DeletionMapProps> = ({ locations, selectedArea, onAreaSelect, disabled }) => {
    const mapRef = useRef<L.Map>(null);
    const drawnLayerRef = useRef<L.Layer | null>(null);

    console.log('[DeletionMapComponentInternal] Rendering. Disabled:', disabled, 'SelectedArea:', !!selectedArea, 'Locations count:', locations?.length); // DEBUG

    const MapEvents = () => {
        const map = useMap();
    
        useEffect(() => {
            // Cast map to include the 'pm' property from leaflet-geoman
            const mapWithGeoman = map as L.Map & { pm: any };
    
            if (mapWithGeoman && !disabled) {
                 // Initialize Geoman controls
                 if (!mapWithGeoman.pm) {
                    // Handle case where pm might not be initialized (though unlikely if imported)
                    console.error("Leaflet-Geoman 'pm' is not initialized on the map instance.");
                    return;
                 }
    
                 // Check if controls are already added to prevent duplicates if effect re-runs
                 if (!mapWithGeoman.pm.controlsVisible()) {
                     mapWithGeoman.pm.addControls({
                        position: 'topleft',
                        drawCircle: false,
                        drawMarker: false,
                        drawCircleMarker: false,
                        drawPolyline: false,
                        drawText: false,
                        cutPolygon: false,
                        rotateMode: false,
                        drawRectangle: true, // Allow rectangle
                        drawPolygon: true,   // Allow polygon
                        editMode: true,
                        dragMode: true,
                        removalMode: true,
                    });
                 }
    
                 // Clear existing shape if selectedArea is cleared externally
                 if (!selectedArea && drawnLayerRef.current) {
                    mapWithGeoman.removeLayer(drawnLayerRef.current);
                    drawnLayerRef.current = null;
                 }
    
    
                 // Event for when a shape is created
                 const handlePmCreate = (e: any) => {
                    // Remove the previous shape if it exists
                    if (drawnLayerRef.current) {
                         mapWithGeoman.removeLayer(drawnLayerRef.current);
                    }
                    // Add the new shape
                    drawnLayerRef.current = e.layer;
                    mapWithGeoman.pm.enableGlobalEditMode();
                    // Get GeoJSON and update form state
                    onAreaSelect(e.layer.toGeoJSON().geometry);
    
                    // Only allow one shape at a time
                    mapWithGeoman.pm.disableDraw(); // Disable further drawing until cleared or button clicked
                 };
    
                 // Event for when a shape is edited
                 const handlePmEdit = (e: any) => {
                    if (e.layer && drawnLayerRef.current === e.layer) {
                         // Get updated GeoJSON and update form state
                         onAreaSelect(e.layer.toGeoJSON().geometry);
                    }
                 };
    
                 // Event for when a shape is removed using Geoman's tool
                 const handlePmRemove = (e: any) => {
                    if (drawnLayerRef.current === e.layer) {
                         drawnLayerRef.current = null;
                         onAreaSelect(null); // Clear form state
                         // Re-enable drawing
                         mapWithGeoman.pm.enableDraw('Polygon');
                         mapWithGeoman.pm.enableDraw('Rectangle');
                    }
                 };
    
                 // Add event listeners
                 mapWithGeoman.on('pm:create', handlePmCreate);
                 mapWithGeoman.on('pm:edit', handlePmEdit);
                 mapWithGeoman.on('pm:remove', handlePmRemove);
    
    
                 // Cleanup event listeners on component unmount or map change
                 return () => {
                     mapWithGeoman.off('pm:create', handlePmCreate);
                     mapWithGeoman.off('pm:edit', handlePmEdit);
                     mapWithGeoman.off('pm:remove', handlePmRemove);
                     // Optionally remove controls if the component unmounts entirely
                     // if (mapWithGeoman.pm && mapWithGeoman.pm.controlsVisible()) {
                     //    mapWithGeoman.pm.removeControls();
                     // }
                 };
            } else if (mapWithGeoman && disabled) {
                 // Disable Geoman controls if the form is submitting/disabled
                 if (mapWithGeoman.pm) {
                     mapWithGeoman.pm.disableDraw();
                     mapWithGeoman.pm.disableGlobalEditMode();
                     mapWithGeoman.pm.disableGlobalRemovalMode(); // Corrected method name
                 }
            }
        }, [map, onAreaSelect, disabled, selectedArea]); // Re-run if dependencies change
    
        return null; // This component doesn't render anything itself
    };
    
    const validLocations = locations.filter(loc => { // Enhanced filter for clarity
        const isValid = loc && 
                        loc.location !== null && 
                        typeof loc.location === 'object' && 
                        loc.location.type === "Point" &&
                        Array.isArray(loc.location.coordinates) && 
                        loc.location.coordinates.length === 2 &&
                        typeof loc.location.coordinates[0] === 'number' &&
                        typeof loc.location.coordinates[1] === 'number';
        // if (loc && !isValid && loc.location) { // Log invalid locations structures if needed
        //   console.log('[DeletionMapComponent] Invalid location object structure:', JSON.stringify(loc.location, null, 2));
        // }
        return isValid;
    });
    console.log('[DeletionMapComponent] Filtered validLocations count:', validLocations.length); // DEBUG
    if (validLocations.length > 0) {
        console.log('[DeletionMapComponent] First valid location:', JSON.stringify(validLocations[0], null, 2)); // DEBUG
    }
    
    const center: LatLngExpression = validLocations.length > 0 && validLocations[0].location
        ? [validLocations[0].location.coordinates[1], validLocations[0].location.coordinates[0]]
        : [55.751244, 37.618423]; // Default to Moscow if no locations
    console.log('[DeletionMapComponent] Map center:', JSON.stringify(center)); // DEBUG

    return (
        <MapContainer id="deletion-map-container-stable" key="deletion-map-stable" center={center} zoom={10} style={{ height: '400px', width: '100%' }} ref={mapRef} attributionControl={false}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {/* Wrap Markers with MarkerClusterGroup */}
            <MarkerClusterGroup>
                {validLocations.map(loc => (
                    <Marker key={loc.id} position={[loc.location!.coordinates[1], loc.location!.coordinates[0]]}>
                         <Popup>
                             ID: {loc.id}<br />Species: {loc.species.name}
                         </Popup>
                    </Marker>
                ))}
            </MarkerClusterGroup>
            <MapEvents />
        </MapContainer>
    );
};

// Custom comparison function for React.memo
const areDeletionMapPropsEqual = (prevProps: DeletionMapProps, nextProps: DeletionMapProps) => {
  const locationsAreEqual = prevProps.locations === nextProps.locations; // Strict equality for the array reference
  const selectedAreaAreEqual = prevProps.selectedArea === nextProps.selectedArea; // Strict equality for the object reference
  const disabledAreEqual = prevProps.disabled === nextProps.disabled;
  // onAreaSelect from react-hook-form should be stable, so not explicitly checking it.

  // For debugging, you can uncomment these lines:
  // if (prevProps.disabled !== nextProps.disabled) console.log('[areDeletionMapPropsEqual] Disabled changed');
  // if (prevProps.selectedArea !== nextProps.selectedArea) console.log('[areDeletionMapPropsEqual] SelectedArea changed');
  // if (prevProps.locations !== nextProps.locations) console.log('[areDeletionMapPropsEqual] Locations changed');
  
  return locationsAreEqual && selectedAreaAreEqual && disabledAreEqual;
};

const DeletionMapComponent = React.memo(DeletionMapComponentInternal, areDeletionMapPropsEqual);


// --- Main Admin Page Component ---
export default function AdminPage() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [observationLocations, setObservationLocations] = useState<ObservationRead[]>([]);
  const [loadingFilteredObservations, setLoadingFilteredObservations] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // Single state for all delete operations
  const [selectedObservation, setSelectedObservation] = useState<ObservationRead | null>(null); // Typed state
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [csvFileForCheck, setCsvFileForCheck] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [columnMappings, setColumnMappings] = useState<{ filename: string; species: string; }>({
    filename: '',
    species: '', // Initialize species to empty string for consistent placeholder behavior
  });
  const [showSpeciesMapping, setShowSpeciesMapping] = useState(false);
  const [unmatchedSpecies, setUnmatchedSpecies] = useState<string[]>([]);
  const [speciesUserMappings, setSpeciesUserMappings] = useState<Record<string, string | { name: string; createNew: boolean }>>({});
  const [isCheckingSpecies, setIsCheckingSpecies] = useState(false);
  const [dbSpeciesForMapping, setDbSpeciesForMapping] = useState<DBSpeciesBase[]>([]);
  const [isColumnMappingConfirmed, setIsColumnMappingConfirmed] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default items per page
  const [totalPages, setTotalPages] = useState(0); // New state for total pages

  // Filtering state
  const [filterSpecies, setFilterSpecies] = useState('');
  const [filterTimestamp, setFilterTimestamp] = useState<DateRange | undefined>(undefined);
  const [filterConfidence, setFilterConfidence] = useState(0); // Added confidence filter state (0 to 1)

  const [pageInput, setPageInput] = useState<string>(""); // State for page input

  const ALL_SPECIES_FILTER_VALUE = "ALL_SPECIES"; // Define constant for "all species"

  // New state for all observation locations for the deletion map
  const [allObservationMapData, setAllObservationMapData] = useState<ObservationRead[]>([]);
  const [loadingAllMapData, setLoadingAllMapData] = useState(false);

  // Define fetchLocations here and wrap in useCallback
  // Removing the old fetchLocations and its useEffect as its functionality is covered or replaced
  /*
  const fetchLocations = useCallback(async () => {
      setLoadingFilteredObservations(true);
      try {
          const locationsData = await observationService.getAllObservations();
          setObservationLocations(locationsData);
      } catch (error) {
          console.error("Error fetching locations:", error);
          toast.error("Ошибка загрузки локаций наблюдений");
      } finally {
          setLoadingFilteredObservations(false);
      }
  }, []); 

  useEffect(() => {
    fetchLocations(); 
  }, [fetchLocations]);
  */

  const uploadForm = useForm<z.infer<typeof datasetUploadSchema>>({
    resolver: zodResolver(datasetUploadSchema),
    defaultValues: {
      datasetName: "",
      datasetDescription: "",
      archiveFile: new DataTransfer().files as FileList,
      csvFile: new DataTransfer().files as FileList,
      columnMappings: { filename: '', species: '' },
      speciesMapping: {},
    },
  });

  const deleteTimeForm = useForm<DeleteByTimeForm>({
    resolver: zodResolver(deleteByTimeSchema),
    defaultValues: {
      dateRange: { from: undefined, to: undefined },
    },
  });

  // Watch for changes in the dateRange field for immediate UI update or debugging
  const watchedDateRange = deleteTimeForm.watch("dateRange");

  const deleteSpeciesForm = useForm<DeleteBySpeciesForm>({
    resolver: zodResolver(deleteBySpeciesSchema),
    defaultValues: { species_id: '' }
  });

  const deleteAreaForm = useForm<DeleteByAreaForm>({
    resolver: zodResolver(deleteByAreaSchema),
    mode: 'onChange',
    defaultValues: {
        area: {},
    },
  });


  // Fetch Species
  useEffect(() => {
    async function fetchSpeciesData() {
      setLoadingSpecies(true);
      try {
        const data = await speciesService.getAllSpecies();
        setSpecies(data);
      } catch (error) {
          console.error("Error fetching species:", error);
          toast.error('Ошибка загрузки списка видов');
      } finally {
        setLoadingSpecies(false);
      }
    }
    fetchSpeciesData();
  }, []);

   // Fetch Observation Locations for the map ON MOUNT
  useEffect(() => {
    // Call the useCallback version
  }, []); // Add fetchLocations to dependency array

  // Helper to parse CSV headers
  const parseCsvHeaders = (file: File, callback: (headers: string[]) => void) => {
    Papa.parse(file as any, { // Cast file to any
      preview: 1, // Only parse the first row for headers
      complete: (results: Papa.ParseResult<unknown>) => { // Typed results
        if (results.data && results.data.length > 0 && Array.isArray(results.data[0])) {
          // Assuming the first row of data is an array of strings (headers)
          callback(results.data[0] as string[]);
        } else {
          callback([]);
        }
      },
      error: (error: Papa.ParseError) => { // Typed error
        console.error("Error parsing CSV headers:", error);
        toast.error("Не удалось прочитать заголовки CSV файла.");
        callback([]);
      }
    } as any); // Cast the config object to any
  };

  const handleCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;

    // Reset all dependent states immediately when the input changes
    setCsvFileForCheck(null);
    setCsvHeaders([]);
    setShowColumnMapping(false);
    setColumnMappings({ filename: '', species: '' }); // Reset species to empty string here too
    setShowSpeciesMapping(false);
    setUnmatchedSpecies([]);
    setSpeciesUserMappings({});
    setIsColumnMappingConfirmed(false); // Reset confirmation when CSV changes
    // Also clear relevant form values that depend on the CSV content
    uploadForm.setValue('columnMappings', { filename: '', species: '' });
    uploadForm.setValue('speciesMapping', {});


    if (files && files.length > 0) {
      const file = files[0];
      uploadForm.setValue('csvFile', files as FileList);
      setCsvFileForCheck(file);

      parseCsvHeaders(file, (headers) => {
        setCsvHeaders(headers);
        if (headers.length > 0) {
          const findHeader = (possibleNames: string[]) => headers.find(h => possibleNames.some(pn => h.toLowerCase().includes(pn.toLowerCase()))) || '';
          const autoFilename = findHeader(['filename', 'file_name', 'файл', 'имя файла']);
          const autoSpecies = findHeader(['species', 'вид', 'sp_name']);
          
          const newColumnMappings = {
            filename: autoFilename,
            species: autoSpecies, // Use autoSpecies directly (can be '')
          };
          setColumnMappings(newColumnMappings);
          uploadForm.setValue('columnMappings', newColumnMappings);

          setShowColumnMapping(true);
          toast.info("Пожалуйста, проверьте и подтвердите сопоставление колонок CSV для имени файла и вида.");
        } else {
          setShowColumnMapping(false);
          toast.error("Не удалось определить заголовки в CSV файле или файл пуст.");
        }
      });
    } else {
      uploadForm.setValue('csvFile', new DataTransfer().files as FileList);
      setShowColumnMapping(false);
    }
  };
  
  const handleColumnMappingChange = (fieldType: keyof typeof columnMappings, selectedHeader: string) => {
    const newMappings = { ...columnMappings, [fieldType]: selectedHeader };
    setColumnMappings(newMappings);
    uploadForm.setValue('columnMappings', newMappings, { shouldValidate: true });
  };

  const handleConfirmColumnsAndCheckSpecies = async () => {
    if (!columnMappings.filename || !columnMappings.species) {
        toast.error("Пожалуйста, сопоставьте колонки CSV для имени файла и вида.");
        return;
    }
    if (!csvFileForCheck) {
        toast.error("CSV файл не выбран.");
        return;
    }

    setIsCheckingSpecies(true);
    setShowSpeciesMapping(false);
    setUnmatchedSpecies([]);
    setDbSpeciesForMapping([]);
    setSpeciesUserMappings({});
    setIsColumnMappingConfirmed(true); // Set confirmation to true

    const formData = new FormData();
    formData.append('csv_file', csvFileForCheck);
    formData.append('species_column_name', columnMappings.species);

    try {
      const response = await fetch('/api/v1/observations/check_species_in_csv', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to check CSV for species.' }));
        throw new Error(errorData.detail);
      }
      const result: SpeciesCheckResponse = await response.json();
      setDbSpeciesForMapping(result.db_species);
      if (result.unmatched_csv_species && result.unmatched_csv_species.length > 0) {
        setUnmatchedSpecies(result.unmatched_csv_species);
        const initialMappings: Record<string, string> = {}; 
        result.unmatched_csv_species.forEach((spName: string) => { initialMappings[spName] = 'CREATE_NEW'; });
        setSpeciesUserMappings(initialMappings);
        setShowSpeciesMapping(true);
        toast.info(`Обнаружено ${result.unmatched_csv_species.length} новых названий видов. Сопоставьте их ниже.`);
      } else {
        toast.success('Все виды из CSV уже присутствуют в базе данных.');
        setShowSpeciesMapping(false); 
      }
    } catch (error: any) {
      console.error("Error checking CSV species:", error);
      toast.error(error.message || 'Ошибка при проверке видов в CSV.');
      setShowSpeciesMapping(false);
    } finally {
      setIsCheckingSpecies(false);
    }
  };

  const handleSpeciesMappingChange = (csvSpeciesName: string, selectedValue: string) => {
    setSpeciesUserMappings(prev => ({
      ...prev,
      [csvSpeciesName]: selectedValue, 
    }));
  };

  const onUploadSubmit = async (values: z.infer<typeof datasetUploadSchema>) => {
    console.log('onUploadSubmit triggered. Values:', values, 'csvFileForCheck:', csvFileForCheck, 'columnMappings:', columnMappings);
    setIsUploading(true);
    const fd = new FormData();

    if (!values.archiveFile?.[0] || !csvFileForCheck) {
        toast.error("Архив и CSV файл должны быть выбраны.");
        setIsUploading(false);
        return;
    }
    if (!columnMappings.filename || !columnMappings.species) {
        toast.error("Сопоставление колонок CSV для имени файла и вида не завершено.");
        setIsUploading(false);
        return;
    }

    fd.append('archive', values.archiveFile[0]);
    fd.append('csv', csvFileForCheck);
    fd.append('species_map', JSON.stringify(speciesUserMappings));
    
    fd.append('filename_column', columnMappings.filename);
    fd.append('species_column', columnMappings.species);

    try {
      const response = await fetch('/api/v1/observations/upload_dataset', {
        method: 'POST',
        body: fd,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          detail: `Dataset upload failed: ${response.status} ${response.statusText || 'Unknown error'}` 
        }));
        throw new Error(errorData.detail || `Dataset upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      toast.success(result.message || 'Процесс загрузки датасета (виды только по карте, Гео/Время из EXIF) успешно запущен!');
      uploadForm.reset();
      setCsvFileForCheck(null); setShowColumnMapping(false); setCsvHeaders([]);
      setShowSpeciesMapping(false); setSpeciesUserMappings({}); setUnmatchedSpecies([]);
      // Refresh both lists after successful upload
      fetchObservations();
      fetchAllObservationsForMap();

    } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error.message || 'Непредвиденная ошибка при загрузке датасета.');
    } finally {
      setIsUploading(false);
    }
  };

  const onDeleteByTime = async (values: DeleteByTimeForm) => {
      setIsDeleting(true);
      try {
          if (!values.dateRange?.from || !values.dateRange?.to) {
              toast.error("Необходимо выбрать диапазон дат.");
              setIsDeleting(false);
              return;
          }
          // console.warn('Delete by time functionality not connected to backend yet.', values);
          // toast.info('Функция удаления по времени пока не подключена к бэкенду.');
          const result = await observationService.deleteObservationsByTimeRange(
              values.dateRange.from.toISOString(),
              values.dateRange.to.toISOString()
          );
          if (result) {
              toast.success(result.message || `Удалено наблюдений: ${result.deleted_count}`);
              deleteTimeForm.reset();
              fetchObservations(); // Refresh list after deletion
              fetchAllObservationsForMap(); // Refresh map data
          } else {
              toast.error('Не удалось удалить наблюдения по времени или ответ от сервера пуст.');
          }
      } catch (error: any) {
          console.error("Delete by time error:", error);
          toast.error(error.message || 'Непредвиденная ошибка при удалении по времени');
      } finally {
          setIsDeleting(false);
      }
  };


  const onDeleteBySpecies = async (values: DeleteBySpeciesForm) => {
    setIsDeleting(true);
    try {
      // console.warn('Delete by species functionality not connected to backend yet.', values);
      // toast.info('Функция удаления по виду пока не подключена к бэкенду.');
      const speciesId = parseInt(values.species_id, 10);
      if (isNaN(speciesId)) {
          toast.error("Некорректный ID вида.");
          setIsDeleting(false);
          return;
      }
      const result = await observationService.deleteObservationsBySpecies(speciesId);
      if (result) {
        toast.success(result.message || `Удалено наблюдений для вида: ${result.deleted_count}`);
        deleteSpeciesForm.reset();
        fetchObservations(); // Refresh list after deletion
        fetchAllObservationsForMap(); // Refresh map data
      } else {
        toast.error('Не удалось удалить наблюдения по виду или ответ от сервера пуст.');
      }
    } catch (error: any) {
        console.error("Delete by species error:", error);
        toast.error(error.message || 'Непредвиденная ошибка при удалении по виду');
    } finally {
      setIsDeleting(false);
    }
  };

  const onDeleteByArea = async (values: DeleteByAreaForm) => {
    setIsDeleting(true);
    try {
      // console.warn('Delete by area functionality not connected to backend yet.', values);
      // toast.info('Функция удаления по области пока не подключена к бэкенду.');
      if (!values.area || Object.keys(values.area).length === 0) {
        toast.error("Необходимо нарисовать область на карте для удаления.");
        setIsDeleting(false);
        return;
      }
      const result = await observationService.deleteObservationsByArea(values.area);
      if (result) {
        toast.success(result.message || `Удалено наблюдений: ${result.deleted_count}`);
        deleteAreaForm.reset(); // Reset the form, which should clear the area in the form state
        fetchObservations(); // Refresh filtered list
        fetchAllObservationsForMap(); // Refresh map data
      } else {
        toast.error('Не удалось удалить наблюдения по области или ответ от сервера пуст.');
      }
    } catch (error: any) {
        console.error("Delete by area error:", error);
        toast.error(error.message || 'Непредвиденная ошибка при удалении по области');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditClick = (observation: ObservationRead) => {
    setSelectedObservation(observation);
    setIsEditingModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditingModalOpen(false);
    setSelectedObservation(null);
  };

  const handleSaveEdit = async (observationId: number, newSpeciesId: number) => {
    setIsDeleting(true); 
    try {
        const updatedObservation = await observationService.updateObservation(observationId, { species_id: newSpeciesId });
        
        if (updatedObservation) {
            toast.success(`Вид для наблюдения ${observationId} успешно обновлен.`);
            handleCloseEditModal();
            fetchObservations(); // Changed from fetchLocations to fetchObservations
        } else {
            toast.error(`Не удалось обновить вид для наблюдения ${observationId}.`);
        }
    } catch (error: any) {
        console.error("Update observation error:", error);
        toast.error(error.message || 'Непредвиденная ошибка при обновлении наблюдения');
    } finally {
        setIsDeleting(false); 
    }
  };

  const handleDeleteObservationClick = async (observation: ObservationRead) => {
    setIsDeleting(true);
    try {
      // Call the existing deleteObservation method
      const deletedObservation = await observationService.deleteObservation(observation.id);
      
      if (deletedObservation) { // If deletion was successful, backend returns the deleted observation
        toast.success(`Наблюдение ID: ${observation.id} (${observation.species.name}) успешно удалено.`);
        fetchObservations();
        fetchAllObservationsForMap();
      } else {
        // This case might occur if the backend returns null on successful deletion (204 No Content handled by handleResponse) 
        // or if handleResponse itself throws an error for non-OK responses, which is caught below.
        // If handleResponse returns null for a 204, and that's considered success, this logic might need adjustment.
        // However, the current signature of deleteObservation is Promise<ObservationRead | null>.
        // A null here likely means something went wrong that wasn't an outright HTTP error (e.g., backend logic prevented deletion but returned 200 OK with null body).
        // More typically, a failed deletion would be an HTTP error caught by the catch block.
        toast.error(`Не удалось удалить наблюдение ID: ${observation.id}. Ответ от сервера был пустым, но не было ошибки HTTP.`);
      }
    } catch (error: any) {
      console.error("Error deleting observation:", error);
      toast.error(error.message || `Ошибка при удалении наблюдения ID: ${observation.id}.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Log state variables relevant to the upload button's disabled status
  console.log('AdminPage render state:', { isUploading, isColumnMappingConfirmed, showColumnMapping });

  // Function to fetch observations for the filtered list
  const fetchObservations = useCallback(async () => {
    setLoadingFilteredObservations(true); // Use renamed state
    try {
      const filters: ObservationFilterParams = {};
      if (filterSpecies && filterSpecies !== ALL_SPECIES_FILTER_VALUE) {
        filters.species_id = parseInt(filterSpecies, 10);
      }
      if (filterTimestamp?.from) filters.start_date = filterTimestamp.from.toISOString();
      if (filterTimestamp?.to) filters.end_date = filterTimestamp.to.toISOString();
      if (filterConfidence > 0) filters.min_confidence = filterConfidence; // Added confidence filter logic

      const response = await observationService.getAllObservations(
        Object.keys(filters).length > 0 ? filters : undefined,
        (currentPage - 1) * itemsPerPage,
        itemsPerPage
      );

      if (response && Array.isArray(response.observations)) {
        setObservationLocations(response.observations);
        setTotalPages(Math.ceil(response.total_count / itemsPerPage));
      } else {
        setObservationLocations([]);
        setTotalPages(0);
        console.warn("Observations data is not in the expected format:", response);
      }
    } catch (error) {
      console.error("Failed to fetch observation locations:", error);
      toast.error('Не удалось загрузить точки наблюдений.');
      setObservationLocations([]); // Set to empty array on error
      setTotalPages(0);
    } finally {
      setLoadingFilteredObservations(false); // Use renamed state
    }
  }, [currentPage, itemsPerPage, filterSpecies, filterTimestamp, filterConfidence]); // Updated dependencies

  // New function to fetch all observations for the deletion map
  const fetchAllObservationsForMap = useCallback(async () => {
    setLoadingAllMapData(true);
    try {
      // Fetch all observations - assuming a large limit or a specific backend implementation
      // For now, fetching with a limit of 10000 as a placeholder for "all"
      const allData = await observationService.getAllObservations(undefined, 0, 10000);
      console.log('[AdminPage] fetchAllObservationsForMap - raw response from service:', JSON.stringify(allData, null, 2)); // DEBUG
      if (allData && Array.isArray(allData.observations)) {
        console.log('[AdminPage] fetchAllObservationsForMap - setting allObservationMapData with count:', allData.observations.length); // DEBUG
        setAllObservationMapData(allData.observations);
      } else {
        setAllObservationMapData([]);
        console.warn("[AdminPage] fetchAllObservationsForMap - All map observations data is not in the expected array format or observations array is missing:", JSON.stringify(allData, null, 2)); // DEBUG
      }
    } catch (error) {
      console.error("Failed to fetch all observation locations for map:", error);
      toast.error('Не удалось загрузить все точки наблюдений для карты.');
      setAllObservationMapData([]);
    } finally {
      setLoadingAllMapData(false);
    }
  }, []);

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  // Fetch all map data on component mount
  useEffect(() => {
    fetchAllObservationsForMap();
  }, [fetchAllObservationsForMap]);

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Toaster richColors />

      <h1 className="text-3xl font-bold mb-6">Панель администрирования</h1>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload"><UploadCloud className="mr-2 h-4 w-4" />Загрузка датасета</TabsTrigger>
          <TabsTrigger value="manage"><Settings className="mr-2 h-4 w-4" />Управление наблюдениями</TabsTrigger>
        </TabsList>

        {/* --- Upload Tab --- */}
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Загрузить новый датасет</CardTitle>
              <CardDescription>
                Загрузите zip-архив с изображениями (.jpg, .jpeg) и соответствующий CSV-файл с метаданными.
                CSV должен содержать колонки 'filename', 'species', 'latitude', 'longitude', 'timestamp'.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...uploadForm}>
                <form 
                  onSubmit={uploadForm.handleSubmit(
                    onUploadSubmit, // onValid: This is your existing submit handler
                    (errors) => { // onInvalid: This callback receives the errors if validation fails
                      console.error('react-hook-form validation errors:', errors);
                    }
                  )}
                  className="space-y-6"
                >
                  <FormField
                    control={uploadForm.control}
                    name="datasetName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название набора данных</FormLabel>
                        <FormControl>
                          <Input placeholder="Введите название датасета" {...field} disabled={isUploading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={uploadForm.control}
                    name="datasetDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Описание набора данных (опционально)</FormLabel>
                        <FormControl>
                          <Input placeholder="Введите описание" {...field} disabled={isUploading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* Archive File Input - Using register directly */}
                  <FormItem>
                    <FormLabel>Zip-архив с изображениями</FormLabel>
                    <Input
                      type="file"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      disabled={isUploading}
                      {...uploadForm.register("archiveFile")}
                     />
                    {/* Manually render FormMessage for register errors */}
                    <FormMessage>
                        {uploadForm.formState.errors.archiveFile?.message?.toString()}
                    </FormMessage>
                  </FormItem>

                  {/* CSV File Input - Using register directly */}
                  <FormItem>
                    <FormLabel>CSV-файл с метаданными</FormLabel>
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={isUploading || isCheckingSpecies}
                      onChange={handleCsvFileChange}
                    />
                    {/* Manually render FormMessage for register errors */}
                    <FormMessage>
                        {uploadForm.formState.errors.csvFile?.message?.toString()}
                    </FormMessage>
                  </FormItem>

                  {showColumnMapping && (
                    <Card className="mt-4">
                      <CardHeader><CardTitle>Сопоставление колонок CSV</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">Выберите, какие колонки из вашего CSV файла соответствуют имени файла изображения и названию вида. Геоданные и время будут извлечены из EXIF.</p>
                        {[ 
                          {label: 'Имя файла изображения', field: 'filename' as keyof typeof columnMappings},
                          {label: 'Название вида', field: 'species' as keyof typeof columnMappings},
                        ].map(mapItem => (
                          <div key={mapItem.field} className="grid grid-cols-3 items-center gap-4">
                            <Label>{mapItem.label}</Label>
                            <Select 
                              onValueChange={(value) => handleColumnMappingChange(mapItem.field, value)}
                              value={columnMappings[mapItem.field]} 
                              disabled={csvHeaders.length === 0 || isColumnMappingConfirmed}
                            >
                              <SelectTrigger className="col-span-2">
                                <SelectValue placeholder="Выберите колонку..." />
                              </SelectTrigger>
                              <SelectContent>
                                {csvHeaders.map(header => (
                                  <SelectItem key={header} value={header}>{header}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                        <Button onClick={handleConfirmColumnsAndCheckSpecies} disabled={isCheckingSpecies || !columnMappings.filename || !columnMappings.species || isColumnMappingConfirmed}>
                          {isCheckingSpecies ? 'Проверка видов...' : 'Подтвердить колонки и проверить виды'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {showSpeciesMapping && (
                    <Card className="mt-4">
                      <CardHeader><CardTitle>Сопоставление видов</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Следующие виды из вашего CSV-файла не найдены в базе данных. Пожалуйста, сопоставьте их или выберите "Создать новый вид".
                        </p>
                        {unmatchedSpecies.map(csvName => (
                          <div key={csvName} className="grid grid-cols-3 items-center gap-4">
                            <Label className="truncate" title={csvName}>{csvName}</Label>
                            <Select 
                              onValueChange={(value) => handleSpeciesMappingChange(csvName, value)}
                              defaultValue={String(speciesUserMappings[csvName] || 'CREATE_NEW')}
                            >
                              <SelectTrigger className="col-span-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CREATE_NEW">Создать новый вид: "{csvName}"</SelectItem>
                                {dbSpeciesForMapping.map(dbSp => (
                                  <SelectItem key={dbSp.id} value={String(dbSp.id)}>{dbSp.name} (ID: {dbSp.id})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Button type="submit" disabled={isUploading || !isColumnMappingConfirmed} className="w-full">
                    {isUploading ? 'Загрузка...' : <><UploadCloud className="mr-2 h-4 w-4" /> Загрузить</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- New Manage Observations Tab --- */}
        <TabsContent value="manage">
          <div className="space-y-6">
            {/* Section for Deletion Operations */}
            <Card>
              <CardHeader>
                <CardTitle>Операции удаления наблюдений</CardTitle>
                <CardDescription>Удаление наблюдений по различным критериям.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Delete by Time Card */}
                  <Card>
                    <CardHeader>
                        <CardTitle>Удалить по времени</CardTitle>
                        <CardDescription>Удалить наблюдения в указанном диапазоне дат.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Form {...deleteTimeForm}>
                           <form onSubmit={deleteTimeForm.handleSubmit(onDeleteByTime)} className="space-y-4">
                                <FormField
                                    control={deleteTimeForm.control}
                                    name="dateRange"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Диапазон дат</FormLabel>
                                            <FormDescription>
                                                Выберите диапазон дат для удаления наблюдений.
                                            </FormDescription>
                                            <FormControl>
                                                <DatePickerWithRangeAlternative
                                                    value={field.value ? { from: field.value.from, to: field.value.to } : undefined}
                                                    onValueChange={field.onChange}
                                                    disabled={isDeleting}
                                                    className="[&>button]:w-full"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                     )}
                                />
                                
                                <Button type="submit" variant="destructive" disabled={isDeleting} className="w-full">
                                    {isDeleting ? 'Удаление...' : <><Trash2 className="mr-2 h-4 w-4" /> Удалить по времени</>}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                  </Card>

                  {/* Delete by Species Card */}
                  <Card>
                    <CardHeader>
                        <CardTitle>Удалить по виду</CardTitle>
                        <CardDescription>Удалить все наблюдения для выбранного вида.</CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Form {...deleteSpeciesForm}>
                           <form onSubmit={deleteSpeciesForm.handleSubmit(onDeleteBySpecies)} className="space-y-4">
                               <FormField
                                   control={deleteSpeciesForm.control}
                                   name="species_id"
                                   render={({ field }) => (
                                       <FormItem>
                                           <FormLabel>Вид</FormLabel>
                                           <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                                disabled={loadingSpecies || isDeleting}
                                           >
                                               <FormControl>
                                                   <SelectTrigger>
                                                       <SelectValue placeholder={loadingSpecies ? "Загрузка видов..." : "Выберите вид для удаления"} />
                                                   </SelectTrigger>
                                               </FormControl>
                                               <SelectContent>
                                                   {species.map(s => (
                                                       <SelectItem key={s.id} value={String(s.id)}>
                                                           {s.name}
                                                       </SelectItem>
                                                   ))}
                                               </SelectContent>
                                           </Select>
                                           <FormMessage />
                                       </FormItem>
                                   )}
                               />
                                <Button type="submit" variant="destructive" disabled={isDeleting || loadingSpecies || !deleteSpeciesForm.formState.isValid} className="w-full">
                                    {isDeleting ? 'Удаление...' : <><Trash2 className="mr-2 h-4 w-4" /> Удалить по виду</>}
                                </Button>
                           </form>
                       </Form>
                    </CardContent>
                  </Card>

                  {/* Delete by Area Card */}
                  <Card className="md:col-span-3">
                     <CardHeader>
                         <CardTitle>Удалить по области</CardTitle>
                         <CardDescription>Нарисуйте прямоугольник или полигон на карте, чтобы выбрать область для удаления наблюдений.</CardDescription>
                     </CardHeader>
                     <CardContent>
                        <Form {...deleteAreaForm}>
                             <form onSubmit={deleteAreaForm.handleSubmit(onDeleteByArea)} className="space-y-4">
                                <FormField
                                     control={deleteAreaForm.control}
                                     name="area"
                                     render={({ field }) => (
                                         <FormItem>
                                            <FormLabel>Карта области удаления</FormLabel>
                                             <FormControl>
                                                 <div style={{ height: '400px', width: '100%' }} className={`rounded-md border ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                    {/* Use new loading state and data for the map */}
                                                    {(() => { /* IIFE for logging before render */
                                                        console.log('[AdminPage] Rendering DeletionMapComponent. loadingAllMapData:', loadingAllMapData, 'allObservationMapData count:', allObservationMapData?.length); // DEBUG
                                                        return loadingAllMapData ? (
                                                            <p>Загрузка всех местоположений для карты...</p>
                                                        ) : (
                                                            <DeletionMapComponent
                                                                locations={allObservationMapData} // Pass all map data
                                                                selectedArea={field.value}
                                                                onAreaSelect={field.onChange}
                                                                disabled={isDeleting}
                                                            />
                                                        );
                                                    })()}
                                                 </div>
                                             </FormControl>
                                             <FormMessage />
                                         </FormItem>
                                     )}
                                 />

                                 <Button type="submit" variant="destructive" disabled={isDeleting || !deleteAreaForm.formState.isValid} className="w-full">
                                     {isDeleting ? 'Удаление...' : <><Trash2 className="mr-2 h-4 w-4" /> Удалить по области</>}
                                 </Button>
                             </form>
                         </Form>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Section for Observation List, Filtering, Pagination, and Editing */}
            <Card>
              <CardHeader>
                <CardTitle>Список наблюдений</CardTitle>
                <CardDescription>Просмотр, фильтрация и редактирование существующих наблюдений.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filtering UI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Select 
                    onValueChange={(value) => {
                      setFilterSpecies(value);
                      setCurrentPage(1);
                    }} 
                    value={filterSpecies}
                  >
                    <SelectTrigger><SelectValue placeholder="Фильтр по виду" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SPECIES_FILTER_VALUE}>Все виды</SelectItem>
                      {species.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DatePickerWithRangeAlternative 
                    value={filterTimestamp} 
                    onValueChange={(range?: DateRange) => {
                      setFilterTimestamp(range);
                      setCurrentPage(1);
                    }}
                    className="w-full"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="confidence-slider">Уверенность (мин.): {(filterConfidence * 100).toFixed(0)}%</Label>
                    <Input 
                      type="range"
                      id="confidence-slider"
                      min="0"
                      max="1"
                      step="0.01"
                      value={filterConfidence}
                      onChange={(e) => {
                        setFilterConfidence(parseFloat(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                  </div>
                </div>

                {/* Observation Table Wrapper to stabilize height */}
                <div style={{ minHeight: '400px' }}>
                  {loadingFilteredObservations ? ( // Use renamed state
                    <p>Загрузка наблюдений...</p>
                  ) : observationLocations.length > 0 ? (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Фото</TableHead>
                            <TableHead>Вид</TableHead>
                            <TableHead>Уверенность</TableHead>
                            <TableHead>Дата</TableHead>
                            <TableHead>Местоположение</TableHead>
                            <TableHead>Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {observationLocations.map((obs) => {
                            const confidenceText = obs.classification_confidence !== null && obs.classification_confidence !== undefined
                              ? `${(obs.classification_confidence * 100).toFixed(1)}%`
                              : 'N/A';
                            const imageElement = obs.image_url ? (
                              <img 
                                src={obs.image_url} 
                                alt={`Obs ${obs.id}`} 
                                className="h-12 w-16 object-cover rounded border"
                              /> 
                            ) : (
                              <div className="h-12 w-16 flex items-center justify-center text-xs text-muted-foreground border rounded bg-slate-50">
                                (Нет фото)
                              </div>
                            );
                            return (
                              <TableRow key={obs.id}>
                                <TableCell>{obs.id}</TableCell>
                                <TableCell>{imageElement}</TableCell>
                                <TableCell>{obs.species.name}</TableCell>
                                <TableCell>{confidenceText}</TableCell>
                                <TableCell>{new Date(obs.timestamp).toLocaleString()}</TableCell>
                                <TableCell>
                                  {obs.location ? `${obs.location.coordinates[1].toFixed(4)}, ${obs.location.coordinates[0].toFixed(4)}` : 'N/A'}
                                </TableCell>
                                <TableCell className="space-x-2">
                                  <Button variant="outline" size="sm" onClick={() => handleEditClick(obs)} disabled={isDeleting}>
                                    <Pencil className="h-4 w-4 mr-1" /> Редактировать
                                  </Button>
                                  <Button variant="destructive" size="sm" onClick={() => handleDeleteObservationClick(obs)} disabled={isDeleting}>
                                    <Trash2 className="h-4 w-4 mr-1" /> Удалить
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {/* Pagination UI */}
                      <div className="flex justify-between items-center mt-4">
                        <Button 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                          disabled={currentPage === 1 || loadingFilteredObservations}
                        >
                          Назад
                        </Button>
                        
                        {/* New Pagination Component/Logic Start */}
                        <div className="flex items-center space-x-1">
                          {(() => {
                            const pageNumbers = [];
                            const maxPagesToShow = 7; // Like in your image
                            const halfMaxPages = Math.floor(maxPagesToShow / 2);

                            if (totalPages <= maxPagesToShow) {
                              for (let i = 1; i <= totalPages; i++) {
                                pageNumbers.push(i);
                              }
                            } else {
                              // Always show first page
                              pageNumbers.push(1);
                              if (currentPage > halfMaxPages + 1 && totalPages > maxPagesToShow) {
                                  pageNumbers.push('...'); // Ellipsis after first page
                              }

                              let startPage = Math.max(2, currentPage - halfMaxPages + (currentPage > totalPages - halfMaxPages ? totalPages - currentPage - halfMaxPages +1 : 1 ));
                              let endPage = Math.min(totalPages - 1, currentPage + halfMaxPages - (currentPage < halfMaxPages +1 ? currentPage - halfMaxPages : -1));

                              // Adjust startPage and endPage to ensure maxPagesToShow buttons (minus first/last and ellipses)
                              const innerPagesCount = maxPagesToShow - 2; // for first, last
                              if (currentPage <= halfMaxPages) {
                                  endPage = Math.min(totalPages -1, maxPagesToShow-1 ); 
                              } else if (currentPage >= totalPages - halfMaxPages) {
                                  startPage = Math.max(2, totalPages - maxPagesToShow +2);
                              } else {
                                  startPage = currentPage - Math.floor((innerPagesCount-1)/2) ;
                                  endPage = currentPage + Math.ceil((innerPagesCount-1)/2);
                              }
                              
                              // Ensure we don't go below 2 for start and above totalPages-1 for end for the middle block
                              startPage = Math.max(2, startPage);
                              endPage = Math.min(totalPages - 1, endPage);

                              for (let i = startPage; i <= endPage; i++) {
                                  pageNumbers.push(i);
                              }

                              if (currentPage < totalPages - halfMaxPages && totalPages > maxPagesToShow) {
                                  pageNumbers.push('...'); // Ellipsis before last page
                              }
                              // Always show last page
                              pageNumbers.push(totalPages);
                            }

                            return pageNumbers.map((num, index) => (
                              <Button
                                key={`${num}-${index}`}
                                variant={num === currentPage ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => typeof num === 'number' && setCurrentPage(num)}
                                disabled={num === '...' || loadingFilteredObservations}
                                className={`h-9 w-9 p-0 ${num === '...' ? 'cursor-default' : ''}`}
                              >
                                {num}
                              </Button>
                            ));
                          })()}
                        </div>
                        {/* New Pagination Component/Logic End */}

                        <Button 
                          onClick={() => {
                            if (currentPage < totalPages) {
                               setCurrentPage(prev => prev + 1)
                            }
                          }}
                          disabled={loadingFilteredObservations || currentPage === totalPages || totalPages === 0}
                        >
                          Вперед
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p>Нет наблюдений для отображения с текущими фильтрами.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* EditObservationModal (remains structurally part of this section) */}
            <EditObservationModal
               isOpen={isEditingModalOpen}
               onClose={handleCloseEditModal}
               onSave={handleSaveEdit}
               observation={selectedObservation}
               speciesList={species}
               isLoading={isDeleting} 
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

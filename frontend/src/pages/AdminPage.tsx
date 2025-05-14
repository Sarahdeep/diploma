import React, { useState, useEffect, useRef, useCallback } from 'react';
// --- UI Components ---
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
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

// --- Services ---
import { speciesService } from '@/services/speciesService';
import { observationService } from '@/services/observationService'; // Ensure this import is present
import type { Species, ObservationRead } from '@/types/api';

// --- Mock API Functions ---
// const mockApi = { ... }; // Removing the entire mockApi object

// --- Validation Schemas ---
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_ARCHIVE_TYPES = ['application/zip', 'application/x-zip-compressed'];
const ALLOWED_CSV_TYPES = ['text/csv'];

const datasetUploadSchema = z.object({
  archiveFile: z.instanceof(FileList)
    .refine(f => f?.length === 1, 'Необходим один архивный файл.')
    .refine(f => f?.[0]?.size <= MAX_FILE_SIZE, `Максимальный размер архива 500MB.`)
    .refine(f => ALLOWED_ARCHIVE_TYPES.includes(f?.[0]?.type), 'Неподдерживаемый тип архива. Используйте .zip'),
  csvFile: z.instanceof(FileList)
    .refine(f => f?.length === 1, 'Необходим один CSV файл.')
    .refine(f => ALLOWED_CSV_TYPES.includes(f?.[0]?.type), 'Неподдерживаемый тип файла. Используйте .csv'),
  allowNewSpecies: z.boolean(),
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

const DeletionMapComponent: React.FC<DeletionMapProps> = ({ locations, selectedArea, onAreaSelect, disabled }) => {
    const mapRef = useRef<L.Map>(null);
    const drawnLayerRef = useRef<L.Layer | null>(null);

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
    
    const center: LatLngExpression = locations.length > 0
        ? [locations[0].location.coordinates[1], locations[0].location.coordinates[0]]
        : [55.751244, 37.618423]; // Default to Moscow if no locations

    return (
        <MapContainer center={center} zoom={10} style={{ height: '400px', width: '100%' }} ref={mapRef} attributionControl={false}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {locations.map(loc => (
                <Marker key={loc.id} position={[loc.location.coordinates[1], loc.location.coordinates[0]]}>
                     <Popup>
                         ID: {loc.id}<br />Species: {loc.species.name}
                     </Popup>
                </Marker>
            ))}
            <MapEvents />
        </MapContainer>
    );
};


// --- Main Admin Page Component ---
export default function AdminPage() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [observationLocations, setObservationLocations] = useState<ObservationRead[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // Single state for all delete operations
  const [selectedObservation, setSelectedObservation] = useState<any | null>(null); // Observation to edit
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);

  // Define fetchLocations here and wrap in useCallback
  const fetchLocations = useCallback(async () => {
      setLoadingLocations(true);
      try {
          const locationsData = await observationService.getAllObservations();
          setObservationLocations(locationsData);
      } catch (error) {
          console.error("Error fetching locations:", error);
          toast.error("Ошибка загрузки локаций наблюдений");
      } finally {
          setLoadingLocations(false);
      }
  }, []); // Empty dependency array means the function is created once

  const uploadForm = useForm<DatasetUploadForm>({
    resolver: zodResolver(datasetUploadSchema),
    defaultValues: { archiveFile: undefined, csvFile: undefined, allowNewSpecies: false }
  });

  const deleteTimeForm = useForm<DeleteByTimeForm>({
    resolver: zodResolver(deleteByTimeSchema),
    defaultValues: { dateRange: { from: undefined, to: undefined } } // Initialize for DatePickerWithRange
  });

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
    fetchLocations(); // Call the useCallback version
  }, [fetchLocations]); // Add fetchLocations to dependency array

  const onUploadSubmit = async (values: DatasetUploadForm) => {
    setIsUploading(true);
    const fd = new FormData();
    fd.append('archive', values.archiveFile[0]);
    fd.append('csv', values.csvFile[0]);
    fd.append('allow_new_species', String(values.allowNewSpecies));
    try {
      // const result = await mockApi.uploadDataset(fd); // Mock call removed
      console.warn('Upload dataset functionality not connected to backend yet.', values);
      toast.info('Функция загрузки датасета пока не подключена к бэкенду.');
      // Simulate a delay and a placeholder response for UI testing if needed
      // await new Promise(res => setTimeout(res, 1000));
      // uploadForm.reset();
      // toast.success('Заглушка: датасет условно загружен.');

    } catch (error) {
        console.error("Upload error:", error);
        toast.error('Непредвиденная ошибка при загрузке датасета');
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
          // const result = await mockApi.deleteObservationsByTime(values.dateRange.from, values.dateRange.to); // Mock call removed
          console.warn('Delete by time functionality not connected to backend yet.', values);
          toast.info('Функция удаления по времени пока не подключена к бэкенду.');
          // fetchLocations(); // Keep if you want to optimistic UI update or clear display
      } catch (error) {
          console.error("Delete by time error:", error);
          toast.error('Непредвиденная ошибка при удалении по времени');
      } finally {
          setIsDeleting(false);
      }
  };


  const onDeleteBySpecies = async (values: DeleteBySpeciesForm) => {
    setIsDeleting(true);
    try {
      // const result = await mockApi.deleteObservationsBySpecies(values.species_id); // Mock call removed
      console.warn('Delete by species functionality not connected to backend yet.', values);
      toast.info('Функция удаления по виду пока не подключена к бэкенду.');
      // fetchLocations();
    } catch (error) {
        console.error("Delete by species error:", error);
        toast.error('Непредвиденная ошибка при удалении по виду');
    } finally {
      setIsDeleting(false);
    }
  };

  const onDeleteByArea = async (values: DeleteByAreaForm) => {
    setIsDeleting(true);
    try {
      // const result = await mockApi.deleteObservationsByArea(values.area); // Mock call removed
      console.warn('Delete by area functionality not connected to backend yet.', values);
      toast.info('Функция удаления по области пока не подключена к бэкенду.');
      // fetchLocations();
    } catch (error) {
        console.error("Delete by area error:", error);
        toast.error('Непредвиденная ошибка при удалении по области');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditClick = (observation: any) => {
    setSelectedObservation(observation);
    setIsEditingModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditingModalOpen(false);
    setSelectedObservation(null);
  };

  const handleSaveEdit = async (observationId: number, newSpeciesId: number) => {
    setIsDeleting(true); // Use the isDeleting state to show loading/disable form
    try {
        // const result = await mockApi.updateObservationSpecies(observationId, newSpeciesId); // Old mock call
        const updatedObservation = await observationService.updateObservation(observationId, { species_id: newSpeciesId });
        
        // Assuming the service throws an error on failure, so if we get here, it's a success.
        // The actual response is updatedObservation, which might be useful.
        if (updatedObservation) {
            toast.success(`Вид для наблюдения ${observationId} успешно обновлен.`);
            handleCloseEditModal();
            fetchLocations(); // Refetch observations to show the update
        } else {
            // This case might not be reached if errors are thrown, but as a fallback:
            toast.error(`Не удалось обновить вид для наблюдения ${observationId}.`);
        }
    } catch (error: any) {
        console.error("Update observation error:", error);
        toast.error(error.message || 'Непредвиденная ошибка при обновлении наблюдения');
    } finally {
        setIsDeleting(false); // Reset loading state
    }
  };

  // Add console log to check the state value
  console.log('isDeleting state:', isDeleting);

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Toaster richColors />

      <h1 className="text-3xl font-bold mb-6">Панель администрирования</h1>

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload"><UploadCloud className="mr-2 h-4 w-4" />Загрузка датасета</TabsTrigger>
          <TabsTrigger value="delete"><Trash2 className="mr-2 h-4 w-4" />Удаление данных</TabsTrigger>
          <TabsTrigger value="edit"><Settings className="mr-2 h-4 w-4" />Редактирование</TabsTrigger>
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
                <form onSubmit={uploadForm.handleSubmit(onUploadSubmit)} className="space-y-6">
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
                      disabled={isUploading}
                      {...uploadForm.register("csvFile")}
                    />
                    {/* Manually render FormMessage for register errors */}
                    <FormMessage>
                        {uploadForm.formState.errors.csvFile?.message?.toString()}
                    </FormMessage>
                  </FormItem>

                  {/* Checkbox - Keep using FormField as it's a custom component */}
                  <FormField
                    control={uploadForm.control}
                    name="allowNewSpecies"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 shadow">
                         <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={isUploading}
                             />
                         </FormControl>
                         <div className="space-y-1 leading-none">
                           <FormLabel>
                            Разрешить добавление новых видов
                           </FormLabel>
                           <FormDescription>
                            Если вид из CSV отсутствует в базе данных, он будет добавлен.
                           </FormDescription>
                         </div>
                       </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isUploading} className="w-full">
                    {isUploading ? 'Загрузка...' : <><UploadCloud className="mr-2 h-4 w-4" /> Загрузить</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Delete Tab --- */}
        <TabsContent value="delete">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Delete by Time */}
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
                                            <DatePickerWithRangeAlternative
                                                field={field}
                                                disabled={isDeleting}
                                                className="[&>button]:w-full"
                                            />
                                            <FormMessage>
                                                {deleteTimeForm.formState.errors.dateRange?.message?.toString() || 
                                                 deleteTimeForm.formState.errors.dateRange?.from?.message?.toString() ||
                                                 deleteTimeForm.formState.errors.dateRange?.to?.message?.toString()}
                                            </FormMessage>
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

                {/* Delete by Species */}
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
                                                   {species.map(species => (
                                                       <SelectItem key={species.id} value={String(species.id)}>
                                                           {species.name}
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

                 {/* Delete by Area */}
                 <Card className="md:col-span-3"> {/* Make map span full width on medium screens */} 
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
                                                    {loadingLocations ? (
                                                        <p>Загрузка местоположений...</p>
                                                    ) : (
                                                        <DeletionMapComponent
                                                            locations={observationLocations}
                                                            selectedArea={field.value}
                                                            onAreaSelect={field.onChange} // Pass the onChange handler
                                                            disabled={isDeleting} // Disable map interactions while deleting
                                                        />
                                                    )}
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
        </TabsContent>

        {/* --- Edit Tab --- */}
        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>Редактировать наблюдения</CardTitle>
              <CardDescription>
                Выберите наблюдение из списка для изменения его вида.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLocations ? (
                <p>Загрузка наблюдений...</p>
              ) : observationLocations.length === 0 ? (
                <p>Наблюдения не найдены.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Фото</TableHead>
                      <TableHead>Вид</TableHead>
                      <TableHead>Уверенность</TableHead>
                      <TableHead>Широта</TableHead>
                      <TableHead>Долгота</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {observationLocations.map((obs) => {
                      // Prepare cell content beforehand
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
                          <TableCell className="font-medium">{obs.id}</TableCell>
                          <TableCell>
                            {imageElement}
                          </TableCell>
                          <TableCell>{obs.species.name}</TableCell>
                          <TableCell>
                            {confidenceText}
                          </TableCell>
                          <TableCell>{obs.location.coordinates[1].toFixed(6)}</TableCell>
                          <TableCell>{obs.location.coordinates[0].toFixed(6)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="icon" onClick={() => handleEditClick(obs)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {/* Render the Edit Modal */}
              <EditObservationModal
                 isOpen={isEditingModalOpen}
                 onClose={handleCloseEditModal}
                 onSave={handleSaveEdit}
                 observation={selectedObservation}
                 speciesList={species} // Pass the fetched species list
                 isLoading={isDeleting} // Use isDeleting for loading state
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

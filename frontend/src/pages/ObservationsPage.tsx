import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Services
import { observationService } from '@/services/observationService';
import { speciesService } from '@/services/speciesService';
import type { ObservationRead, Species } from '@/types/api';
import { ObservationCard } from '@/components/ObservationCard';
import DateRangeSelector from '@/components/MapControls/DateRangeSelector';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

// Zod schema for new observation
const createSchema = z.object({
  photos: z.instanceof(FileList, { message: "Пожалуйста, выберите файл (некорректный тип)." })
    .refine(fileList => fileList.length > 0, { message: "Выберите хотя бы одно фото." })
    .refine(fileList => { // Check all files for non-zero size
      if (fileList.length === 0) return true; // Pass if no files, previous rule handles this
      for (let i = 0; i < fileList.length; i++) {
        if (fileList[i].size === 0) return false; // Fail if any file is empty
      }
      return true;
    }, { message: "Один или несколько файлов пустые." })
    .refine(fileList => { // Check all files for correct image type
      if (fileList.length === 0) return true; // Pass if no files
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif"];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!(file.type.startsWith("image/") || allowedMimeTypes.includes(file.type) || allowedExtensions.includes(fileExtension))) {
          return false; // Fail if any file has an unsupported type
        }
      }
      return true;
    }, { message: "Один или несколько файлов имеют неподдерживаемый тип (JPEG, PNG, GIF)." }),
  speciesId: z.string().optional(),
  timestamp: z.string().optional(),
  latitude: z.string().optional().refine(s => !s || !isNaN(Number(s)), 'Некорректная широта'),
  longitude: z.string().optional().refine(s => !s || !isNaN(Number(s)), 'Некорректная долгота'),
});

type CreateForm = z.infer<typeof createSchema>;

export default function ObservationsPage() {
  const [observations, setObservations] = useState<ObservationRead[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const loader = useRef<HTMLDivElement | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Filters
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [filterSpecies, setFilterSpecies] = useState<string>('ALL_SPECIES');
  const [filterConfidence, setFilterConfidence] = useState(0);

  // Modal form
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { 
      photos: new DataTransfer().files as FileList, 
      speciesId: '', 
      timestamp: '', 
      latitude: '', 
      longitude: '' 
    }
  });

  // Load species
  useEffect(() => {
    speciesService.getAllSpecies().then(setSpeciesList);
  }, []);

  const handleLocationClick = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setIsMapOpen(true);
  };

  // Load observations
  const loadMore = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const filters: any = {};
      // Parse date strings from state and convert to ISO strings for backend
      if (dateRange && dateRange[0]) {
        filters.start_date = dayjs(dateRange[0]).utc().toISOString();
      }
      if (dateRange && dateRange[1]) {
        filters.end_date = dayjs(dateRange[1]).utc().toISOString();
      }

      if (filterSpecies && filterSpecies !== 'ALL_SPECIES') filters.species_id = parseInt(filterSpecies, 10);
      if (filterConfidence > 0) {
        filters.min_confidence = filterConfidence;
      }

      const response = await observationService.getAllObservations(
        Object.keys(filters).length > 0 ? filters : undefined,
        page * 10,
        10
      );

      if (response && Array.isArray(response.observations)) {
        // If it's the first page (or a filter change triggered a reset), replace observations
        if (page === 0) {
          setObservations(response.observations);
        } else { // Otherwise, append observations for infinite scroll
          setObservations(prev => [...prev, ...response.observations]);
        }
        if (response.observations.length < 10) {
          setHasMore(false);
        } else {
          setHasMore(true); // Ensure hasMore is true if we got 10 results
        }
        setPage(prev => prev + 1);
      } else {
        // If no response or not an array, stop loading more
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading observations:', error);
      toast.error('Ошибка загрузки наблюдений');
      setHasMore(false); // Stop loading on error
    } finally {
      setIsLoading(false);
    }
  }, [page, dateRange, filterSpecies, filterConfidence, isLoading]);

  // Effect to reset and prepare for loading when filters change
  useEffect(() => {
    setObservations([]); // Clear observations on filter change
    setPage(0); // Reset page, which will trigger the effect below
    setHasMore(true); // Assume there is more data until proven otherwise
  }, [dateRange, filterSpecies, filterConfidence]);

  // Effect to load data when page is 0 (initial load or after filter reset) and not already loading
  useEffect(() => {
    if (page === 0 && !isLoading) {
      loadMore();
    }
  }, [page, isLoading, loadMore]);

  // Infinite scroll observer
  useEffect(() => {
    const options = { root: null, rootMargin: '20px', threshold: 1.0 };
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        if (page > 0) {
            loadMore();
        }
      }
    }, options);
    
    if (loader.current) {
      observer.observe(loader.current);
    }
    
    return () => {
      if (loader.current) {
        observer.unobserve(loader.current);
      }
    };
  }, [loadMore, hasMore, page, isLoading]);

  const onSubmit = async (data: CreateForm) => {
    try {
      const formData = new FormData();
      // Append all files to the same FormData object under the key 'files[]' or 'files'
      // FastAPI will interpret this as a list of UploadFile objects if the key matches
      // the parameter name in the endpoint (which is 'files').
      for (let i = 0; i < data.photos.length; i++) {
        formData.append('files', data.photos[i]);
      }
      
      // Append other optional fields if they have values.
      // These will apply to all observations created in this batch if not overridden by EXIF.
      if (data.speciesId) {
        formData.append('species_id', data.speciesId);
      }
      if (data.timestamp) {
        formData.append('timestamp', data.timestamp);
      }
      if (data.latitude) {
        formData.append('latitude', data.latitude);
      }
      if (data.longitude) {
        formData.append('longitude', data.longitude);
      }

      // The service and backend now expect/return a list
      const createdObservations = await observationService.createObservation(formData);

      if (createdObservations && createdObservations.length > 0) {
        toast.success(`${createdObservations.length} observation(s) successfully created!`);
      } else {
        toast.warning("No observations were created. Some files might have had issues.");
      }
      
      form.reset();
      setIsDialogOpen(false);
      setPage(0);
    } catch (error: any) {
      console.error('Error creating observation(s):', error);
      // Check if error.response.data.detail exists for FastAPI validation errors
      const errorDetail = error.response?.data?.detail;
      if (errorDetail) {
        if (typeof errorDetail === 'string') {
            toast.error(errorDetail);
        } else if (Array.isArray(errorDetail)) {
            // Handle array of error objects (like from Pydantic validation)
            errorDetail.forEach(err => toast.error(`${err.loc.join(" -> ")}: ${err.msg}`))
        } else {
            toast.error('An unexpected error occurred during observation creation.');
        }
      } else {
        toast.error('Ошибка при создании наблюдений.');
      }
    }
  };

  const handleClearFilters = () => {
    setDateRange(null);
    setFilterSpecies('ALL_SPECIES');
    setFilterConfidence(0);
    // State updates will trigger the useEffect to reload observations
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Toaster richColors />
      
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Наблюдения</h1>
        <div className="flex items-center space-x-4">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>Создать наблюдение</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новое наблюдение</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <Controller
                  control={form.control}
                  name="photos"
                  render={({ field: { onChange, onBlur, name, ref }, fieldState: { error } }) => (
                    <FormFieldControl
                      label="Фото"
                      error={error?.message}
                    >
                      <Input
                        type="file"
                        accept="image/*"
                        multiple // Added for multiple file selection
                        onBlur={onBlur}
                        name={name}
                        ref={ref}
                        onChange={(e) => {
                          if (e.target.files) {
                            onChange(e.target.files); // Ensure FileList is passed to react-hook-form
                          }
                        }}
                      />
                    </FormFieldControl>
                  )}
                />
                <Controller
                  control={form.control}
                  name="speciesId"
                  render={({ field }) => (
                    <FormFieldControl label="Вид (опционально)" error={form.formState.errors.speciesId?.message}>                   
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger><SelectValue placeholder="Выберите вид или оставьте для автоматического определения"/></SelectTrigger>
                        <SelectContent>
                          {speciesList.map(sp => <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormFieldControl>
                  )}
                />
                <FormFieldControl label="Время съемки (опционально)" error={form.formState.errors.timestamp?.message}>
                  <Input type="datetime-local" {...form.register('timestamp')} />
                </FormFieldControl>
                <FormFieldControl label="Широта (опционально)" error={form.formState.errors.latitude?.message}>
                  <Input {...form.register('latitude')} placeholder="55.751244" />
                </FormFieldControl>
                <FormFieldControl label="Долгота (опционально)" error={form.formState.errors.longitude?.message}>
                  <Input {...form.register('longitude')} placeholder="37.618423" />
                </FormFieldControl>
                <DialogFooter>
                  <Button type="submit">Сохранить</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Фильтры</h2>
          <Button 
            variant="outline" 
            onClick={handleClearFilters}
          >
            Сбросить фильтры
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <DateRangeSelector
              value={dateRange}
              onChange={(dates, dateStrings) => {
                setDateRange(dates ? dateStrings : null);
              }}
            />
          </div>
          <div>
            <Label>Вид</Label>
            <Select 
              onValueChange={(value) => {
                setFilterSpecies(value);
                setObservations([]);
                setPage(0);
                setHasMore(true);
              }} 
              value={filterSpecies}
            >
              <SelectTrigger><SelectValue placeholder="Все виды" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_SPECIES">Все</SelectItem>
                {speciesList.map(sp => <SelectItem key={sp.id} value={String(sp.id)}>{sp.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Уверенность (мин.): {(filterConfidence * 100).toFixed(0)}%</Label>
            <Input 
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={filterConfidence}
              onChange={(e) => {
                setFilterConfidence(parseFloat(e.target.value));
                setObservations([]);
                setPage(0);
                setHasMore(true);
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Observation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {observations.map(obs => (
          <ObservationCard 
            key={obs.id}
            observation={obs}
            onLocationClick={handleLocationClick}
          />
        ))}
      </div>

      {/* Map Dialog */}
      <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
        <DialogContent className="max-w-3xl h-[600px]">
          <DialogHeader>
            <DialogTitle>Местоположение наблюдения</DialogTitle>
          </DialogHeader>
          {selectedLocation && (
            <div className="h-[500px] w-full">
              <MapContainer 
                center={[selectedLocation.lat, selectedLocation.lng]} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={[selectedLocation.lat, selectedLocation.lng]} />
              </MapContainer>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Loader */}
      <div ref={loader} className="text-center py-4">
        {hasMore ? 'Загрузка...' : 'Больше нет данных'}
      </div>
    </div>
  );
}

// Helper component for form fields
interface FieldProps { label: string; error?: string; children: React.ReactNode; }
function FormFieldControl({ label, error, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
} 
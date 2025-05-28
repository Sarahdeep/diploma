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
import { ObservationTable } from '@/components/ObservationTable'; // Added import

// Import MarkerClusterGroup and its CSS
import MarkerClusterGroup from 'react-leaflet-markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// --- Services ---
import { speciesService } from '@/services/speciesService';
import { observationService } from '@/services/observationService'; // Ensure this import is present
import { adminService } from '@/services/adminService'; 
import type { Species, ObservationRead, SpeciesCheckResponse, DBSpeciesBase, Point as GeoJSONPoint, UserRead, UserActivityRead, AdminStatistics, UserRole, UserUpdate } from '@/types/api';
import type { ObservationFilterParams } from '@/types/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { UserRole as UserRoleEnum } from "@/types/api"; // UserRole is already imported here, ensure it's a value import
import type { HandledApiError } from "@/services/apiClient"; // Import HandledApiError
import { apiClient } from '@/services/apiClient'; // Added apiClient import

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

// Placeholder Tab Components
const UserManagementTab: React.FC = () => {
  const [users, setUsers] = useState<UserRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRead | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    (() => Promise<void>) | null
  >(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedUsers = await adminService.getUsers({ limit: 100 });
      setUsers(fetchedUsers);
      setError(null);
    } catch (err: any) {
      const apiError = err as HandledApiError; // Type assertion from apiClient
      setError(apiError.message || "Не удалось загрузить пользователей");
      toast.error(apiError.message || "Не удалось загрузить пользователей.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenEditModal = (user: UserRead) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setSelectedUser(null);
    setIsEditModalOpen(false);
  };

  const handleUpdateUser = async (userId: number, data: Partial<UserUpdate>) => {
    try {
      await adminService.updateUser(userId, data);
      toast.success(`Пользователь ${userId} успешно обновлен.`);
      handleCloseEditModal();
      fetchUsers(); // Refresh list
    } catch (err: any) {
      const apiError = err as HandledApiError;
      toast.error(apiError.message || "Не удалось обновить пользователя.");
    }
  };

  const openConfirmationModal = (
    title: string,
    description: string,
    action: () => Promise<void>
  ) => {
    setConfirmTitle(title);
    setConfirmDescription(description);
    setConfirmAction(() => action); // Store the action
    setIsConfirmModalOpen(true);
  };

  const handleConfirm = async () => {
    if (confirmAction) {
      await confirmAction();
    }
    setIsConfirmModalOpen(false);
    setConfirmAction(null);
    fetchUsers();
  };

  const handleDeleteUser = (user: UserRead) => {
    openConfirmationModal(
      `Удалить пользователя ${user.username}?`,
      `Вы уверены, что хотите удалить пользователя ${user.email}? Это действие необратимо.`,
      async () => {
        try {
          await adminService.deleteUser(user.id);
          toast.success(`Пользователь ${user.username} успешно удален.`);
        } catch (err: any) {
          const apiError = err as HandledApiError;
          toast.error(apiError.message || "Не удалось удалить пользователя.");
        }
      }
    );
  };

  const handleToggleActivateUser = (user: UserRead) => {
    const actionText = user.is_active ? "Деактивировать" : "Активировать";
    const actionTextPast = user.is_active ? "деактивирован" : "активирован";
    openConfirmationModal(
      `${actionText} пользователя ${user.username}?`,
      `Вы уверены, что хотите ${actionText.toLowerCase()} пользователя ${user.email}?`,
      async () => {
        try {
          if (user.is_active) {
            await adminService.deactivateUser(user.id);
          } else {
            await adminService.activateUser(user.id);
          }
          toast.success(`Пользователь ${user.username} успешно ${actionTextPast}.`);
        } catch (err: any) {
          const apiError = err as HandledApiError;
          toast.error(apiError.message || `Не удалось ${actionText.toLowerCase()} пользователя.`);
        }
      }
    );
  };
  
  // Edit User Form Schema (simplified for example)
  const editUserSchema = z.object({
    username: z.string().min(3).optional(),
    role: z.nativeEnum(UserRoleEnum).optional(),
    // is_active and is_verified are handled by separate actions
  });
  type EditUserFormValues = z.infer<typeof editUserSchema>;

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
  });

  useEffect(() => {
    if (selectedUser && isEditModalOpen) {
      editForm.reset({
        username: selectedUser.username,
        role: selectedUser.role as UserRoleEnum,
      });
    }
  }, [selectedUser, isEditModalOpen, editForm]);

  const onEditSubmit = (values: EditUserFormValues) => {
    if (selectedUser) {
        const updateData: Partial<UserUpdate> = {};
        if (values.username && values.username !== selectedUser.username) updateData.username = values.username;
        if (values.role && values.role !== selectedUser.role) updateData.role = values.role as UserRole;

        if (Object.keys(updateData).length > 0) {
            handleUpdateUser(selectedUser.id, updateData);
        } else {
            toast.info("Изменений не обнаружено.");
            handleCloseEditModal();
        }
    }
  };

  if (loading) return <p className="p-4">Загрузка пользователей...</p>;
  if (error) return <p className="p-4 text-red-500">Ошибка: {error}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Управление пользователями</CardTitle>
        <CardDescription>Управление учетными записями, ролями и статусами пользователей. Найдено {users.length} пользователей.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Имя пользователя</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Активен</TableHead>
              <TableHead>Подтвержден</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(user => (
              <TableRow key={user.id}>
                <TableCell>{user.id}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.is_active ? 'Да' : 'Нет'}</TableCell>
                <TableCell>{user.is_verified ? 'Да' : 'Нет'}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="outline" size="sm" onClick={() => handleOpenEditModal(user)}>
                    <Pencil className="h-3 w-3 mr-1" /> Редактировать
                  </Button>
                  <Button 
                    variant={user.is_active ? "secondary" : "default"} 
                    size="sm" 
                    onClick={() => handleToggleActivateUser(user)}
                    className="min-w-[140px] text-center"
                  >
                     {user.is_active ? "Деактивировать" : "Активировать"}
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDeleteUser(user)} title="Удалить">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {users.length === 0 && !loading && <p className="mt-4 text-center">Пользователи не найдены.</p>}
      </CardContent>

      {/* Edit User Modal */}
      {selectedUser && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Редактировать пользователя: {selectedUser.username}</DialogTitle>
              <DialogDescription>
                Измените данные пользователя. Нажмите "Сохранить", когда закончите.
                <br />
                <span className="text-sm text-muted-foreground">Email: {selectedUser.email} (нельзя изменить)</span>
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                    <FormField
                        control={editForm.control}
                        name="username"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Имя пользователя</FormLabel>
                                <FormControl><Input {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={editForm.control}
                        name="role"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Роль</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value as UserRoleEnum}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Выберите роль" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {Object.values(UserRoleEnum).map(roleValue => (
                                            <SelectItem key={roleValue} value={roleValue}>{roleValue.toUpperCase()}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleCloseEditModal}>Отмена</Button>
                        <Button type="submit">Сохранить изменения</Button>
                    </DialogFooter>
                </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Modal */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmModalOpen(false)}>Отмена</Button>
            <Button variant="destructive" onClick={handleConfirm}>Подтвердить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const SystemStatisticsTab: React.FC = () => {
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const downloadJsonReport = (data: any, filename: string) => {
    if (!data) {
      toast.error("Нет данных для скачивания.");
      return;
    }
    try {
      const jsonString = JSON.stringify(data, null, 2); // Pretty print JSON
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Отчет "${filename}" успешно скачан.`);
    } catch (e) {
      console.error("Ошибка при скачивании JSON отчета:", e);
      toast.error("Не удалось скачать отчет.");
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const fetchedStats = await adminService.getStatistics();
        setStats(fetchedStats);
        setError(null);
      } catch (err: any) {
        const apiError = err as HandledApiError;
        setError(apiError.message || "Не удалось загрузить статистику системы");
        toast.error(apiError.message || "Не удалось загрузить статистику системы.");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <p className="p-4">Загрузка статистики...</p>;
  if (error) return <p className="p-4 text-red-500">Ошибка: {error}</p>;
  if (!stats) return <p className="p-4">Статистика недоступна.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статистика системы</CardTitle>
        <CardDescription>Обзор общесистемных данных и активности.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего пользователей</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total_users ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Активных пользователей</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.active_users ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Подтвержденных пользователей</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.verified_users ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Администраторов</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.admin_users ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего наблюдений</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total_observations ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего видов</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total_species ?? 'Н/Д'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Всего активностей</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-2">{stats.total_activities ?? 'Н/Д'}</div>
            {stats.recent_activities && stats.recent_activities.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => downloadJsonReport(stats.recent_activities, 'recent_activities_report.json')}
              >
                Скачать недавние (JSON)
              </Button>
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default function AdminPage() {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [observationLocations, setObservationLocations] = useState<ObservationRead[]>([]);
  const [loadingFilteredObservations, setLoadingFilteredObservations] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState<ObservationRead | null>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [csvFileForCheck, setCsvFileForCheck] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [columnMappings, setColumnMappings] = useState<{ filename: string; species: string; }>({ filename: '', species: '' });
  const [showSpeciesMapping, setShowSpeciesMapping] = useState(false);
  const [unmatchedSpecies, setUnmatchedSpecies] = useState<string[]>([]);
  const [speciesUserMappings, setSpeciesUserMappings] = useState<Record<string, string | { name: string; createNew: boolean }>>({});
  const [isCheckingSpecies, setIsCheckingSpecies] = useState(false);
  const [dbSpeciesForMapping, setDbSpeciesForMapping] = useState<DBSpeciesBase[]>([]);
  const [isColumnMappingConfirmed, setIsColumnMappingConfirmed] = useState(false);

  // Pagination state for Observation List
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [totalPages, setTotalPages] = useState(0);

  // Filtering state for Observation List
  const [filterSpecies, setFilterSpecies] = useState('');
  const [filterTimestamp, setFilterTimestamp] = useState<DateRange | undefined>(undefined);
  const [filterConfidence, setFilterConfidence] = useState(0);
  const ALL_SPECIES_FILTER_VALUE = "ALL_SPECIES";

  // Data for DeletionMapComponent
  const [allObservationMapData, setAllObservationMapData] = useState<ObservationRead[]>([]);
  const [loadingAllMapData, setLoadingAllMapData] = useState(false);
  
  const [activeTab, setActiveTab] = useState("data-management"); // Default to the consolidated tab

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
          console.error("Ошибка загрузки видов:", error);
          toast.error('Ошибка загрузки списка видов');
      } finally {
        setLoadingSpecies(false);
      }
    }
    fetchSpeciesData();
  }, []);

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
        console.error("Ошибка парсинга заголовков CSV:", error);
        toast.error("Не удалось прочитать заголовки CSV файла.");
        callback([]);
      }
    } as any); // Cast the config object to any
  };

  const handleArchiveFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadForm.setValue('archiveFile', files, { shouldValidate: true });
    } else {
      // If user deselects or input is cleared
      uploadForm.setValue('archiveFile', new DataTransfer().files, { shouldValidate: true });
    }
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

    console.log('csvFileForCheck before append:', csvFileForCheck, typeof csvFileForCheck);
    const formData = new FormData();
    formData.append('csv_file', csvFileForCheck);
    formData.append('species_column_name', columnMappings.species);

    try {
      const response = await apiClient.post<SpeciesCheckResponse>('/observations/check_species_in_csv', formData, {
        headers: {
          // Axios will set Content-Type to multipart/form-data automatically for FormData
          // but if there were any issues, explicitly setting it could be an option:
          // 'Content-Type': 'multipart/form-data',
        }
      });
      const result = response.data; // Axios provides data directly in response.data

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
      console.error("Ошибка проверки видов CSV:", error);
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
      const response = await apiClient.post<{message: string}>('/observations/upload_dataset', fd, {
        // FormData requests typically don't need Content-Type explicitly set with Axios,
        // as Axios and the browser will handle it for multipart/form-data.
      });
      const result = response.data; // Axios provides data directly in response.data

      toast.success(result.message || 'Процесс загрузки датасета (виды только по карте, Гео/Время из EXIF) успешно запущен!');
      uploadForm.reset();
      setCsvFileForCheck(null); setShowColumnMapping(false); setCsvHeaders([]);
      setShowSpeciesMapping(false); setSpeciesUserMappings({}); setUnmatchedSpecies([]);
      // Refresh both lists after successful upload
      fetchObservations();
      fetchAllObservationsForMap();

    } catch (error: any) {
        console.error("Ошибка загрузки:", error);
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
          console.error("Ошибка удаления по времени:", error);
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
        console.error("Ошибка удаления по виду:", error);
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
        console.error("Ошибка удаления по области:", error);
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
        console.error("Ошибка обновления наблюдения:", error);
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
      console.error("Ошибка удаления наблюдения:", error);
      toast.error(error.message || `Ошибка при удалении наблюдения ID: ${observation.id}.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Log state variables relevant to the upload button's disabled status
  console.log('AdminPage render state:', { isUploading, isColumnMappingConfirmed, showColumnMapping });

  const fetchObservations = useCallback(async () => {
    setLoadingFilteredObservations(true);
    try {
      const filters: ObservationFilterParams = {};
      if (filterSpecies && filterSpecies !== ALL_SPECIES_FILTER_VALUE) {
        filters.species_id = parseInt(filterSpecies, 10);
      }
      if (filterTimestamp?.from) filters.start_date = filterTimestamp.from.toISOString();
      if (filterTimestamp?.to) filters.end_date = filterTimestamp.to.toISOString();
      if (filterConfidence > 0) filters.min_confidence = filterConfidence;

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
      }
    } catch (error) {
      toast.error('Не удалось загрузить наблюдения.');
      setObservationLocations([]);
      setTotalPages(0);
    } finally {
      setLoadingFilteredObservations(false);
    }
  }, [currentPage, itemsPerPage, filterSpecies, filterTimestamp, filterConfidence, ALL_SPECIES_FILTER_VALUE]);

  const fetchAllObservationsForMap = useCallback(async () => {
    if (activeTab === "data-management") { // Only fetch if the main data tab is active
        setLoadingAllMapData(true);
        try {
        const allData = await observationService.getAllObservations(undefined, 0, 10000); // Fetch a large number for the map
        if (allData && Array.isArray(allData.observations)) {
            setAllObservationMapData(allData.observations);
        } else {
            setAllObservationMapData([]);
        }
        } catch (error) {
        toast.error('Не удалось загрузить все местоположения наблюдений для карты.');
        setAllObservationMapData([]);
        } finally {
        setLoadingAllMapData(false);
        }
    }
  }, [activeTab]); // Re-fetch if data-management tab becomes active

  useEffect(() => {
    fetchObservations();
  }, [fetchObservations]);

  useEffect(() => {
    fetchAllObservationsForMap();
  }, [fetchAllObservationsForMap]);
  
  return (
    <div className="container mx-auto p-4 space-y-8">
      <Toaster richColors />
      <h1 className="text-3xl font-bold mb-6">Панель администрирования</h1>

      <Tabs defaultValue="data-management" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 mb-4">
          <TabsTrigger value="data-management">Управление данными</TabsTrigger>
          <TabsTrigger value="user-management">Управление пользователями</TabsTrigger>
          <TabsTrigger value="system-statistics">Статистика системы</TabsTrigger>
        </TabsList>

        <TabsContent value="data-management">
          <div className="space-y-6">
            {/* 1. Upload Dataset Section */}
            <Card>
              <CardHeader>
                <CardTitle>Загрузить новый датасет</CardTitle>
                <CardDescription>
                  Загрузите zip-архив с изображениями (.jpg, .jpeg) и соответствующий CSV-файл с метаданными.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...uploadForm}>
                  <form onSubmit={uploadForm.handleSubmit(onUploadSubmit)} className="space-y-6">
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
                    <FormItem>
                      <FormLabel>Zip-архив</FormLabel>
                      <Input 
                        type="file" 
                        accept=".zip" 
                        onChange={handleArchiveFileChange}
                      />
                      <FormMessage>{uploadForm.formState.errors.archiveFile?.message?.toString()}</FormMessage>
                    </FormItem>
                    <FormItem>
                      <FormLabel>CSV-файл</FormLabel>
                      <Input type="file" accept=".csv" onChange={handleCsvFileChange} />
                      <FormMessage>{uploadForm.formState.errors.csvFile?.message?.toString()}</FormMessage>
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
                      {isUploading ? 'Загрузка...' : 'Загрузить датасет'}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* 2. Deletion Operations Section */}
            <Card>
              <CardHeader>
                <CardTitle>Операции удаления наблюдений</CardTitle>
                <CardDescription>Удаление наблюдений по различным критериям.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Delete by Time Card */}
                <Card>
                  <CardHeader><CardTitle>Удалить по времени</CardTitle></CardHeader>
                  <CardContent>
                    <Form {...deleteTimeForm}>
                      <form onSubmit={deleteTimeForm.handleSubmit(onDeleteByTime)} className="space-y-4">
                        <FormField 
                          control={deleteTimeForm.control} 
                          name="dateRange" 
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Диапазон</FormLabel>
                              <FormControl>
                                <DatePickerWithRangeAlternative 
                                  value={field.value?.from ? { from: field.value.from, to: field.value.to } : undefined} 
                                  onValueChange={field.onChange} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                        <Button type="submit" variant="destructive" disabled={isDeleting}>Удалить</Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
                {/* Delete by Species Card */}
                <Card>
                  <CardHeader><CardTitle>Удалить по виду</CardTitle></CardHeader>
                  <CardContent>
                    <Form {...deleteSpeciesForm}>
                      <form onSubmit={deleteSpeciesForm.handleSubmit(onDeleteBySpecies)} className="space-y-4">
                        <FormField control={deleteSpeciesForm.control} name="species_id" render={({ field }) => (<FormItem><FormLabel>Вид</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Выберите вид" /></SelectTrigger></FormControl><SelectContent>{species.map(s => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                        <Button type="submit" variant="destructive" disabled={isDeleting}>Удалить</Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
                {/* Delete by Area Card (Full Width on Medium Screens) */}
                <Card className="md:col-span-3">
                  <CardHeader><CardTitle>Удалить по области</CardTitle></CardHeader>
                  <CardContent>
                    <Form {...deleteAreaForm}>
                      <form onSubmit={deleteAreaForm.handleSubmit(onDeleteByArea)} className="space-y-4">
                        <FormField control={deleteAreaForm.control} name="area" render={({ field }) => (<FormItem><FormLabel>Карта</FormLabel><FormControl><div style={{ height: '300px' }}> <DeletionMapComponent locations={allObservationMapData} selectedArea={field.value} onAreaSelect={field.onChange} disabled={isDeleting} /> </div></FormControl><FormMessage /></FormItem>)} />
                        <Button type="submit" variant="destructive" disabled={isDeleting}>Удалить</Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
            
            {/* 3. Observation List Section */}
            <Card>
              <CardHeader>
                <CardTitle>Список наблюдений</CardTitle>
                <CardDescription>Просмотр, фильтрация и редактирование.</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filtering UI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Select onValueChange={(value) => { setFilterSpecies(value); setCurrentPage(1); }} value={filterSpecies}>
                    <SelectTrigger><SelectValue placeholder="Фильтр по виду" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SPECIES_FILTER_VALUE}>Все виды</SelectItem>
                      {species.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DatePickerWithRangeAlternative value={filterTimestamp} onValueChange={(range) => { setFilterTimestamp(range); setCurrentPage(1); }} />
                  <div>
                    <Label htmlFor="confidence-slider">Уверенность (мин.): {(filterConfidence * 100).toFixed(0)}%</Label>
                    <Input type="range" id="confidence-slider" min="0" max="1" step="0.01" value={filterConfidence} onChange={(e) => { setFilterConfidence(parseFloat(e.target.value)); setCurrentPage(1);}} />
                  </div>
                </div>

                {/* Observation Table */}
                <ObservationTable 
                  observations={observationLocations}
                  speciesList={species} // Pass species list for the edit modal
                  isLoading={loadingFilteredObservations}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteObservationClick}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* User Management Tab */}
        <TabsContent value="user-management">
          <UserManagementTab />
        </TabsContent>

        {/* System Statistics Tab */}
        <TabsContent value="system-statistics">
          <SystemStatisticsTab />
        </TabsContent>

      </Tabs>

      {/* EditObservationModal (remains at the component level) */}
      {selectedObservation && (
        <EditObservationModal
          isOpen={isEditingModalOpen}
          onClose={handleCloseEditModal}
          onSave={handleSaveEdit}
          observation={selectedObservation}
          speciesList={species}
          isLoading={isDeleting} 
        />
      )}
    </div>
  );
}

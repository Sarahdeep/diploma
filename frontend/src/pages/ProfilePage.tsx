import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit3Icon, SaveIcon, UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { ObservationTable } from '@/components/ObservationTable';
import { EditObservationModal } from '@/components/modals/EditObservationModal';
import { observationService } from '@/services/observationService';
import { speciesService } from '@/services/speciesService';
import type { ObservationRead, Species, ObservationListResponse } from '@/types/api';

const ProfilePage: React.FC = () => {
  const { user, logout, updateUserProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(user?.username || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [observations, setObservations] = useState<ObservationRead[]>([]);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10); // Or make this configurable
  const [totalPages, setTotalPages] = useState(0);
  const [selectedObservation, setSelectedObservation] = useState<ObservationRead | null>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false); // For disabling buttons during API calls

  const fetchUserObservations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response: ObservationListResponse = await observationService.getUserObservations(
        (currentPage - 1) * itemsPerPage,
        itemsPerPage
      );
      if (response && Array.isArray(response.observations)) {
        setObservations(response.observations);
        setTotalPages(Math.ceil((response.total_count || response.observations.length) / itemsPerPage));
      } else {
        setObservations([]);
        setTotalPages(0);
        toast.error('Не удалось загрузить ваши наблюдения или ответ пуст.', { id: 'profile-fetch-obs-empty-err' });
      }
    } catch (error: any) {
      console.error("Error fetching user observations:", error);
      toast.error(error.message || 'Ошибка при загрузке ваших наблюдений.');
      setObservations([]);
      setTotalPages(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, itemsPerPage]);

  useEffect(() => {
    if (user) {
      if (!isEditingNickname) {
        setNickname(user.username);
      }
      if (!avatarFile) {
        setAvatarPreview(user.avatar_url || null);
      }
    }
  }, [user, isEditingNickname, avatarFile]);

  useEffect(() => {
    fetchUserObservations();
  }, [fetchUserObservations]);

  useEffect(() => {
    async function fetchSpecies() {
      try {
        const data = await speciesService.getAllSpecies();
        setSpeciesList(data || []);
      } catch (error) {
        console.error("Error fetching species:", error);
        toast.error('Ошибка загрузки списка видов для редактирования.');
      }
    }
    fetchSpecies();
  }, []);

  if (!user) {
    return <div className="flex justify-center items-center h-screen">Загрузка профиля пользователя...</div>;
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to logout:", error);
      toast.error("Ошибка выхода из системы.");
    }
  };

  const handleNicknameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNickname(e.target.value);
  };

  const handleNicknameEditToggle = async () => {
    if (isEditingNickname) {
      if (user && nickname !== user.username && nickname.trim() !== '' ) {
        const formData = new FormData();
        formData.append('username', nickname.trim());
        try {
          await updateUserProfile(formData);
          toast.success("Имя пользователя успешно обновлено.");
        } catch (error) {
          toast.error("Не удалось обновить имя пользователя.");
          setNickname(user.username);
        }
      } else if (nickname.trim() === ''){
        toast.error("Имя пользователя не может быть пустым.");
        setNickname(user?.username || '');
      }
    }
    setIsEditingNickname(!isEditingNickname);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleAvatarSave = async () => {
    if (avatarFile && user) {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      
      try {
        await updateUserProfile(formData);
        toast.success("Аватар успешно обновлен.");
        setAvatarFile(null);
      } catch (error) {
        toast.error("Не удалось обновить аватар.");
        setAvatarPreview(user.avatar_url || null);
        setAvatarFile(null);
      }
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
    setIsProcessingAction(true);
    try {
      const updatedObservation = await observationService.updateObservation(observationId, { species_id: newSpeciesId });
      if (updatedObservation) {
        toast.success(`Вид для наблюдения ${observationId} успешно обновлен.`);
        handleCloseEditModal();
        fetchUserObservations(); // Refresh the list
      } else {
        toast.error(`Не удалось обновить вид для наблюдения ${observationId}.`);
      }
    } catch (error: any) {
      console.error("Update observation error:", error);
      toast.error(error.message || 'Непредвиденная ошибка при обновлении наблюдения');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDeleteClick = async (observation: ObservationRead) => {
    if (!window.confirm(`Вы уверены, что хотите удалить наблюдение ID: ${observation.id} (${observation.species.name})?`)) {
      return;
    }
    setIsProcessingAction(true);
    try {
      const deletedObservation = await observationService.deleteObservation(observation.id);
      if (deletedObservation) { 
        toast.success(`Наблюдение ID: ${observation.id} (${observation.species.name}) успешно удалено.`);
        fetchUserObservations(); // Refresh the list
      } else {
        toast.error(`Не удалось удалить наблюдение ID: ${observation.id}.`);
      }
    } catch (error: any) {
      console.error("Error deleting observation:", error);
      toast.error(error.message || `Ошибка при удалении наблюдения ID: ${observation.id}.`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader className="bg-muted/30 p-6">
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-4 border-background group-hover:opacity-80 transition-opacity">
                <AvatarImage src={avatarPreview || undefined} alt={nickname} />
                <AvatarFallback>{nickname?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Button
                variant="outline"
                size="icon"
                className="absolute bottom-0 right-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-muted"
                onClick={() => document.getElementById('avatarInput')?.click()}
              >
                <Edit3Icon className="h-4 w-4" />
                <span className="sr-only">Изменить аватар</span>
              </Button>
              <Input
                type="file"
                id="avatarInput"
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="flex-1">
              {isEditingNickname ? (
                <div className="flex items-center space-x-2">
                  <Input
                    type="text"
                    value={nickname}
                    onChange={handleNicknameChange}
                    className="text-2xl font-bold"
                    placeholder="Ваше имя пользователя"
                  />
                  <Button onClick={handleNicknameEditToggle} size="icon" aria-label="Сохранить имя пользователя">
                    <SaveIcon className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-2xl font-bold">{nickname}</CardTitle>
                  <Button onClick={handleNicknameEditToggle} variant="ghost" size="icon" aria-label="Редактировать имя пользователя">
                    <Edit3Icon className="h-5 w-5" />
                  </Button>
                </div>
              )}
              <CardDescription className="text-muted-foreground">{user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Роль</Label>
              <p className="text-lg font-semibold">{user.role}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Дата регистрации</Label>
              <p className="text-lg font-semibold">{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Активен</Label>
              <p className="text-lg font-semibold">{user.is_active ? 'Да' : 'Нет'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Подтвержден</Label>
              <p className="text-lg font-semibold">{user.is_verified ? 'Да' : 'Нет'}</p>
            </div>
            {user.last_login && (
              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-muted-foreground">Последний вход</Label>
                <p className="text-lg font-semibold">{new Date(user.last_login).toLocaleString()}</p>
              </div>
            )}
          </div>
          
          {avatarFile && (
            <div className="mt-6 flex flex-col items-center">
                <img src={avatarPreview || undefined} alt="Предпросмотр аватара" className="w-32 h-32 rounded-full object-cover mb-4 border"/>
                <Button onClick={handleAvatarSave} className="w-full sm:w-auto">
                    <UploadCloudIcon className="mr-2 h-4 w-4" /> Сохранить изменения аватара
                </Button>
            </div>
          )}

        </CardContent>
        <CardContent className="p-6 border-t">
          <Button onClick={handleLogout} variant="destructive" className="w-full">
            Выйти
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-8 mb-6">
        <CardHeader>
          <CardTitle>Мои наблюдения</CardTitle>
          <CardDescription>Здесь вы можете просматривать, редактировать и удалять свои загруженные наблюдения.</CardDescription>
        </CardHeader>
        <CardContent>
          <ObservationTable 
            observations={observations}
            speciesList={speciesList}
            isLoading={isLoading}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
          />
        </CardContent>
      </Card>

      {selectedObservation && (
        <EditObservationModal
          isOpen={isEditingModalOpen}
          onClose={handleCloseEditModal}
          onSave={handleSaveEdit}
          observation={selectedObservation}
          speciesList={speciesList}
          isLoading={isProcessingAction}
        />
      )}
    </div>
  );
};

export default ProfilePage; 
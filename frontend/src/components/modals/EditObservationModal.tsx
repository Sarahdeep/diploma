import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';

interface Species {
  id: number;
  name: string;
}

interface Observation {
  id: number;
  lat: number;
  lon: number;
  species: string;
  species_id?: number;
  image_url?: string | null;
  classification_confidence?: number | null;
}

interface EditObservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (observationId: number, newSpeciesId: number) => Promise<void>;
  observation: Observation | null;
  speciesList: Species[];
  isLoading?: boolean;
}

export const EditObservationModal: React.FC<EditObservationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  observation,
  speciesList,
  isLoading = false,
}) => {
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string>('');

  useEffect(() => {
    if (observation) {
        const currentSpecies = speciesList.find(s => s.name === observation.species);
        setSelectedSpeciesId(currentSpecies ? String(currentSpecies.id) : '');
    } else {
        setSelectedSpeciesId('');
    }
  }, [observation, speciesList]);

  const handleSaveClick = async () => {
    if (!observation || !selectedSpeciesId) return;
    const currentSpecies = speciesList.find(s => s.name === observation.species);
    if (currentSpecies && String(currentSpecies.id) === selectedSpeciesId) {
        onClose();
        return;
    }
    await onSave(observation.id, parseInt(selectedSpeciesId, 10));
  };

  if (!observation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Редактировать наблюдение ID: {observation.id}</DialogTitle>
          <DialogDescription>
            Измените вид для этого наблюдения. Нажмите "Сохранить" для применения изменений.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="species" className="text-right">
              Вид
            </Label>
            <Select
                value={selectedSpeciesId}
                onValueChange={setSelectedSpeciesId}
                disabled={isLoading || speciesList.length === 0}
            >
                 <SelectTrigger className="col-span-3">
                     <SelectValue placeholder={speciesList.length === 0 ? "Виды не загружены" : "Выберите новый вид"} />
                 </SelectTrigger>
                 <SelectContent>
                     {speciesList.map(species => (
                         <SelectItem key={species.id} value={String(species.id)}>
                             {species.name}
                         </SelectItem>
                     ))}
                 </SelectContent>
            </Select>

          </div>
           <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Координаты</Label>
                <span className="col-span-3 text-sm text-muted-foreground">
                    {observation.lat.toFixed(6)}, {observation.lon.toFixed(6)}
                </span>
           </div>

           {/* Confidence Display */}
           <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Уверенность</Label>
                <span className="col-span-3 text-sm text-muted-foreground">
                    {observation.classification_confidence !== null && observation.classification_confidence !== undefined
                        ? `${(observation.classification_confidence * 100).toFixed(1)}%`
                        : 'N/A'} 
                </span>
           </div>

           {/* Image Display */}
           <div className="grid grid-cols-4 items-start gap-4">
               <Label className="text-right pt-2">Фото</Label>
               <div className="col-span-3">
                   {observation.image_url ? (
                       <img
                           src={observation.image_url}
                           alt={`Observation ${observation.id}`}
                           className="w-full h-auto max-h-60 object-contain rounded border"
                       />
                   ) : (
                       <div className="text-sm text-muted-foreground h-20 flex items-center justify-center border rounded bg-slate-50">
                           (Нет изображения)
                       </div>
                   )}
               </div>
           </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
             <Button type="button" variant="outline" disabled={isLoading}>
                Отмена
             </Button>
          </DialogClose>
          <Button 
             type="button" 
             onClick={handleSaveClick} 
             disabled={isLoading || !selectedSpeciesId || (speciesList.find(s => s.name === observation.species)?.id === parseInt(selectedSpeciesId, 10))}
           >
            {isLoading ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 
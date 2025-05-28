"""Placeholder for Species related endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import models, schemas, auth
from database import get_db
from sqlalchemy import func
from celery_tasks.ml_tasks import trigger_model_retraining # Import the celery task

router = APIRouter(
    tags=["Species"],
    dependencies=[Depends(auth.get_current_active_user)], # Auth restored
)

@router.post("/", response_model=schemas.SpeciesRead, status_code=status.HTTP_201_CREATED)
async def create_species(
    species: schemas.SpeciesCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user) # Auth restored
):
    # Placeholder: Implement logic to create species
    # Check if species with the same name already exists
    db_species = db.query(models.Species).filter(func.lower(models.Species.name) == func.lower(species.name)).first()
    if db_species:
        raise HTTPException(status_code=400, detail=f"Species with name '{species.name}' already exists.")
    
    new_species = models.Species(**species.model_dump())
    db.add(new_species)
    db.commit()
    db.refresh(new_species)
    return new_species

@router.get("/", response_model=List[schemas.SpeciesRead])
async def read_all_species(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    # Placeholder: Implement logic to list species
    all_species = db.query(models.Species).offset(skip).limit(limit).all()
    return all_species

@router.get("/{species_id}", response_model=schemas.SpeciesRead)
async def read_species_by_id(species_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    # Placeholder: Implement logic to get a specific species
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    return db_species

# Add PUT, DELETE endpoints if needed 

@router.put("/{species_id}", response_model=schemas.SpeciesRead)
async def update_species(
    species_id: int, 
    species_update: schemas.SpeciesCreate, # Using SpeciesCreate for update, as it has all necessary fields
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user) # Auth restored
):
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    
    # Check for name conflict if name is being changed
    if species_update.name.lower() != db_species.name.lower():
        existing_species_with_name = db.query(models.Species).filter(func.lower(models.Species.name) == func.lower(species_update.name)).first()
        if existing_species_with_name and existing_species_with_name.id != species_id:
            raise HTTPException(status_code=400, detail=f"Another species with name '{species_update.name}' already exists.")

    update_data = species_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_species, key, value)
    
    db.commit()
    db.refresh(db_species)
    return db_species

@router.delete("/{species_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_species(
    species_id: int, 
    background_tasks: BackgroundTasks, # Add BackgroundTasks dependency
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user) # Auth restored
):
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    
    # Before deleting, get related observations to update them
    # Set species_id to None for observations associated with the deleted species
    db.query(models.Observation).filter(models.Observation.species_id == species_id).update({"species_id": None, "classification_confidence": None, "is_verified": False})
    
    db.delete(db_species)
    db.commit()
    
    # Trigger model retraining after species deletion
    background_tasks.add_task(trigger_model_retraining.delay)
    
    return # Returns 204 No Content 
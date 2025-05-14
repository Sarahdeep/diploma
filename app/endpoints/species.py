"""Placeholder for Species related endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import models, schemas, auth
from database import get_db

router = APIRouter(
    tags=["Species"],
    dependencies=[Depends(auth.get_current_active_user)], # Add auth if needed for all species endpoints
)

@router.post("/", response_model=schemas.Species, status_code=status.HTTP_201_CREATED)
async def create_species(species: schemas.SpeciesCreate, db: Session = Depends(get_db)):
    # Placeholder: Implement logic to create species
    # Check if species with the same name already exists
    db_species = db.query(models.Species).filter(models.Species.name == species.name).first()
    if db_species:
        raise HTTPException(status_code=400, detail="Species with this name already exists")
    
    new_species = models.Species(**species.model_dump())
    db.add(new_species)
    db.commit()
    db.refresh(new_species)
    return new_species

@router.get("/", response_model=List[schemas.Species])
async def read_species(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Placeholder: Implement logic to list species
    species_list = db.query(models.Species).offset(skip).limit(limit).all()
    return species_list

@router.get("/{species_id}", response_model=schemas.Species)
async def read_species_by_id(species_id: int, db: Session = Depends(get_db)):
    # Placeholder: Implement logic to get a specific species
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    return db_species

# Add PUT, DELETE endpoints if needed 

@router.put("/{species_id}", response_model=schemas.Species)
async def update_species(species_id: int, species_update: schemas.SpeciesCreate, db: Session = Depends(get_db)):
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    
    update_data = species_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_species, key, value)
    
    db.commit()
    db.refresh(db_species)
    return db_species

@router.delete("/{species_id}", response_model=schemas.Species)
async def delete_species(species_id: int, db: Session = Depends(get_db)):
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if db_species is None:
        raise HTTPException(status_code=404, detail="Species not found")
    
    db.delete(db_species)
    db.commit()
    return db_species 
"""Placeholder for Habitat Area related endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import models, schemas, auth
from database import get_db
from spatial_analysis import calculate_mcp, calculate_kde # Assuming these functions exist

router = APIRouter(
    prefix="/habitats",
    tags=["Habitats"],
    dependencies=[Depends(auth.get_current_active_user)]
)

def run_habitat_calculation(species_id: int, method: str, request_params: schemas.HabitatAreaCalculationRequest, db: Session):
    """Function to run in the background for calculating habitat areas."""
    print(f"Starting calculation for species {species_id}, method {method}")
    # 1. Fetch observations based on species_id and optional filters
    query = db.query(models.Observation).filter(models.Observation.species_id == species_id)
    # Apply filters from request_params.filters if provided (similar to read_observations)
    # ... (add filtering logic here)
    observations = query.all()
    observation_count = len(observations)
    if observation_count < 3: # Need at least 3 points for a polygon
        print(f"Insufficient data ({observation_count} points) for species {species_id}")
        # Optionally, log this failure or store a status
        return

    # Extract point coordinates (lon, lat) from observations
    points = [(obs.location.x, obs.location.y) for obs in observations] # Assumes location is loaded correctly

    # 2. Call the appropriate calculation function
    polygon_wkt = None
    if method.lower() == "mcp":
        # Requires implementation in spatial_analysis.py
        # Pass points and request_params.parameters (e.g., percentage)
        polygon_wkt = calculate_mcp(points, request_params.parameters)
    elif method.lower() == "kde":
        # Requires implementation in spatial_analysis.py
        # Pass points and request_params.parameters (e.g., h, level)
        polygon_wkt = calculate_kde(points, request_params.parameters)
    else:
        print(f"Unknown method: {method}")
        return

    if not polygon_wkt:
        print(f"Calculation failed for species {species_id}, method {method}")
        # Log failure
        return

    # 3. Save the result to HabitatArea table
    # Check if an area with the same species/method/params already exists? Overwrite or create new?
    # For simplicity, creating a new one here.
    
    # Convert WKT polygon to SRID=4326 format for DB
    db_polygon_wkt = f'SRID=4326;{polygon_wkt}'

    new_habitat_area = models.HabitatArea(
        species_id=species_id,
        method=method.upper(),
        polygon=db_polygon_wkt, # Store WKT string
        parameters=request_params.parameters,
        source_observation_count=observation_count
    )
    db.add(new_habitat_area)
    db.commit()
    print(f"Successfully calculated and saved habitat area for species {species_id}, method {method}")
    # Note: db session might need careful handling in background tasks.
    # Consider passing necessary data instead of the session or use a session scope.

@router.post("/{species_id}/{method}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_habitat_calculation(
    species_id: int,
    method: str, # e.g., "mcp" or "kde"
    request_params: schemas.HabitatAreaCalculationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    # current_user: models.User = Depends(auth.get_current_active_user) # Use if needed
):
    """Triggers the calculation of a habitat area (MCP or KDE). Runs in the background."""
    # Basic validation
    if method.lower() not in ["mcp", "kde"]:
        raise HTTPException(status_code=400, detail="Invalid method. Use 'mcp' or 'kde'.")
    
    # Check if species exists
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if not db_species:
        raise HTTPException(status_code=404, detail=f"Species with id {species_id} not found")

    # Add calculation task to background
    # Pass necessary data, avoid passing the db session directly if possible
    # or manage session scope carefully within the background task.
    background_tasks.add_task(run_habitat_calculation, species_id, method, request_params, db)

    return {"message": f"Habitat area calculation for species {species_id} using method {method} started in background."}

@router.get("/", response_model=List[schemas.HabitatAreaRead])
async def read_habitat_areas(
    species_id: Optional[int] = None,
    method: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieves calculated habitat areas, optionally filtered."""
    query = db.query(models.HabitatArea)
    if species_id:
        query = query.filter(models.HabitatArea.species_id == species_id)
    if method:
        query = query.filter(models.HabitatArea.method == method.upper())
    
    habitat_areas = query.order_by(models.HabitatArea.calculated_at.desc()).offset(skip).limit(limit).all()
    # Need to ensure the polygon is correctly serialized to GeoJSON format by the schema
    return habitat_areas

# Add GET by ID, DELETE if needed 

@router.get("/{habitat_id}", response_model=schemas.HabitatAreaRead)
async def read_habitat_area_by_id(habitat_id: int, db: Session = Depends(get_db)):
    db_habitat_area = db.query(models.HabitatArea).filter(models.HabitatArea.id == habitat_id).first()
    if db_habitat_area is None:
        raise HTTPException(status_code=404, detail="Habitat area not found")
    return db_habitat_area

@router.delete("/{habitat_id}", response_model=schemas.HabitatAreaRead) # Or return a status/message
async def delete_habitat_area(habitat_id: int, db: Session = Depends(get_db)):
    db_habitat_area = db.query(models.HabitatArea).filter(models.HabitatArea.id == habitat_id).first()
    if db_habitat_area is None:
        raise HTTPException(status_code=404, detail="Habitat area not found")
    
    db.delete(db_habitat_area)
    db.commit()
    return db_habitat_area 
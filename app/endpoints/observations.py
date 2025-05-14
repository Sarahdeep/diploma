"""Placeholder for Observation related endpoints."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List
import models, schemas, auth
from database import get_db
# Updated MinIO imports
from minio_client import minio_client, OBSERVATIONS_BUCKET, get_minio_url 
from exif_utils import extract_gps_datetime 
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint
from datetime import datetime, timezone # Ensure timezone is imported
import uuid
import io
import os

router = APIRouter(
    tags=["Observations"],
    dependencies=[Depends(auth.get_current_active_user)]
)

@router.post("/", response_model=schemas.ObservationRead, status_code=status.HTTP_201_CREATED)
async def create_observation(
    species_id: int = Form(...),
    file: UploadFile = File(...),
    # Add other optional form fields if needed (e.g., manual lat/lon, timestamp)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # Placeholder: 
    # 1. Check if species exists
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if not db_species:
        raise HTTPException(status_code=404, detail=f"Species with id {species_id} not found")

    # 2. Extract EXIF data (GPS, Datetime)
    content = await file.read() 
    gps_info = extract_gps_datetime(content) 
    # Check for valid GPS data if required by your logic (can be made optional)
    if not gps_info or gps_info.get('latitude') is None or gps_info.get('longitude') is None:
        raise HTTPException(status_code=400, detail="Could not extract valid GPS coordinates from image EXIF data.")
        # TODO: Consider allowing manual input as fallback

    # 3. Upload file to MinIO
    try:
        # Generate a unique object name
        file_extension = os.path.splitext(file.filename)[1] if file.filename else '.jpg' # Default ext
        object_name = f"{current_user.id}/{species_id}/{uuid.uuid4()}{file_extension}"
        
        # Reset stream position and upload
        file.file.seek(0) 
        minio_client.put_object(
            OBSERVATIONS_BUCKET,
            object_name,
            file.file, 
            length=file.size, # Provide size if available 
            content_type=file.content_type
        )
        
        # Construct a simple path or get a presigned URL
        # Option A: Simple path (if frontend/client knows how to construct full URL)
        # image_url = f"/{OBSERVATIONS_BUCKET}/{object_name}" 
        # Option B: Use presigned URL helper (if available and configured)
        image_url = get_minio_url(OBSERVATIONS_BUCKET, object_name) 
        if not image_url:
             # Fallback or raise error if URL generation fails but upload succeeded
             print(f"Warning: Uploaded {object_name} but failed to generate presigned URL.")
             image_url = f"/{OBSERVATIONS_BUCKET}/{object_name}" # Fallback to path

    except Exception as e:
        print(f"Error uploading to MinIO: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image to storage.")

    # 4. Create Observation record in DB
    
    # Convert lat/lon to WKT Point
    point_geom = ShapelyPoint(gps_info['longitude'], gps_info['latitude'])
    wkt_point = f'SRID=4326;{point_geom.wkt}' 

    # Extract relevant EXIF data for the metadata field if needed
    # image_metadata_to_store = { k: str(v) for k, v in (get_exif_data(content) or {}).items() }

    new_observation = models.Observation(
        location=wkt_point, 
        species_id=species_id,
        # Use EXIF timestamp if available, otherwise use current time
        timestamp=gps_info.get('timestamp') or datetime.now(timezone.utc), 
        image_url=image_url,
        source='image_upload',
        # Store specific EXIF data if needed
        # image_metadata=image_metadata_to_store, 
        user_id=current_user.id 
    )

    db.add(new_observation)
    db.commit()
    db.refresh(new_observation)
    
    # Pydantic handles conversion to schemas.ObservationRead including nested species
    return new_observation

@router.get("/", response_model=List[schemas.ObservationRead])
async def read_observations(
    filters: schemas.ObservationFilterParams = Depends(), 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    # Placeholder: Implement filtering logic
    query = db.query(models.Observation)
    
    if filters.species_id:
        query = query.filter(models.Observation.species_id == filters.species_id)
    if filters.start_date:
        query = query.filter(models.Observation.timestamp >= filters.start_date)
    if filters.end_date:
        query = query.filter(models.Observation.timestamp <= filters.end_date)
    # Add bounding box filter using PostGIS functions (e.g., ST_MakeEnvelope, ST_Intersects)
    if filters.min_lat is not None and filters.min_lon is not None and filters.max_lat is not None and filters.max_lon is not None:
        # Example using ST_MakeEnvelope and ST_Within (ensure PostGIS is enabled)
        from sqlalchemy import func as sql_func # Avoid conflict with schema func
        bbox = sql_func.ST_MakeEnvelope(filters.min_lon, filters.min_lat, filters.max_lon, filters.max_lat, 4326)
        query = query.filter(sql_func.ST_Within(models.Observation.location, bbox))

    observations = query.offset(skip).limit(limit).all()
    return observations

# Add GET by ID, PUT, DELETE if needed 

@router.get("/{observation_id}", response_model=schemas.ObservationRead)
async def read_observation_by_id(observation_id: int, db: Session = Depends(get_db)):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    return db_observation

@router.put("/{observation_id}", response_model=schemas.ObservationRead)
async def update_observation(
    observation_id: int, 
    obs_update: schemas.ObservationUpdate, 
    db: Session = Depends(get_db)
):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")

    update_data = obs_update.model_dump(exclude_unset=True)

    if "latitude" in update_data and "longitude" in update_data:
        point_geom = ShapelyPoint(update_data["longitude"], update_data["latitude"])
        db_observation.location = f'SRID=4326;{point_geom.wkt}'
        del update_data["latitude"]
        del update_data["longitude"]
    elif "latitude" in update_data or "longitude" in update_data:
        # If only one is provided, it's an invalid request for location update
        raise HTTPException(status_code=400, detail="Both latitude and longitude must be provided to update location.")

    for key, value in update_data.items():
        setattr(db_observation, key, value)
    
    db.commit()
    db.refresh(db_observation)
    return db_observation

@router.delete("/{observation_id}", response_model=schemas.ObservationRead) # Or return a status/message
async def delete_observation(observation_id: int, db: Session = Depends(get_db)):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    # TODO: Consider deleting the associated image from MinIO as well
    # This requires knowing the object_name stored in db_observation.image_url
    # and then calling minio_client.remove_object(OBSERVATIONS_BUCKET, object_name)
    # Example (needs error handling and parsing of object_name from image_url):
    # if db_observation.image_url:
    # try:
    # object_name = db_observation.image_url.split(f"/{OBSERVATIONS_BUCKET}/")[-1]
    # if "?" in object_name: # Handle presigned URLs if they contain bucket/object name
    #     object_name = object_name.split("?")[0]
    # minio_client.remove_object(OBSERVATIONS_BUCKET, object_name)
    # except Exception as e:
    # print(f"Error deleting image {db_observation.image_url} from MinIO: {e}")
    # # Decide if the DB record deletion should proceed or fail

    db.delete(db_observation)
    db.commit()
    return db_observation 
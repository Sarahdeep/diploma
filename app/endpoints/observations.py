from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List, Dict, Union, Optional
import json
import models, schemas, auth
from database import get_db, SessionLocal
from minio_client import minio_client, OBSERVATIONS_BUCKET, get_minio_url 
from exif_utils import extract_gps_datetime 
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint
from datetime import datetime, timezone
import uuid
import io
import os
import pandas as pd
import zipfile
from urllib.parse import urlparse
from models import UserRole # Assuming UserRole is in models
from middleware.auth import admin_required # Import admin_required
from celery_tasks.ml_tasks import classify_observation_image, trigger_model_retraining # Added trigger_model_retraining

router = APIRouter(
    tags=["Observations"],
    dependencies=[Depends(auth.get_current_active_user)],
)

@router.post("/", response_model=List[schemas.ObservationRead], status_code=status.HTTP_201_CREATED)
async def create_observation(
    species_id: Optional[int] = Form(None),
    files: List[UploadFile] = File(...),
    timestamp: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    created_observations = []
    for file in files:
        content = await file.read()
        # Reset file pointer for MinIO upload after reading for EXIF
        await file.seek(0)
        
        gps_info = extract_gps_datetime(content)

        current_latitude = latitude
        current_longitude = longitude
        current_timestamp_str = timestamp

        # If coordinates not provided in form, try to get from EXIF for this specific file
        if current_latitude is None or current_longitude is None:
            if gps_info and gps_info.get('latitude') is not None and gps_info.get('longitude') is not None:
                current_latitude = gps_info['latitude']
                current_longitude = gps_info['longitude']
            # else: # Removed the skip condition
                # print(f"Skipping file {file.filename}: Could not extract GPS coordinates from EXIF and not provided in form.")
                # continue # Skip to the next file
        
        # Set default coordinates if still None
        if current_latitude is None:
            current_latitude = 0.0 # Default latitude
            print(f"File {file.filename}: Latitude not found, using default: {current_latitude}")
        if current_longitude is None:
            current_longitude = 0.0 # Default longitude
            print(f"File {file.filename}: Longitude not found, using default: {current_longitude}")

        # If timestamp not provided in form, try to get from EXIF for this specific file
        if current_timestamp_str is None:
            if gps_info and gps_info.get('timestamp'):
                # gps_info['timestamp'] is already a datetime object if successfully extracted
                observation_dt = gps_info['timestamp']
            else:
                observation_dt = datetime.now(timezone.utc)
        else:
            try:
                observation_dt = datetime.fromisoformat(current_timestamp_str.replace('Z', '+00:00'))
            except ValueError:
                print(f"Skipping file {file.filename}: Invalid timestamp format provided in form.")
                continue # Skip to the next file

        current_species_id = species_id
        classification_confidence_val = None
        is_verified_val = False # Default to False

        # Ensure species_id exists if provided
        if current_species_id is not None:
            db_species = db.query(models.Species).filter(models.Species.id == current_species_id).first()
            if not db_species:
                print(f"Skipping file {file.filename}: Species ID {current_species_id} not found.")
                continue # Skip to the next file
            # If species ID is valid and provided by user, it's considered verified with 100% confidence
            is_verified_val = True
            classification_confidence_val = 1.0
            # Also trigger retraining if user provides species_id, as it implies new verified data
            # However, create_observation can create multiple observations. 
            # Triggering retraining for each might be excessive. 
            # Better to trigger once after all files in this request are processed if any were verified this way.
            # This will be handled after the loop.

        try:
            loop_filename = file.filename if file.filename else "image.jpg"
            # Construct object_name without species_id if it's None
            species_path_part = str(current_species_id) if current_species_id is not None else "unclassified"
            loop_file_extension = os.path.splitext(loop_filename)[1] if os.path.splitext(loop_filename)[1] else '.jpg'
            object_name_for_minio = f"users/{current_user.id}/observations/{species_path_part}/{uuid.uuid4()}{loop_file_extension}"

            if file.file is None: # Should not happen with UploadFile items from a list
                print(f"Skipping file {loop_filename}: File object is missing.")
                continue
            
            # Ensure file.file is the SpooledTemporaryFile itself
            # For multiple files, 'file' is an UploadFile instance, and file.file is its SpooledTemporaryFile.
            minio_client.put_object(
                OBSERVATIONS_BUCKET,
                object_name_for_minio,
                file.file, # Pass the file-like object
                length=file.size, # Use the size of the current file in the loop
                content_type=file.content_type
            )
        except Exception as e:
            print(f"Error uploading file {file.filename} to MinIO: {e}")
            continue # Skip to the next file

        point_geom = ShapelyPoint(current_longitude, current_latitude)
        wkt_point = f'SRID=4326;{point_geom.wkt}'

        new_observation = models.Observation(
            location=wkt_point,
            species_id=current_species_id,
            timestamp=observation_dt,
            image_url=object_name_for_minio,
            source='image_upload',
            user_id=current_user.id,
            classification_confidence=classification_confidence_val,
            is_verified=is_verified_val # Set is_verified status
        )
        db.add(new_observation)
        db.commit()
        db.refresh(new_observation)
        
        # Trigger classification if species_id was not provided and image exists
        if new_observation.species_id is None and new_observation.image_url:
            print(f"Observation ID {new_observation.id} created without species. Triggering classification task.")
            classify_observation_image.delay(
                observation_id=new_observation.id,
                image_minio_bucket=OBSERVATIONS_BUCKET,
                image_minio_object_name=new_observation.image_url
            )
        
        pydantic_obs_response = schemas.ObservationRead.from_orm(new_observation)
        if new_observation.image_url:
            pydantic_obs_response.image_url = get_minio_url(OBSERVATIONS_BUCKET, new_observation.image_url)
        
        created_observations.append(pydantic_obs_response)

    if not created_observations:
        # This condition might still be hit if ALL files fail for other reasons (e.g. MinIO upload, species_id not found when provided)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No observations were created. Check file details and logs for other errors.")
            
    return created_observations

@router.get("/", response_model=schemas.ObservationListResponse)
async def read_observations(
    species_id: Optional[int] = Query(None, description="Filter observations by species ID"),
    filters: schemas.ObservationFilterParams = Depends(), 
    min_confidence: Optional[float] = Query(None, ge=0, le=1, description="Minimum classification confidence"),
    min_lat: Optional[float] = Query(None, description="Minimum latitude for BBOX filter"),
    min_lon: Optional[float] = Query(None, description="Minimum longitude for BBOX filter"),
    max_lat: Optional[float] = Query(None, description="Maximum latitude for BBOX filter"),
    max_lon: Optional[float] = Query(None, description="Maximum longitude for BBOX filter"),
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    query = db.query(models.Observation)
    count_query = db.query(sql_func.count(models.Observation.id))
    
    parsed_start_date = None
    if filters.start_date:
        try:
            parsed_start_date = filters.start_date if isinstance(filters.start_date, datetime) else datetime.fromisoformat(str(filters.start_date).replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid start_date format: {filters.start_date}. Expected ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ).")

    parsed_end_date = None
    if filters.end_date:
        try:
            parsed_end_date = filters.end_date if isinstance(filters.end_date, datetime) else datetime.fromisoformat(str(filters.end_date).replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid end_date format: {filters.end_date}. Expected ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ).")

    if species_id is not None:
        query = query.filter(models.Observation.species_id == species_id)
        count_query = count_query.filter(models.Observation.species_id == species_id)
    if parsed_start_date:
        query = query.filter(models.Observation.timestamp >= parsed_start_date)
        count_query = count_query.filter(models.Observation.timestamp >= parsed_start_date)
    if parsed_end_date:
        query = query.filter(models.Observation.timestamp <= parsed_end_date)
        count_query = count_query.filter(models.Observation.timestamp <= parsed_end_date)
    
    if min_confidence is not None:
        query = query.filter(models.Observation.classification_confidence >= min_confidence)
        count_query = count_query.filter(models.Observation.classification_confidence >= min_confidence)
    
    if min_lat is not None and min_lon is not None and max_lat is not None and max_lon is not None:
        bbox = sql_func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
        query = query.filter(sql_func.ST_Within(models.Observation.location, bbox))
        count_query = count_query.filter(sql_func.ST_Within(models.Observation.location, bbox))

    total_count = count_query.scalar()

    db_observations = query.order_by(models.Observation.id.desc()).offset(skip).limit(limit).all()
    
    response_observations = []
    for db_obs in db_observations:
        pydantic_obs = schemas.ObservationRead.from_orm(db_obs)
        if db_obs.image_url:
            pydantic_obs.image_url = get_minio_url(OBSERVATIONS_BUCKET, db_obs.image_url)
        else:
            pydantic_obs.image_url = None
        response_observations.append(pydantic_obs)

    return schemas.ObservationListResponse(observations=response_observations, total_count=total_count)

@router.get("/{observation_id}", response_model=schemas.ObservationRead)
async def read_observation_by_id(observation_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    pydantic_obs = schemas.ObservationRead.from_orm(db_observation)

    if db_observation.image_url:
        pydantic_obs.image_url = get_minio_url(OBSERVATIONS_BUCKET, db_observation.image_url)
    else:
        pydantic_obs.image_url = None
        
    return pydantic_obs

@router.put("/{observation_id}", response_model=schemas.ObservationRead)
async def update_observation(
    observation_id: int,
    obs_update: schemas.ObservationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")

    update_data = obs_update.model_dump(exclude_unset=True)

    if "latitude" in update_data and "longitude" in update_data:
        point_geom = ShapelyPoint(update_data["longitude"], update_data["latitude"])
        db_observation.location = f'SRID=4326;{point_geom.wkt}'
        # Remove lat/lon from update_data as they are handled separately by location
        if "latitude" in update_data: del update_data["latitude"]
        if "longitude" in update_data: del update_data["longitude"]

    species_id_updated = False
    if "species_id" in update_data:
        if db_observation.species_id != update_data["species_id"]:
            species_id_updated = True
        # Ensure the new species_id is valid if it's not None
        if update_data["species_id"] is not None:
            db_species = db.query(models.Species).filter(models.Species.id == update_data["species_id"]).first()
            if not db_species:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Species ID {update_data['species_id']} not found.")
        db_observation.is_verified = True # User is manually setting/confirming species
        db_observation.classification_confidence = 1.0 # Set confidence to 100%

    for key, value in update_data.items():
        setattr(db_observation, key, value)
    
    db.commit()
    db.refresh(db_observation)
    return db_observation

@router.delete("/by_time_range", response_model=schemas.StandardResponseMessage)
async def delete_observations_by_time_range(
    delete_op_start_date: str = Query(..., description="Start date in ISO 8601 format (e.g., YYYY-MM-DDTHH:MM:SSZ)"), 
    delete_op_end_date: str = Query(..., description="End date in ISO 8601 format (e.g., YYYY-MM-DDTHH:MM:SSZ)"), 
    db: Session = Depends(get_db)
):
    try:
        start_date = datetime.fromisoformat(delete_op_start_date.replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(delete_op_end_date.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid date format for start_date or end_date. Expected ISO 8601. Error: {e}")

    if start_date >= end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be before end date.")

    observations_to_delete = db.query(models.Observation).filter(
        models.Observation.timestamp >= start_date,
        models.Observation.timestamp <= end_date
    ).all()

    if not observations_to_delete:
        return schemas.StandardResponseMessage(message=f"No observations found between {start_date} and {end_date}. Nothing deleted.", deleted_count=0)

    deleted_count = 0
    for obs in observations_to_delete:
        object_name_to_delete = obs.image_url
        if object_name_to_delete:
            try:
                minio_client.remove_object(OBSERVATIONS_BUCKET, object_name_to_delete)
            except Exception as e:
                print(f"Error deleting image '{object_name_to_delete}' from MinIO: {e}. Proceeding with DB record deletion.")
        
        db.delete(obs)
        deleted_count += 1
        
    db.commit()
    return schemas.StandardResponseMessage(message=f"Successfully deleted {deleted_count} observations between {start_date} and {end_date}.", deleted_count=deleted_count)

@router.delete("/{observation_id}", response_model=schemas.ObservationRead)
async def delete_observation(observation_id: int, db: Session = Depends(get_db)):
    db_observation = db.query(models.Observation).filter(models.Observation.id == observation_id).first()
    if db_observation is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    
    object_name_to_delete = db_observation.image_url 
    if object_name_to_delete:
        try:
            minio_client.remove_object(OBSERVATIONS_BUCKET, object_name_to_delete)
        except Exception as e:
            print(f"Error deleting image '{object_name_to_delete}' from MinIO: {e}. Proceeding with DB record deletion.")

    pydantic_response_object = schemas.ObservationRead.from_orm(db_observation)
    if db_observation.image_url:
        pydantic_response_object.image_url = get_minio_url(OBSERVATIONS_BUCKET, db_observation.image_url) 
    else:
        pydantic_response_object.image_url = None

    db.delete(db_observation)
    db.commit()
    
    return pydantic_response_object

@router.delete("/by_species/{species_id}", response_model=schemas.StandardResponseMessage)
async def delete_observations_by_species(species_id: int, db: Session = Depends(get_db)):
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if not db_species:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Species with id {species_id} not found.")

    observations_to_delete = db.query(models.Observation).filter(models.Observation.species_id == species_id).all()
    
    if not observations_to_delete:
        return schemas.StandardResponseMessage(message=f"No observations found for species ID {species_id}. Nothing deleted.", deleted_count=0)

    deleted_count = 0
    for obs in observations_to_delete:
        object_name_to_delete = obs.image_url
        if object_name_to_delete:
            try:
                minio_client.remove_object(OBSERVATIONS_BUCKET, object_name_to_delete)
            except Exception as e:
                print(f"Error deleting image '{object_name_to_delete}' from MinIO for observation ID {obs.id}: {e}. Proceeding with DB record deletion.")
        
        db.delete(obs)
        deleted_count += 1
    
    db.commit()
    return schemas.StandardResponseMessage(message=f"Successfully deleted {deleted_count} observations for species ID {species_id}.", deleted_count=deleted_count)

@router.post("/delete_by_area", response_model=schemas.StandardResponseMessage)
async def delete_observations_by_area(
    request_body: schemas.ObservationDeleteByAreaRequest,
    db: Session = Depends(get_db)
):
    try:
        area_geometry_data = request_body.area.model_dump()
        if not area_geometry_data or 'type' not in area_geometry_data or 'coordinates' not in area_geometry_data:
            raise HTTPException(status_code=400, detail="Invalid GeoJSON geometry provided.")

        from shapely.geometry import shape as shapely_shape
        try:
            shapely_geom = shapely_shape(area_geometry_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid GeoJSON geometry format: {e}")

        area_wkt = f'SRID=4326;{shapely_geom.wkt}'

        observations_to_delete = db.query(models.Observation).filter(
            sql_func.ST_Intersects(models.Observation.location, sql_func.ST_GeomFromText(area_wkt))
        ).all()

        if not observations_to_delete:
            return schemas.StandardResponseMessage(message="No observations found in the specified area.")

        deleted_count = 0
        for obs in observations_to_delete:
            object_name_to_delete = obs.image_url
            if object_name_to_delete:
                try:
                    minio_client.remove_object(OBSERVATIONS_BUCKET, object_name_to_delete)
                except Exception as e:
                    print(f"Error deleting image '{object_name_to_delete}' from MinIO: {e}. Proceeding with DB record deletion.")
            
            db.delete(obs)
            deleted_count += 1
        
        db.commit()
        return schemas.StandardResponseMessage(message=f"Successfully deleted {deleted_count} observations from the specified area.")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in delete_observations_by_area: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/check_species_in_csv", response_model=schemas.SpeciesCheckResponse)
async def check_species_in_csv_endpoint(
    csv_file: UploadFile = File(..., description="CSV file to check for species."),
    species_column_name: str = Form("species", description="Name of the column in CSV containing species names."),
    db: Session = Depends(get_db)
):
    try:
        csv_content = await csv_file.read()
        csv_file_like = io.BytesIO(csv_content)
        
        df = pd.read_csv(csv_file_like)
        
        if species_column_name not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{species_column_name}' not found in CSV.")
            
        csv_species_names = list(df[species_column_name].astype(str).str.strip().unique())
        
        db_species_query = db.query(models.Species.id, models.Species.name).all()
        db_species_list = [{"id": sp.id, "name": sp.name} for sp in db_species_query]
        db_species_names_set = {sp.name for sp in db_species_query}
        
        unmatched_csv_species = [name for name in csv_species_names if name not in db_species_names_set]
        
        return schemas.SpeciesCheckResponse(
            csv_species_names=csv_species_names,
            db_species=db_species_list,
            unmatched_csv_species=unmatched_csv_species
        )
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty or invalid.")
    except Exception as e:
        print(f"Error in /check_species_in_csv: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the CSV file: {str(e)}")

def process_dataset_upload_task(
    db_session_factory, 
    csv_content: bytes,
    archive_content: bytes,
    species_map_str: str,
    filename_column_name: str,
    species_column_name: str,
    uploader_user_id: Optional[int] = None # Added uploader_user_id
):
    db = db_session_factory()
    try:
        print(f"Starting background dataset processing (species created only via map). Filename col: '{filename_column_name}', Species col: '{species_column_name}'. Geo/Time from EXIF.")
        species_map: Dict[str, Union[int, str]] = json.loads(species_map_str)
        
        csv_file_like = io.BytesIO(csv_content)
        archive_file_like = io.BytesIO(archive_content)

        try:
            df = pd.read_csv(csv_file_like)
            expected_cols_from_user = {filename_column_name, species_column_name}
            if not expected_cols_from_user.issubset(df.columns):
                missing_cols = list(expected_cols_from_user - set(df.columns))
                print(f"CSV is missing user-specified columns for filename or species: {missing_cols}. Aborting.")
                return
        except Exception as e:
            print(f"Error reading CSV: {e}. Aborting.")
            return

        with zipfile.ZipFile(archive_file_like, 'r') as zip_ref:
            image_filenames_in_zip = zip_ref.namelist()
            processed_count = 0
            failed_count = 0
            skipped_no_exif_gps = 0

            for index, row in df.iterrows():
                try:
                    image_filename_csv = str(row[filename_column_name]).strip()
                    csv_species_name = str(row[species_column_name]).strip()
                    
                    # Normalize path separator from CSV to match ZIP's use of '/'
                    normalized_image_path_from_csv = image_filename_csv.replace("\\", "/")
                    
                    actual_image_path_in_zip = None
                    if normalized_image_path_from_csv in image_filenames_in_zip:
                        actual_image_path_in_zip = normalized_image_path_from_csv
                    elif f"./{normalized_image_path_from_csv}" in image_filenames_in_zip:
                        actual_image_path_in_zip = f"./{normalized_image_path_from_csv}"
                        
                    if not actual_image_path_in_zip:
                        print(f"Image '{image_filename_csv}' (normalized to '{normalized_image_path_from_csv}') (CSV row {index}) not found in ZIP. First 5 ZIP entries: {image_filenames_in_zip[:5]}. Skipping.")
                        failed_count += 1
                        continue

                    db_species = None
                    species_id_to_use = None

                    if csv_species_name in species_map:
                        mapping_action = species_map[csv_species_name]
                        if isinstance(mapping_action, str) and mapping_action.upper() == "CREATE_NEW":
                            db_species = db.query(models.Species).filter(models.Species.name == csv_species_name).first()
                            if not db_species:
                                print(f"Mapping: Creating new species '{csv_species_name}' as per map for row {index}.")
                                new_species_obj = models.Species(name=csv_species_name, description="Auto-created from CSV upload")
                                db.add(new_species_obj); db.commit(); db.refresh(new_species_obj)
                                db_species = new_species_obj
                            species_id_to_use = db_species.id
                        else: 
                            try:
                                species_id_to_use = int(mapping_action)
                                db_species = db.query(models.Species).filter(models.Species.id == species_id_to_use).first()
                                if not db_species:
                                    print(f"Mapping: Species ID '{species_id_to_use}' for '{csv_species_name}' (CSV row {index}) not found in DB. Skipping.")
                                    failed_count += 1; continue
                            except ValueError:
                                print(f"Mapping: Invalid species ID '{mapping_action}' for '{csv_species_name}' (CSV row {index}). Skipping.")
                                failed_count += 1; continue
                    else: 
                        db_species = db.query(models.Species).filter(models.Species.name == csv_species_name).first()
                        if db_species:
                            species_id_to_use = db_species.id
                        else:
                            print(f"Species '{csv_species_name}' (CSV row {index}) not found in DB and not in species_map. Skipping.")
                            failed_count += 1
                            continue
                    
                    if not species_id_to_use: 
                        print(f"Critical Error: Could not determine species ID for '{csv_species_name}' (CSV row {index}) after checks. Skipping.")
                        failed_count +=1; continue

                    with zip_ref.open(actual_image_path_in_zip) as image_file_in_zip:
                        image_bytes = image_file_in_zip.read()
                        
                        gps_info = extract_gps_datetime(image_bytes)
                        if not gps_info or gps_info.get('latitude') is None or gps_info.get('longitude') is None:
                            print(f"Could not extract valid GPS from EXIF for '{actual_image_path_in_zip}' (CSV row {index}). Skipping.")
                            skipped_no_exif_gps += 1
                            failed_count += 1
                            continue
                        
                        latitude = gps_info['latitude']
                        longitude = gps_info['longitude']
                        observation_timestamp = gps_info.get('timestamp') or datetime.now(timezone.utc)

                        image_file_stream = io.BytesIO(image_bytes)
                        file_extension = os.path.splitext(actual_image_path_in_zip)[1].lower()
                        content_type = 'image/jpeg' if file_extension in ['.jpg', '.jpeg'] else ('image/png' if file_extension == '.png' else 'application/octet-stream')
                        
                        # This is the object_name for MinIO
                        minio_object_name_for_storage = f"user_placeholder/{species_id_to_use}/{uuid.uuid4()}{file_extension}"
                        minio_client.put_object(OBSERVATIONS_BUCKET, minio_object_name_for_storage, image_file_stream, length=len(image_bytes), content_type=content_type)
                        # image_url_for_db = get_minio_url(OBSERVATIONS_BUCKET, minio_object_name_for_storage) or f"/{OBSERVATIONS_BUCKET}/{minio_object_name_for_storage}" # Old: storing full URL

                    point_geom = ShapelyPoint(longitude, latitude)
                    wkt_point = f'SRID=4326;{point_geom.wkt}'

                    new_observation = models.Observation(
                        location=wkt_point, 
                        species_id=species_id_to_use, 
                        timestamp=observation_timestamp,
                        image_url=minio_object_name_for_storage, # Store only the object_name in DB
                        source='batch_upload_exif_geo_time', 
                        user_id=uploader_user_id, # Use the passed uploader_user_id
                        is_verified=True, # Observations from admin bulk upload are auto-verified
                        classification_confidence=1.0 # Set confidence to 100% for verified uploads
                    )
                    db.add(new_observation)
                    processed_count += 1
                
                except Exception as e_row:
                    print(f"Error processing CSV row {index} (File: '{row.get(filename_column_name, 'N/A')}', Species: '{row.get(species_column_name, 'N/A')}'): {e_row}")
                    failed_count += 1
                    db.rollback()
                    continue

            db.commit()
            print(f"Dataset processing finished. Processed: {processed_count}, Failed: {failed_count}, Skipped (No EXIF GPS): {skipped_no_exif_gps}")

    except json.JSONDecodeError:
        print("Error: species_map was not valid JSON.")
    except Exception as e_task:
        print(f"Critical error in dataset processing task: {e_task}")
        if db.in_transaction(): db.rollback()
    finally:
        db.close()

@router.post("/upload_dataset", status_code=status.HTTP_202_ACCEPTED)
@admin_required() # Added admin protection
async def upload_dataset_endpoint(
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(auth.get_current_active_user), # Get current user
    archive: UploadFile = File(..., description="ZIP archive containing images."),
    csv: UploadFile = File(..., description="CSV file with metadata."),
    species_map: str = Form("{}", description="JSON string mapping CSV species names to DB IDs or 'CREATE_NEW'."),
    filename_column: str = Form("filename", description="Name of the column in CSV for image filenames."),
    species_column: str = Form("species", description="Name of the column in CSV for species names.")
):
    csv_content = await csv.read()
    archive_content = await archive.read()
    
    # Using SessionLocal directly for the background task
    background_tasks.add_task(
        process_dataset_upload_task, 
        SessionLocal, 
        csv_content, 
        archive_content, 
        species_map, 
        filename_column,
        species_column,
        current_user.id # Pass uploader_user_id
    )
    
    background_tasks.add_task(trigger_model_retraining.delay)
    

    return {"message": "Dataset processing started in the background. Model retraining will be triggered."} 
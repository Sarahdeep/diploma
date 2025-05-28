from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import numpy as np
from shapely.geometry import Point as ShapelyPoint, Polygon as ShapelyPolygon, MultiPolygon as ShapelyMultiPolygon
from shapely.wkt import loads as wkt_loads
from geojson_pydantic import Point as GeoJsonPoint, Polygon as GeoJsonPolygon, MultiPolygon as GeoJsonMultiPolygon

from database import get_db
from models import Observation, Species
import models
import schemas
from spatial_analysis import calculate_kde, calculate_overlap

router = APIRouter(
    tags=["Analysis"],
    responses={404: {"description": "Not found"}},
)

def get_observations_for_species_in_window(
    db: Session, 
    species_id: int, 
    window_start: datetime, 
    window_end: datetime
) -> List[models.Observation]:
    """Fetches observations for a given species within a time window."""
    return db.query(
        Observation,
        func.ST_X(Observation.location).label("longitude"),
        func.ST_Y(Observation.location).label("latitude")
    ).filter(
        Observation.species_id == species_id,
        Observation.timestamp >= window_start,
        Observation.timestamp <= window_end
    ).all()

def convert_shapely_to_geojson_pydantic(geometry: Any) -> Optional[Any]:
    """Converts a Shapely geometry to a Pydantic GeoJSON model compatible with schemas.
    Returns schemas.Point, schemas.Polygon, or geojson_pydantic.MultiPolygon.
    """
    if geometry is None or geometry.is_empty:
        return None
    if isinstance(geometry, ShapelyPoint):
        # Assuming schemas.Point is desired if a similar issue could arise for points elsewhere.
        # For this specific kde_polygon, Point is not directly used, but good for consistency.
        return schemas.Point(type="Point", coordinates=[geometry.x, geometry.y])
    elif isinstance(geometry, ShapelyPolygon):
        # Return schemas.Polygon for consistency with SpeciesHabitatTimePoint
        return schemas.Polygon(type="Polygon", coordinates=[[list(coord) for coord in geometry.exterior.coords]])
    elif isinstance(geometry, ShapelyMultiPolygon):
        polygons_coords = []
        for poly in geometry.geoms:
            # Each poly is a ShapelyPolygon, convert its exterior coords
            # The MultiPolygon structure in geojson_pydantic is [[[...]]]
            # So each polygon within multipolygon needs its coordinates wrapped appropriately
            polygons_coords.append([[list(coord) for coord in poly.exterior.coords]])
        return GeoJsonMultiPolygon(type="MultiPolygon", coordinates=polygons_coords)
    return None

@router.post("/overlap-trend", response_model=schemas.OverlapTrendResponse)
async def get_overlap_trend(
    request_data: schemas.AnalysisRequest,
    db: Session = Depends(get_db)
):
    species1 = db.query(Species).filter(Species.id == request_data.species1_id).first()
    species2 = db.query(Species).filter(Species.id == request_data.species2_id).first()
    if not species1 or not species2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both species not found")

    overlap_data: List[schemas.OverlapTrendPoint] = []
    current_time = request_data.start_date

    while current_time <= request_data.end_date:
        window_end = current_time
        window_start = current_time - timedelta(days=request_data.observation_window_days)
        
        # Get observations for species 1
        raw_obs1_list = get_observations_for_species_in_window(db, request_data.species1_id, window_start, window_end)
        points1 = np.array([(row.longitude, row.latitude) for row in raw_obs1_list if row.longitude is not None and row.latitude is not None])
        
        # Get observations for species 2
        raw_obs2_list = get_observations_for_species_in_window(db, request_data.species2_id, window_start, window_end)
        points2 = np.array([(row.longitude, row.latitude) for row in raw_obs2_list if row.longitude is not None and row.latitude is not None])

        kde1_result, kde2_result = None, None
        if len(points1) >= 3:
            kde1_result = calculate_kde(
                points1,
                level_percent=request_data.kde_level_percent,
                grid_size=request_data.kde_grid_size
            )
        
        if len(points2) >= 3:
            kde2_result = calculate_kde(
                points2,
                level_percent=request_data.kde_level_percent,
                grid_size=request_data.kde_grid_size
            )

        overlap_stats = {"intersection_area": 0, "overlap_index": 0}
        if kde1_result and kde1_result.get('polygon_wkt') and kde2_result and kde2_result.get('polygon_wkt'):
            poly1_wkt = kde1_result['polygon_wkt']
            poly2_wkt = kde2_result['polygon_wkt']
            overlap_stats = calculate_overlap(poly1_wkt, poly2_wkt)
        
        overlap_data.append(schemas.OverlapTrendPoint(
            time=current_time, # This time represents the end of the window for which calculation is done
            overlap_area=overlap_stats["intersection_area"],
            overlap_index=overlap_stats["overlap_index"]
        ))
        
        current_time += timedelta(days=request_data.time_step_days)
        
    return schemas.OverlapTrendResponse(data=overlap_data)

@router.post("/habitat-evolution", response_model=schemas.HabitatEvolutionResponse)
async def get_habitat_evolution(
    request_data: schemas.AnalysisRequest,
    db: Session = Depends(get_db)
):
    species1 = db.query(Species).filter(Species.id == request_data.species1_id).first()
    species2 = db.query(Species).filter(Species.id == request_data.species2_id).first()
    if not species1 or not species2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both species not found")

    habitat_data: List[schemas.SpeciesHabitatTimePoint] = []
    current_time = request_data.start_date

    species_ids_to_process = [request_data.species1_id, request_data.species2_id]

    while current_time <= request_data.end_date:
        window_end = current_time
        window_start = current_time - timedelta(days=request_data.observation_window_days)

        for species_id in species_ids_to_process:
            # obs_list will be a list of Row objects
            raw_obs_list = get_observations_for_species_in_window(db, species_id, window_start, window_end)
            points = np.array([(row.longitude, row.latitude) for row in raw_obs_list if row.longitude is not None and row.latitude is not None])
            
            centroid_geojson = None
            kde_geojson = None
            
            if len(points) > 0:
                # Calculate centroid of raw points
                mean_lon_np, mean_lat_np = np.mean(points, axis=0)
                # Convert numpy floats to Python floats for Pydantic model
                mean_lon = float(mean_lon_np)
                mean_lat = float(mean_lat_np)
                # Use schemas.Point for the centroid
                centroid_geojson = schemas.Point(type="Point", coordinates=[mean_lon, mean_lat])

            if len(points) >= 3:
                kde_result = calculate_kde(
                    points,
                    level_percent=request_data.kde_level_percent,
                    grid_size=request_data.kde_grid_size
                )
                if kde_result and kde_result.get('polygon_wkt'):
                    shapely_geom = wkt_loads(kde_result['polygon_wkt'])
                    kde_geojson = convert_shapely_to_geojson_pydantic(shapely_geom)
            
            habitat_data.append(schemas.SpeciesHabitatTimePoint(
                time=current_time,
                species_id=species_id,
                centroid=centroid_geojson,
                kde_polygon=kde_geojson,
                observation_count=len(raw_obs_list) # Use raw_obs_list here for count
            ))
            
        current_time += timedelta(days=request_data.time_step_days)
        
    return schemas.HabitatEvolutionResponse(data=habitat_data) 
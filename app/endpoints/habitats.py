"""Endpoints for Habitat Area related operations."""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

import models, schemas, auth
from database import get_db
from spatial_analysis import calculate_mcp, calculate_kde # calculate_overlap (пока не используется здесь)
from geoalchemy2.shape import to_shape # Ensure this import is present

# Для конвертации WKT в GeoJSON
from shapely import wkt as shapely_wkt # Даем псевдоним, чтобы не конфликтовать с возможным schemas.wkt
from geojson import Feature as GeoJSONFeature # Используем для создания GeoJSON Feature объекта

router = APIRouter(
    tags=["Habitats"],
    # dependencies=[Depends(auth.get_current_active_user)] # Аутентификация пока убрана для простоты
)

# --- Helper function to get observations --- (можно вынести в отдельный модуль utils)
def get_filtered_observations(
    db: Session, 
    species_id: int, 
    filters: Optional[schemas.ObservationFilterParams] = None
) -> List[models.Observation]:
    query = db.query(models.Observation).filter(models.Observation.species_id == species_id)
    if filters:
        if filters.start_date:
            query = query.filter(models.Observation.timestamp >= filters.start_date)
        if filters.end_date:
            query = query.filter(models.Observation.timestamp <= filters.end_date)
        # Добавьте здесь другие фильтры из ObservationFilterParams, если они появятся
        # например, по bbox, если это будет необходимо для выборки данных для расчета
    return query.all()

# --- Эндпоинт для расчета и СОХРАНЕНИЯ ареала (существующий) ---
def run_habitat_calculation(
    db: Session, # Передаем сессию явно, чтобы управлять ее жизненным циклом в фоне
    species_id: int, 
    method: str, 
    request_params: schemas.HabitatAreaCalculationRequest
):
    """Function to run in the background for calculating and SAVING habitat areas."""
    print(f"Background task: Starting calculation for species {species_id}, method {method}")
    
    observations = get_filtered_observations(db, species_id, request_params.filters)
    observation_count = len(observations)

    points = []
    valid_obs_count = 0
    if observations:
        for obs in observations:
            if obs.location is not None:
                try:
                    shape = to_shape(obs.location) # Convert WKBElement to Shapely geometry
                    points.append((shape.x, shape.y))
                    valid_obs_count += 1
                except Exception as e:
                    print(f"Could not process location for observation {obs.id} during save: {e}")
            else:
                print(f"Observation {obs.id} has no location data (save task).")

    print(f"Background task: Extracted {len(points)} valid points from {observation_count} observations for species {species_id} (method: {method}).")

    if len(points) < 3:
        print(f"Background task: Insufficient valid data ({len(points)} points from {observation_count} observations) for species {species_id}. Calculation aborted.")
        # Можно добавить логирование статуса ошибки в БД, если есть такая модель
        return

    polygon_wkt_string = None
    if method.lower() == "mcp":
        polygon_wkt_string = calculate_mcp(points, request_params.parameters)
    elif method.lower() == "kde":
        polygon_wkt_string = calculate_kde(
            points, 
            h_meters=request_params.parameters.get('h_meters'),  # Извлекаем h_meters как число
            level_percent=request_params.parameters.get('level_percent', 90.0),  # Извлекаем level_percent с дефолтным значением
            grid_size=request_params.parameters.get('grid_size', 100)  # Извлекаем grid_size с дефолтным значением
        )
    else:
        print(f"Background task: Unknown method: {method} for species {species_id}")
        return

    if not polygon_wkt_string:
        print(f"Background task: Calculation failed (polygon_wkt is None) for species {species_id}, method {method}")
        return

    # Для PostGIS/GeoAlchemy2 ожидается формат 'SRID=4326;POLYGON((...))'
    db_polygon_srid_wkt = f'SRID=4326;{polygon_wkt_string}'

    # Проверка, есть ли user_id (если аутентификация включена и пользователь передан)
    # current_user_id = getattr(current_user, 'id', None) # Пример

    new_habitat_area = models.HabitatArea(
        species_id=species_id,
        method=method.upper(),
        polygon=db_polygon_srid_wkt, # Сохраняем как SRID WKT
        parameters=request_params.parameters,
        source_observation_count=len(points),
        # user_id=current_user_id # Пример, если сохраняем пользователя
    )
    try:
        db.add(new_habitat_area)
        db.commit()
        print(f"Background task: Successfully calculated and SAVED habitat area for species {species_id}, method {method}")
    except Exception as e:
        db.rollback()
        print(f"Background task: Error saving habitat area for species {species_id}, method {method}: {e}")
    finally:
        # Если сессия создается специально для задачи, ее нужно закрыть.
        # Если используется глобальная сессия или Depends(get_db), закрытие происходит автоматически.
        pass # db.close() - если сессия создавалась вручную для этой задачи

@router.post("/{species_id}/{method}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_habitat_calculation_and_save(
    species_id: int,
    method: str,
    request_params: schemas.HabitatAreaCalculationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    # current_user: models.User = Depends(auth.get_current_active_user) # Если нужна аутентификация
):
    """Triggers the calculation and SAVING of a habitat area (MCP or KDE). Runs in the background."""
    if method.lower() not in ["mcp", "kde"]:
        raise HTTPException(status_code=400, detail="Invalid method. Use 'mcp' or 'kde'.")
    
    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if not db_species:
        raise HTTPException(status_code=404, detail=f"Species with id {species_id} not found")

    # Важно: передаем параметры и db в фоновую задачу. Управление сессией БД в фоне требует внимания.
    # Лучше создать новую сессию внутри фоновой задачи или использовать контекстный менеджер.
    # Для простоты пока передаем существующую, но это может быть не идеально для долгих задач.
    background_tasks.add_task(run_habitat_calculation, db, species_id, method, request_params)

    return {"message": f"Habitat area calculation for species {species_id} using method {method} started in background and will be saved."}

# --- НОВЫЙ Эндпоинт для ПРЕДПРОСМОТРА ареала --- 
@router.post("/preview/{species_id}/{method}", response_model=schemas.HabitatAreaPreviewResponse)
async def preview_habitat_calculation(
    species_id: int,
    method: str,
    request_params: schemas.HabitatAreaCalculationRequest,
    db: Session = Depends(get_db),
):
    """Calculates a habitat area for PREVIEW without saving to DB."""
    if method.lower() not in ["mcp", "kde"]:
        raise HTTPException(status_code=400, detail="Invalid method. Use 'mcp' or 'kde'.")

    db_species = db.query(models.Species).filter(models.Species.id == species_id).first()
    if not db_species:
        raise HTTPException(status_code=404, detail=f"Species with id {species_id} not found")

    observations = get_filtered_observations(db, species_id, request_params.filters)
    observation_count = len(observations)
    
    points = []
    valid_obs_count = 0
    if observations:
        for obs in observations:
            if obs.location is not None:
                try:
                    shape = to_shape(obs.location)
                    points.append((shape.x, shape.y))
                    valid_obs_count += 1
                except Exception as e:
                    print(f"Could not process location for observation {obs.id} during preview: {e}")
            else:
                print(f"Observation {obs.id} has no location data (preview task).")
    
    print(f"Preview task: Extracted {len(points)} valid points from {observation_count} observations for species {species_id} (method: {method}).")

    if len(points) < 3:
        raise HTTPException(status_code=400, detail=f"Insufficient valid data ({len(points)} points from {observation_count} observations) for species {species_id} to calculate {method.upper()}. Minimum 3 points required.")

    result = None
    if method.lower() == "mcp":
        polygon_wkt_string = calculate_mcp(points, request_params.parameters)
        if polygon_wkt_string:
            result = {'polygon_wkt': polygon_wkt_string, 'grid_points': None}
    elif method.lower() == "kde":
        result = calculate_kde(
            points, 
            h_meters=request_params.parameters.get('h_meters'),  # Извлекаем h_meters как число
            level_percent=request_params.parameters.get('level_percent', 90.0),  # Извлекаем level_percent с дефолтным значением
            grid_size=request_params.parameters.get('grid_size', 100)  # Извлекаем grid_size с дефолтным значением
        )
    
    calculated_polygon_geojson_dict = None
    grid_points = None
    if result and result.get('polygon_wkt'):
        try:
            shapely_geom = shapely_wkt.loads(result['polygon_wkt'])
            calculated_polygon_geojson_dict = GeoJSONFeature(geometry=shapely_geom, properties={}).geometry
            grid_points = result.get('grid_points')
        except Exception as e:
            print(f"Error converting WKT to GeoJSON for preview: {e}")
            raise HTTPException(status_code=500, detail=f"Error converting calculated area to GeoJSON: {e}")

    if not calculated_polygon_geojson_dict:
        print(f"Preview calculation result was None or WKT conversion failed for species {species_id}, method {method}")
        return schemas.HabitatAreaPreviewResponse(
            method=method.upper(),
            parameters=request_params.parameters,
            source_observation_count=valid_obs_count,
            polygon=None,
            species_id=species_id,
            grid_points=None
        )

    return schemas.HabitatAreaPreviewResponse(
        method=method.upper(),
        parameters=request_params.parameters,
        source_observation_count=valid_obs_count,
        polygon=calculated_polygon_geojson_dict,
        species_id=species_id,
        grid_points=grid_points
    )

# --- Эндпоинт для чтения сохраненных ареалов (существующий) ---
@router.get("/", response_model=List[schemas.HabitatAreaRead])
async def read_habitat_areas(
    species_id: Optional[int] = None,
    method: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Retrieves SAVED calculated habitat areas, optionally filtered."""
    query = db.query(models.HabitatArea)
    if species_id is not None:
        query = query.filter(models.HabitatArea.species_id == species_id)
    if method:
        query = query.filter(models.HabitatArea.method == method.upper())
    
    habitat_areas = query.order_by(models.HabitatArea.calculated_at.desc()).offset(skip).limit(limit).all()
    return habitat_areas

# --- Эндпоинт для чтения перекрытия (существующий, но может потребовать доработки) ---
@router.post("/overlap/{species1_id}/{species2_id}", response_model=schemas.HabitatOverlapResult)
async def calculate_habitat_overlap(
    species1_id: int,
    species2_id: int,
    # Теперь метод и параметры для расчета ареалов приходят в теле,
    # если мы хотим рассчитывать их на лету для сравнения.
    # Либо мы должны полагаться на уже сохраненные ареалы.
    # request_body: schemas.HabitatOverlapCalculationRequest, # Пример новой схемы
    method_for_areas: str = Query("kde", description="Method (mcp or kde) to use for fetching/calculating base habitat areas for overlap."),
    # TODO: Подумать, как передавать параметры для базовых ареалов, если их нет
    db: Session = Depends(get_db)
):
    """Calculates the overlap between habitat areas of two species."""
    from spatial_analysis import calculate_overlap # Импорт здесь, чтобы избежать циклического импорта на верхнем уровне

    if method_for_areas.lower() not in ["mcp", "kde"]:
        raise HTTPException(status_code=400, detail="Invalid method_for_areas. Use 'mcp' or 'kde'.")
    
    # Получаем ПОСЛЕДНИЕ СОХРАНЕННЫЕ ареалы для обоих видов указанным методом
    # Это означает, что для анализа перекрытия ареалы должны быть предварительно рассчитаны и сохранены.
    # Альтернатива: рассчитывать их на лету здесь, если их нет (потребует параметров).
    habitat1 = db.query(models.HabitatArea)\
        .filter(models.HabitatArea.species_id == species1_id,
                models.HabitatArea.method == method_for_areas.upper())\
        .order_by(models.HabitatArea.calculated_at.desc())\
        .first()
        
    habitat2 = db.query(models.HabitatArea)\
        .filter(models.HabitatArea.species_id == species2_id,
                models.HabitatArea.method == method_for_areas.upper())\
        .order_by(models.HabitatArea.calculated_at.desc())\
        .first()
    
    if not habitat1 or not habitat2:
        missing_species = []
        if not habitat1: missing_species.append(str(species1_id))
        if not habitat2: missing_species.append(str(species2_id))
        raise HTTPException(
            status_code=404,
            detail=f"Saved {method_for_areas.upper()} habitat areas not found for species ID(s): {', '.join(missing_species)}. Calculate and save them first or use a preview-based overlap."
        )
    
    # Расчет пересечения
    # calculate_overlap должна принимать WKT полигоны
    # models.HabitatArea.polygon хранит 'SRID=4326;WKT'
    # Нужно извлечь только WKT часть для spatial_analysis.calculate_overlap
    polygon1_wkt = habitat1.polygon.split(';', 1)[1] if habitat1.polygon and ';' in habitat1.polygon else habitat1.polygon
    polygon2_wkt = habitat2.polygon.split(';', 1)[1] if habitat2.polygon and ';' in habitat2.polygon else habitat2.polygon

    if not polygon1_wkt or not polygon2_wkt:
        raise HTTPException(status_code=500, detail="Failed to extract WKT from saved habitat polygons.")

    overlap_metrics = calculate_overlap(polygon1_wkt, polygon2_wkt)

    intersection_geom_geojson = None
    if overlap_metrics.get('intersection_wkt'):
        try:
            shapely_geom = shapely_wkt.loads(overlap_metrics['intersection_wkt'])
            intersection_geom_geojson = GeoJSONFeature(geometry=shapely_geom, properties={}).geometry
        except Exception as e:
            print(f"Error converting intersection WKT to GeoJSON: {e}")
    
    return schemas.HabitatOverlapResult(
        species1_id=species1_id,
        species2_id=species2_id,
        method=method_for_areas.upper(), # Метод, использованный для базовых ареалов
        intersection_area=overlap_metrics['intersection_area_km2'],
        union_area=overlap_metrics['union_area_km2'],
        jaccard_index=overlap_metrics['jaccard_index'],
        overlap_coeff_species1=overlap_metrics['overlap_coeff_species1'],
        overlap_coeff_species2=overlap_metrics['overlap_coeff_species2'],
        intersection_geometry=intersection_geom_geojson
    )

# Можно добавить GET by ID, DELETE и т.д. для habitat_areas, если нужно управлять ими более детально
# Например:
@router.get("/{habitat_id}", response_model=schemas.HabitatAreaRead)
async def read_habitat_area_by_id(habitat_id: int, db: Session = Depends(get_db)):
    db_habitat_area = db.query(models.HabitatArea).filter(models.HabitatArea.id == habitat_id).first()
    if db_habitat_area is None:
        raise HTTPException(status_code=404, detail="Habitat area not found")
    return db_habitat_area

@router.delete("/{habitat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habitat_area(habitat_id: int, db: Session = Depends(get_db)):
    db_habitat_area = db.query(models.HabitatArea).filter(models.HabitatArea.id == habitat_id).first()
    if db_habitat_area is None:
        raise HTTPException(status_code=404, detail="Habitat area not found")
    
    try:
        db.delete(db_habitat_area)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting habitat area: {e}")
    return 
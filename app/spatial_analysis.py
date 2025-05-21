"""Spatial analysis functions for habitat area calculations (MCP, KDE)."""
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from shapely.geometry import Point, Polygon as ShapelyPolygon, MultiPoint
from sklearn.neighbors import KernelDensity
from scipy.stats import gaussian_kde
import geopandas as gpd
from shapely.ops import unary_union
import warnings

def calculate_mcp(points: List[Tuple[float, float]], parameters: Dict[str, Any]) -> Optional[str]:
    """Calculates the Minimum Convex Polygon (MCP).
    
    As described in section 5.1 of the thesis, this method creates the smallest
    convex polygon containing all points.

    Args:
        points: List of (longitude, latitude) tuples.
        parameters: Dictionary containing:
            - percentage: Optional float (0-100) to exclude outliers.
                          If provided, creates a percentage MCP.

    Returns:
        WKT string of the MCP polygon or None if calculation fails.
    """
    if len(points) < 3:
        return None
    
    # Convert points to numpy array for calculations
    points_array = np.array(points)
    
    # Handle percentage MCP if specified
    percentage = parameters.get('percentage')
    if percentage is not None:
        try:
            percentage = float(percentage)
            if not 0 < percentage <= 100:
                raise ValueError("Percentage must be between 0 and 100")
            
            # Calculate distances from centroid
            centroid = np.mean(points_array, axis=0)
            distances = np.sqrt(np.sum((points_array - centroid) ** 2, axis=1))
            
            # Find threshold distance for the specified percentage
            threshold = np.percentile(distances, percentage)
            
            # Filter points within threshold
            mask = distances <= threshold
            filtered_points = points_array[mask]
            
            if len(filtered_points) < 3:
                return None
                
            points = [(p[0], p[1]) for p in filtered_points]
        except (ValueError, TypeError) as e:
            warnings.warn(f"Error processing percentage parameter: {e}")
            # Fall back to full MCP
    
    # Create Shapely MultiPoint and calculate convex hull
    multi_point = MultiPoint(points)
    mcp_polygon = multi_point.convex_hull
    
    if isinstance(mcp_polygon, ShapelyPolygon):
        return mcp_polygon.wkt
        return None

def calculate_kde(
    points: np.ndarray,
    h_meters: float, # Bandwidth in meters (converted from degrees in endpoint)
    level_percent: float = 90.0,
    grid_size: int = 100,
    # Add latitude for accurate conversion back if needed, or just use h_degrees directly
) -> Optional[Dict[str, Any]]:
    """Calculates the Kernel Density Estimation (KDE) contour polygon.
    
    As described in section 5.2 of the thesis, this method creates density-based
    contours using Gaussian kernel density estimation.

    Args:
        points: List of (longitude, latitude) tuples.
        parameters: Dictionary containing:
            - h_meters: Bandwidth parameter for KDE
            - level_percent: Contour level (0-100) representing the percentage of points
                    to include within the contour
            - grid_size: Optional number of grid cells (default: 100)

    Returns:
        Dictionary containing:
        - polygon_wkt: WKT string of the KDE contour polygon
        - grid_points: List of dictionaries with lat, lng, and density values
    """
    if not points or len(points) < 3:
        print(f"KDE: Not enough points ({len(points) if points else 0}). Returning None.")
        return None
    
    h = h_meters
    level_percent = level_percent
    grid_size = grid_size

    print(f"KDE: Input points count: {len(points)}")
    print(f"KDE: Parameters received - h_meters: {h}, level_percent: {level_percent}, grid_size: {grid_size}")

    if h is None or level_percent is None:
        print(f"KDE: Missing h_meters ({h}) or level_percent ({level_percent}). Returning None.")
        return None

    try:
        h = float(h)
        level_percent = float(level_percent)
        if not (0 < level_percent <= 100):
            print(f"KDE: level_percent ({level_percent}) out of range (0-100). Returning None.")
            return None
        if h <= 0:
            print(f"KDE: h_meters ({h}) must be positive. Returning None.")
            return None

        points_array = np.array(points)
        
        x_min, y_min = points_array.min(axis=0)
        x_max, y_max = points_array.max(axis=0)
        print(f"KDE: Points bounds - X: [{x_min}, {x_max}], Y: [{y_min}, {y_max}]")
        
        x_pad = (x_max - x_min) * 0.1 if (x_max - x_min) > 1e-6 else 0.1
        y_pad = (y_max - y_min) * 0.1 if (y_max - y_min) > 1e-6 else 0.1
        
        x_grid = np.linspace(x_min - x_pad, x_max + x_pad, grid_size)
        y_grid = np.linspace(y_min - y_pad, y_max + y_pad, grid_size)
        
        xx, yy = np.meshgrid(x_grid, y_grid)
        positions = np.vstack([xx.ravel(), yy.ravel()])
        
        print(f"KDE: Calculating gaussian_kde with bw_method (h parameter) = {h}")
        kernel = gaussian_kde(points_array.T, bw_method=h)
        z = np.reshape(kernel(positions).T, xx.shape)
        
        # Calculate the density threshold for the contour
        density_threshold = np.percentile(z, 100 - level_percent)
        print(f"KDE: Density Z min: {z.min()}, max: {z.max()}, threshold for {level_percent}%: {density_threshold}")
        
        from matplotlib import pyplot as plt
        plt.figure(figsize=(1,1))
        contour_set = plt.contour(xx, yy, z, levels=[density_threshold])
        plt.close()
        
        all_segments = contour_set.allsegs[0]
        print(f"KDE: Found {len(all_segments)} contour segments at threshold {density_threshold}.")

        if len(all_segments) > 0:
            valid_polygons = []
            for seg in all_segments:
                if len(seg) >= 3:
                    try:
                        poly = ShapelyPolygon(seg)
                        if poly.is_valid and poly.area > 1e-9:
                           valid_polygons.append(poly)
                    except Exception as e_poly:
                        print(f"KDE: Error creating ShapelyPolygon from segment: {e_poly}")
            
            if not valid_polygons:
                print("KDE: No valid polygons found from contour segments.")
                return None

            final_geometry = unary_union(valid_polygons)
            print(f"KDE: Final geometry type: {final_geometry.geom_type}")

            if final_geometry.is_empty:
                print("KDE: Final geometry is empty after union. Returning None.")
                return None

            # Create grid points with densities
            grid_points = []
            for i in range(grid_size):
                for j in range(grid_size):
                    lat = y_grid[j]
                    lon = x_grid[i]
                    density = z[j, i]
                    if density > 0: # Only include points with non-zero density
                        grid_points.append({
                            'lat': lat,
                            'lng': lon,
                            'density': float(density) # Convert numpy float to Python float
                        })

            return {
                'polygon_wkt': final_geometry.wkt,
                'grid_points': grid_points,
                'max_density': float(np.max(z)) # Include max density
            }
        else:
            print("KDE: No contour segments found at the specified density level. Returning None.")
            return None
            
    except Exception as e:
        warnings.warn(f"Error in KDE calculation: {e}")
        print(f"KDE: Exception: {e}")
        return None

def calculate_overlap(habitat1_wkt: str, habitat2_wkt: str) -> Dict[str, float]:
    """Calculates the overlap between two habitat areas.
    
    As described in section 5.2 of the thesis, this calculates various overlap
    indices between two habitat areas.

    Args:
        habitat1_wkt: WKT string of first habitat polygon
        habitat2_wkt: WKT string of second habitat polygon

    Returns:
        Dictionary containing overlap metrics:
        - intersection_area: Area of intersection
        - union_area: Area of union
        - overlap_index: Ratio of intersection to union (0-1)
    """
    try:
        # Create polygons from WKT
        poly1 = ShapelyPolygon.from_wkt(habitat1_wkt)
        poly2 = ShapelyPolygon.from_wkt(habitat2_wkt)
        
        # Calculate areas
        intersection = poly1.intersection(poly2)
        union = poly1.union(poly2)
        
        intersection_area = intersection.area
        union_area = union.area
        
        # Calculate overlap index (similar to Jaccard index)
        overlap_index = intersection_area / union_area if union_area > 0 else 0
        
        return {
            "intersection_area": intersection_area,
            "union_area": union_area,
            "overlap_index": overlap_index
        }
    except Exception as e:
        warnings.warn(f"Error calculating overlap: {e}")
        return {
            "intersection_area": 0,
            "union_area": 0,
            "overlap_index": 0
        } 
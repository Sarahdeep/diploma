"""Spatial analysis functions for habitat area calculations (MCP, KDE)."""
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from shapely.geometry import Point, Polygon as ShapelyPolygon, MultiPoint
from sklearn.neighbors import KernelDensity
from scipy.stats import gaussian_kde
import geopandas as gpd
from shapely.ops import unary_union
from shapely.wkt import loads as wkt_loads
import warnings
import logging # Import logging

# Configure a basic logger (ideally this is done at application entry point)
# For an assistant, we assume logging might be pre-configured or use basicConfig.
# If not, this will set up a default logger.
# logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

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
    return None # Explicit return if not a polygon (e.g. Point or LineString for <3 unique points)

def calculate_kde(
    points: np.ndarray,
    h_degrees: Optional[float] = None, # Changed to Optional, default None
    level_percent: float = 90.0,
    grid_size: int = 100,
) -> Optional[Dict[str, Any]]:
    """Calculates the Kernel Density Estimation (KDE) contour polygon.
    
    Note: This function performs calculations in geographic coordinates (degrees).
    For highest accuracy in area and distance, consider projecting points to a
    planar CRS before KDE and converting the resulting polygon back.
    If 'h_degrees' is provided, it must be appropriate for degree units.
    If 'h_degrees' is None, Silverman's rule will be used for bandwidth estimation.

    Args:
        points: NumPy array of (longitude, latitude) coordinates.
        h_degrees: Optional. Bandwidth for KDE in decimal degrees. 
                   If None, Silverman's rule is used.
        level_percent: Contour level (0-100) representing the percentage of points
                       to include within the contour.
        grid_size: Number of grid cells (e.g., 100 for a 100x100 grid).

    Returns:
        Dictionary containing:
        - polygon_wkt: WKT string of the KDE contour polygon
        - grid_points: List of dictionaries with lat, lng, and density values
        - max_density: Maximum density value found on the grid
        Or None if calculation fails.
    """
    if not isinstance(points, np.ndarray): # Ensure points is a numpy array
        logging.warning("KDE: 'points' is not a NumPy array. Attempting conversion.")
        try:
            points = np.array(points)
            if points.ndim != 2 or points.shape[1] != 2:
                raise ValueError("Points array must be 2D with shape (n, 2).")
        except Exception as e:
            logging.error(f"KDE: Could not convert points to valid NumPy array: {e}")
            return None

    if len(points) < 3:
        logging.info(f"KDE: Not enough points ({len(points)}). Requires at least 3. Returning None.")
        return None
    
    # Parameter validation
    bw_method_for_kde: Any = None # To store the final bandwidth method
    if h_degrees is not None:
        if not (isinstance(h_degrees, (float, int)) and h_degrees > 0):
            logging.error(f"KDE: Provided h_degrees ({h_degrees}) must be a positive number. Returning None.")
            return None
        bw_method_for_kde = h_degrees
        logging.info(f"KDE: Using provided h_degrees: {h_degrees}")
    else:
        bw_method_for_kde = 'silverman'
        logging.info("KDE: h_degrees not provided, using Silverman's rule for bandwidth estimation.")

    if not (isinstance(level_percent, (float, int)) and 0 < level_percent <= 100):
        logging.error(f"KDE: level_percent ({level_percent}) out of range (0-100). Returning None.")
        return None
    if not (isinstance(grid_size, int) and grid_size > 1):
        logging.error(f"KDE: grid_size ({grid_size}) must be an integer greater than 1. Returning None.")
        return None

    logging.info(f"KDE: Input points count: {len(points)}")
    logging.info(f"KDE: Parameters - h_degrees: {h_degrees}, level_percent: {level_percent}, grid_size: {grid_size}")

    try:
        x_min, y_min = points.min(axis=0)
        x_max, y_max = points.max(axis=0)
        logging.info(f"KDE: Points bounds - X: [{x_min}, {x_max}], Y: [{y_min}, {y_max}]")
        
        # Padding: 10% of range, or 0.1 units if range is very small (in degrees)
        x_range = x_max - x_min
        y_range = y_max - y_min
        x_pad = x_range * 0.1 if x_range > 1e-6 else 0.1 
        y_pad = y_range * 0.1 if y_range > 1e-6 else 0.1
        
        x_grid = np.linspace(x_min - x_pad, x_max + x_pad, grid_size)
        y_grid = np.linspace(y_min - y_pad, y_max + y_pad, grid_size)
        
        xx, yy = np.meshgrid(x_grid, y_grid)
        positions = np.vstack([xx.ravel(), yy.ravel()])
        
        logging.info(f"KDE: Calculating gaussian_kde with bw_method = {bw_method_for_kde}")
        # points.T transposes (N,2) to (2,N) as required by gaussian_kde
        kernel = gaussian_kde(points.T, bw_method=bw_method_for_kde) 
        z = np.reshape(kernel(positions).T, xx.shape)
        
        density_threshold = np.percentile(z, 100 - level_percent)
        logging.info(f"KDE: Density Z min: {z.min():.4e}, max: {z.max():.4e}, threshold for {level_percent}%: {density_threshold:.4e}")
        
        from matplotlib import pyplot as plt # Local import
        fig = plt.figure() # Create figure explicitly
        contour_set = plt.contour(xx, yy, z, levels=[density_threshold])
        plt.close(fig) # Close the specific figure
        
        if not contour_set.allsegs or not contour_set.allsegs[0]:
            logging.info("KDE: No contour segments found at the specified density level. This might be due to low data density or inappropriate bandwidth.")
            return None
            
        all_segments = contour_set.allsegs[0]
        logging.info(f"KDE: Found {len(all_segments)} contour segments at threshold {density_threshold:.4e}.")

        valid_polygons = []
        for i, seg in enumerate(all_segments):
            if len(seg) >= 3: # Need at least 3 points for a polygon
                try:
                    poly = ShapelyPolygon(seg)
                    if poly.is_valid:
                        if poly.area > 1e-9: # Check for non-negligible area (in squared degrees)
                           valid_polygons.append(poly)
                        else:
                           logging.debug(f"KDE: Segment {i} resulted in polygon with negligible area ({poly.area:.2e}). Skipping.")
                    else:
                       logging.warning(f"KDE: Segment {i} resulted in an invalid polygon. Attempting to buffer by 0.")
                       buffered_poly = poly.buffer(0) # Try to fix invalid polygon
                       if buffered_poly.is_valid and buffered_poly.area > 1e-9:
                           valid_polygons.append(buffered_poly)
                           logging.info(f"KDE: Segment {i} fixed by zero-buffering.")
                       else:
                           logging.warning(f"KDE: Zero-buffering failed or resulted in negligible area for segment {i}. Original WKT: {poly.wkt}. Skipping.")
                except Exception as e_poly:
                    logging.error(f"KDE: Error creating/validating ShapelyPolygon from segment {i}: {e_poly}")
            else:
                logging.debug(f"KDE: Segment {i} has less than 3 points ({len(seg)}). Skipping.")
        
        if not valid_polygons:
            logging.warning("KDE: No valid polygons found from contour segments after processing.")
            return None

        final_geometry = unary_union(valid_polygons)
        logging.info(f"KDE: Final geometry type: {final_geometry.geom_type}, Is empty: {final_geometry.is_empty}")

        if final_geometry.is_empty:
            logging.warning("KDE: Final geometry is empty after union. Returning None.")
            return None

        grid_points_data = []
        if grid_size <= 200: # Avoid excessive data for large grids
            for i_grid in range(grid_size):
                for j_grid in range(grid_size):
                    density = z[j_grid, i_grid] # Correct indexing for z (yy corresponds to rows)
                    if density > 1e-9: # Only include points with non-negligible density
                        grid_points_data.append({
                            'lat': float(y_grid[j_grid]),
                            'lng': float(x_grid[i_grid]),
                            'density': float(density)
                        })
        else:
            logging.info("KDE: Grid size > 200, skipping detailed grid_points data to save space.")


        return {
            'polygon_wkt': final_geometry.wkt,
            'grid_points': grid_points_data,
            'max_density': float(np.max(z))
        }
            
    except Exception as e:
        logging.exception("KDE: Unhandled exception during calculation.") # Use logging.exception to include stack trace
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
        poly1 = wkt_loads(habitat1_wkt)
        poly2 = wkt_loads(habitat2_wkt)
        
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
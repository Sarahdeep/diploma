import os
import random
import datetime
import piexif
from glob import glob
import shutil # Added for file copying

# --- Configuration ---
ARCTIC_FOX_SOURCE_DIR = r"D:\diploma\arctic_fox"
RED_FOX_SOURCE_DIR = r"D:\diploma\red_fox"

ARCTIC_FOX_OUTPUT_DIR = r"D:\diploma\arctic_fox_coord_2"
RED_FOX_OUTPUT_DIR = r"D:\diploma\red_fox_coord_2"

# Reference point
CENTER_LAT = 70.669
CENTER_LON = 90.826

# Overall Latitude ranges for species (degrees) - used for clamping
ARCTIC_FOX_CLAMP_LAT_RANGE = (70.4, 71.2)  # North of 70.4
RED_FOX_CLAMP_LAT_RANGE = (70.0, 70.8)    # South of 70.8
# Overlap zone: 70.4 to 70.8

# Overall Longitude range for both species (degrees) - used for clamping
CLAMP_LON_RANGE = (CENTER_LON - 0.8, CENTER_LON + 0.8) # e.g., 90.026 to 91.626

# Gaussian distribution parameters for more realistic spread
MU_LAT_ARCTIC = 70.8  # Mean latitude for Arctic Fox (more northern)
MU_LAT_RED = 70.4    # Mean latitude for Red Fox (more southern)
# CENTER_LON will be used as MU_LON for both

SIGMA_LAT = 0.2      # Standard deviation for latitude (controls N-S spread)
SIGMA_LON = 0.4      # Standard deviation for longitude (controls E-W spread)

# Year for timestamps
YEAR = 2024

# --- Helper Functions ---

def to_deg_min_sec(decimal_degrees):
    """Converts decimal degrees to (degrees, minutes, seconds) tuples for EXIF."""
    is_positive = decimal_degrees >= 0
    decimal_degrees = abs(decimal_degrees)
    degrees = int(decimal_degrees)
    minutes_float = (decimal_degrees - degrees) * 60
    minutes = int(minutes_float)
    seconds_float = (minutes_float - minutes) * 60
    # EXIF stores these as fractions (numerator, denominator)
    return (degrees, 1), (minutes, 1), (int(seconds_float * 10000), 10000)

def generate_random_datetime(year):
    """Generates a random datetime object within the specified year."""
    start_date = datetime.datetime(year, 1, 1)
    end_date = datetime.datetime(year, 12, 31, 23, 59, 59)
    time_between_dates = end_date - start_date
    days_between_dates = time_between_dates.days
    random_number_of_days = random.randrange(days_between_dates)
    random_date = start_date + datetime.timedelta(days=random_number_of_days)
    random_hour = random.randint(0, 23)
    random_minute = random.randint(0, 59)
    random_second = random.randint(0, 59)
    return random_date.replace(hour=random_hour, minute=random_minute, second=random_second)

# --- Main Processing Function ---

def update_exif_data(target_image_path, mu_lat, mu_lon, sigma_lat, sigma_lon, 
                     clamp_lat_range, clamp_lon_range, year):
    """
    Generates random GPS (Gaussian distribution) and datetime metadata 
    and updates the EXIF data of the target_image_path.
    """
    try:
        # Generate random GPS coordinates using Gaussian distribution
        latitude = random.gauss(mu_lat, sigma_lat)
        longitude = random.gauss(mu_lon, sigma_lon)

        # Clamp coordinates to the defined absolute ranges
        latitude = max(clamp_lat_range[0], min(latitude, clamp_lat_range[1]))
        longitude = max(clamp_lon_range[0], min(longitude, clamp_lon_range[1]))

        lat_ref = 'N' if latitude >= 0 else 'S'
        lon_ref = 'E' if longitude >= 0 else 'W'

        exif_latitude = to_deg_min_sec(latitude)
        exif_longitude = to_deg_min_sec(longitude)

        # Generate random datetime
        random_dt = generate_random_datetime(year)
        exif_datetime_str = random_dt.strftime("%Y:%m:%d %H:%M:%S")
        exif_date_str = random_dt.strftime("%Y:%m:%d") # For GPSDateStamp
        exif_time_tuple = (random_dt.hour, 1), (random_dt.minute, 1), (random_dt.second, 1)


        # Prepare EXIF dictionary
        gps_ifd = {
            piexif.GPSIFD.GPSLatitudeRef: lat_ref,
            piexif.GPSIFD.GPSLatitude: exif_latitude,
            piexif.GPSIFD.GPSLongitudeRef: lon_ref,
            piexif.GPSIFD.GPSLongitude: exif_longitude,
            piexif.GPSIFD.GPSTimeStamp: exif_time_tuple,
            piexif.GPSIFD.GPSDateStamp: exif_date_str,
            piexif.GPSIFD.GPSVersionID: [2, 2, 0, 0] # Standard version
        }
        exif_ifd = {
            piexif.ExifIFD.DateTimeOriginal: exif_datetime_str,
            piexif.ExifIFD.DateTimeDigitized: exif_datetime_str,
        }

        exif_dict = {"GPS": gps_ifd, "Exif": exif_ifd}

        # Load existing EXIF data if any, or create new if not
        try:
            existing_exif = piexif.load(target_image_path)
            existing_exif["GPS"] = gps_ifd
            existing_exif["Exif"].update(exif_ifd) # Update existing ExifIFD
            if piexif.ImageIFD.DateTime not in existing_exif["0th"]: # main image metadata
                 existing_exif["0th"][piexif.ImageIFD.DateTime] = exif_datetime_str
            exif_bytes = piexif.dump(existing_exif)
        except piexif.InvalidImageDataError: # No EXIF data or non-JPEG
            print(f"Warning: Could not load existing EXIF for {target_image_path}. Creating new.")
            exif_dict["0th"] = {piexif.ImageIFD.DateTime: exif_datetime_str} # Basic primary image info
            exif_bytes = piexif.dump(exif_dict)
        except Exception as e: # Catch other piexif errors during load
            print(f"Error loading EXIF for {target_image_path}: {e}. Skipping.")
            return

        # Save the image with new EXIF data
        piexif.insert(exif_bytes, target_image_path)
        print(f"Copied and updated EXIF for: {target_image_path} (Lat: {latitude:.4f}, Lon: {longitude:.4f}, Date: {exif_datetime_str})")

    except FileNotFoundError:
        print(f"Error: Image file not found at {target_image_path}")
    except Exception as e:
        print(f"An unexpected error occurred while processing {target_image_path}: {e}")

def process_species_images(source_dir, output_dir, species_name, 
                           mu_lat, mu_lon, sigma_lat, sigma_lon, 
                           clamp_lat_range, clamp_lon_range, year):
    """Processes all JPEG images from source_dir, copies them to output_dir, and updates EXIF."""
    print(f"\nProcessing {species_name} images from {source_dir} to {output_dir}...")
    
    if not os.path.isdir(source_dir):
        print(f"Error: Source directory not found: {source_dir}")
        return

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    image_files = []
    for ext in ('*.jpg', '*.jpeg', '*.JPG', '*.JPEG'):
        image_files.extend(glob(os.path.join(source_dir, ext)))

    if not image_files:
        print(f"No JPEG images found in {source_dir}")
        return

    for source_image_file in image_files:
        base_name = os.path.basename(source_image_file)
        destination_image_path = os.path.join(output_dir, base_name)

        try:
            # Copy the file
            shutil.copy2(source_image_file, destination_image_path)
            
            # Update EXIF data on the copied file
            update_exif_data(destination_image_path, mu_lat, mu_lon, sigma_lat, sigma_lon, 
                             clamp_lat_range, clamp_lon_range, year)
        except Exception as e:
            print(f"Error processing or copying {source_image_file} to {destination_image_path}: {e}")

# --- Script Execution ---
if __name__ == "__main__":
    print("Starting EXIF data modification script (copying files to new directories)...")

    # Process Arctic Fox images
    process_species_images(ARCTIC_FOX_SOURCE_DIR, ARCTIC_FOX_OUTPUT_DIR, "Arctic Fox", 
                           MU_LAT_ARCTIC, CENTER_LON, SIGMA_LAT, SIGMA_LON, 
                           ARCTIC_FOX_CLAMP_LAT_RANGE, CLAMP_LON_RANGE, YEAR)

    # Process Red Fox images
    process_species_images(RED_FOX_SOURCE_DIR, RED_FOX_OUTPUT_DIR, "Red Fox", 
                           MU_LAT_RED, CENTER_LON, SIGMA_LAT, SIGMA_LON, 
                           RED_FOX_CLAMP_LAT_RANGE, CLAMP_LON_RANGE, YEAR)

    print("\nScript finished.")
    print(f"Modified images saved to {ARCTIC_FOX_OUTPUT_DIR} and {RED_FOX_OUTPUT_DIR}")
    print("Please verify the EXIF data of a few images in the new directories.") 
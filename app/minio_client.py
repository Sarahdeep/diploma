from minio import Minio
from minio.error import S3Error
import os
import time
from typing import Optional, BinaryIO
from datetime import timedelta
from urllib.parse import urlparse, urlunparse

# --- Configuration ---
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "XfV24RoHXs0uc9D5Xdiv")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "p7sr5FLqT1bD21V22n4FigdXOplODUVaChw0R5wD")
MINIO_SECURE = os.getenv("MINIO_SECURE", "False").lower() == "true"
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")

# --- Client Instance ---
# Single client instance configured for internal comms
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

# --- Bucket Names ---
IMAGES_BUCKET = "images"
DATASETS_BUCKET = "datasets"
OBSERVATIONS_BUCKET = "observations"
AVATARS_BUCKET = "avatars"

# --- Functions ---
def ensure_buckets_exist(max_retries: int = 5, retry_delay: int = 5):
    """Ensure required buckets exist in MinIO with retry logic (uses internal client)."""
    required_buckets = [IMAGES_BUCKET, OBSERVATIONS_BUCKET, AVATARS_BUCKET, DATASETS_BUCKET]
    # Add back IMAGES_BUCKET, DATASETS_BUCKET if they are still needed elsewhere

    for attempt in range(max_retries):
        try:
            # Use the single client
            for bucket_name in required_buckets:
                 if not minio_client.bucket_exists(bucket_name):
                    print(f"Attempting to create bucket: {bucket_name}")
                    minio_client.make_bucket(bucket_name)
                    print(f"Bucket {bucket_name} created (or already existed).")
            return True
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Failed to create buckets after {max_retries} attempts: {e}")
                raise
            print(f"Attempt {attempt + 1} failed: {e}. Retrying in {retry_delay} seconds...")
            time.sleep(retry_delay)
    return False

def upload_file(file_path: str, bucket: str, object_name: str) -> bool:
    """Upload a file to MinIO."""
    try:
        minio_client.fput_object(
            bucket,
            object_name,
            file_path
        )
        return True
    except Exception as e:
        print(f"Error uploading file to MinIO: {e}")
        return False

def delete_file(bucket: str, object_name: str) -> bool:
    """Delete a file from MinIO."""
    try:
        minio_client.remove_object(bucket, object_name)
        return True
    except Exception as e:
        print(f"Error deleting file from MinIO: {e}")
        return False

def get_minio_url(bucket: str, object_name: str, expires: int = 3600) -> Optional[str]:
    """Generate a presigned URL using the publicly accessible MinIO configuration."""
    try:
        expires_delta = timedelta(seconds=expires)

        # Parse the public URL to configure the client for presigning
        parsed_public_url = urlparse(MINIO_PUBLIC_URL)
        public_endpoint = parsed_public_url.netloc  # e.g., "localhost:9000" or "yourdomain.com"
        public_secure = parsed_public_url.scheme == 'https'

        # Create a temporary client configured for the public endpoint
        presigning_client = Minio(
            public_endpoint,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=public_secure,
            region='us-east-1'  # Explicitly set region to avoid connection attempt
        )

        # Generate the presigned URL using the public-facing client
        public_url = presigning_client.presigned_get_object(
            bucket,
            object_name,
            expires=expires_delta
        )

        return public_url
    except S3Error as e:
        print(f"S3 Error generating presigned URL: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error generating presigned URL: {e}")
        return None

async def upload_file_object_and_get_url(
    file_data: BinaryIO,
    object_name: str,
    content_type: str,
    bucket_name: str = AVATARS_BUCKET
) -> Optional[str]:
    """Upload a file object to MinIO and return its public URL."""
    try:
        file_data.seek(0, os.SEEK_END)
        file_size = file_data.tell()
        file_data.seek(0)

        minio_client.put_object(
            bucket_name,
            object_name,
            data=file_data,
            length=file_size,
            content_type=content_type,
        )
        
        # Construct the public URL
        if MINIO_PUBLIC_URL.endswith('/'):
            public_url_base = MINIO_PUBLIC_URL
        else:
            public_url_base = MINIO_PUBLIC_URL + "/"
            
        if bucket_name.startswith('/'):
            bucket_path_part = bucket_name.lstrip('/')
        else:
            bucket_path_part = bucket_name
        
        public_url = f"{public_url_base}{bucket_path_part}/{object_name.lstrip('/')}"
        
        return public_url
    except S3Error as e:
        print(f"MinIO S3 Error uploading file object: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error uploading file object to MinIO: {e}")
        return None 
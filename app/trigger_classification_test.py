# app/trigger_classification_test.py
import os
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

# Assuming your database.py and models.py are accessible
# If running this script from /app in the container, direct imports should work
# due to PYTHONPATH=/app or current working directory.
# from database import DATABASE_URL # Your actual DATABASE_URL from database.py or config
from models import Observation as ObservationModel
from minio_client import OBSERVATIONS_BUCKET # Your default observations bucket

# Import the Celery task
# Assuming celery_tasks/ml_tasks.py is accessible
from celery_tasks.ml_tasks import classify_observation_image

def main():
    print("Connecting to database...")
    # Get DATABASE_URL from environment after dotenv load
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in environment. Make sure it's set in your .env file or environment.")
        return
        
    engine = create_engine(db_url)
    SessionLocalTest = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocalTest()
    print("Database session established.")

    try:
        print("Querying for an unverified observation with an image...")
        observation_to_test = db.query(ObservationModel).filter(
            ObservationModel.is_verified == False,
            ObservationModel.image_url != None # Ensure there's an image
        ).order_by(ObservationModel.id).first() # Get the first one, order for consistency

        if not observation_to_test:
            print("No unverified observations with an image_url found in the database.")
            return

        obs_id = observation_to_test.id
        minio_object_name = observation_to_test.image_url
        minio_bucket_name = OBSERVATIONS_BUCKET # Using the default from your minio_client

        print(f"Found Observation ID: {obs_id}")
        print(f"  Image URL (MinIO Object Name): {minio_object_name}")
        print(f"  MinIO Bucket: {minio_bucket_name}")
        print(f"  Current is_verified status: {observation_to_test.is_verified}")
        print(f"  Current species_id: {observation_to_test.species_id}")
        print(f"  Current classification_confidence: {observation_to_test.classification_confidence}")

        print(f"\nSending classification task for Observation ID: {obs_id}...")
        task_result = classify_observation_image.delay(
            observation_id=obs_id,
            image_minio_bucket=minio_bucket_name,
            image_minio_object_name=minio_object_name
        )
        print(f"Classification Task ID: {task_result.id}. Check Celery worker logs.")
        print("The task will attempt to predict the species and update the database record.")

    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        db.close()
        print("Database session closed.")

if __name__ == "__main__":
    from dotenv import load_dotenv
    # Attempt to load .env from the script's directory first
    script_dir_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    # Attempt to load .env from the current working directory if not found next to script
    # (this covers case where script is in /app and .env is in /app when CWD=/app)
    cwd_env_path = os.path.join(os.getcwd(), '.env')
    # Attempt to load from parent if script is in a subdirectory like /app/scripts and .env is in /app
    parent_dir_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')

    loaded_env = False
    if os.path.exists(script_dir_env_path):
        load_dotenv(dotenv_path=script_dir_env_path)
        print(f"Loaded .env file from script directory: {script_dir_env_path}")
        loaded_env = True
    elif os.path.exists(cwd_env_path):
        load_dotenv(dotenv_path=cwd_env_path)
        print(f"Loaded .env file from current working directory: {cwd_env_path}")
        loaded_env = True
    elif os.path.exists(parent_dir_env_path):
        load_dotenv(dotenv_path=parent_dir_env_path)
        print(f"Loaded .env file from parent directory: {parent_dir_env_path}")
        loaded_env = True
        
    if not loaded_env:
        print("Warning: .env file not found at expected locations. Database/MinIO connections might fail if not set globally.")
            
    main() 
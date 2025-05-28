import os
import tempfile
# import shutil # Not strictly needed if os.remove is used for single files
from celery.utils.log import get_task_logger

# Imports assuming '/app' is the package root and on PYTHONPATH
from celery_app import celery 

# Import from app.scripts... for robustness
from scripts.model_training import run_training as run_model_training_script
from scripts.model_training import MODEL_SAVE_DIR as TRAINING_MODEL_SAVE_DIR 
from scripts.model_training import MODEL_FILENAME as TRAINING_MODEL_FILENAME

from image_classifier import ImageClassifier
from minio_client import minio_client # Import the actual client
from database import SessionLocal
from models import Observation as ObservationModel, Species as SpeciesModel
import numpy as np # Might be needed if ImageClassifier or its inputs need it

logger = get_task_logger(__name__)

# CURRENT_MODEL_PATH is derived from constants in model_training.py
# This ensures it's consistent with where the training script saves the model.
# MODEL_SAVE_DIR in model_training.py is PROJECT_ROOT/ml_models.
# If PROJECT_ROOT (derived in model_training.py) is 'app', then this path is 'app/ml_models'.
# This matches ImageClassifier's default MODEL_PATH = "app/ml_models/active_classifier.pth".
CURRENT_MODEL_PATH_FOR_RETRAINING = os.path.join(TRAINING_MODEL_SAVE_DIR, TRAINING_MODEL_FILENAME)

@celery.task(name="app.celery_tasks.ml_tasks.trigger_model_retraining")
def trigger_model_retraining():
    logger.info("Task: trigger_model_retraining started.")
    
    initial_weights_for_training = None
    if os.path.exists(CURRENT_MODEL_PATH_FOR_RETRAINING):
        initial_weights_for_training = CURRENT_MODEL_PATH_FOR_RETRAINING
        logger.info(f"Using existing model at {initial_weights_for_training} as initial weights for retraining.")
    else:
        logger.info(f"No existing model found at {CURRENT_MODEL_PATH_FOR_RETRAINING}. Training will use ImageNet or random init as per training script logic.")

    try:
        run_model_training_script(initial_weights_path=initial_weights_for_training)
        logger.info("Task: trigger_model_retraining completed successfully.")
        return {"status": "success", "message": "Model retraining process finished."}
    except Exception as e:
        logger.error(f"Task: trigger_model_retraining failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

@celery.task(name="app.celery_tasks.ml_tasks.classify_observation_image")
def classify_observation_image(observation_id: int, image_minio_bucket: str, image_minio_object_name: str):
    logger.info(f"Task: classify_observation_image started for obs_id: {observation_id}, image: {image_minio_bucket}/{image_minio_object_name}")

    db = None
    temp_image_path = None
    
    try:
        classifier = ImageClassifier() # Relies on ImageClassifier's internal path logic
        if not classifier.model or not classifier.class_names or classifier.num_classes == 0:
            message = "ImageClassifier not properly initialized (model or class_names missing/empty)."
            logger.error(message)
            raise ValueError(message)

        base_name = os.path.basename(image_minio_object_name)
        _, file_extension = os.path.splitext(base_name)
        temp_file_suffix = file_extension if file_extension else ".jpg"
        if not file_extension:
             logger.warning(f"MinIO object '{base_name}' has no extension. Assuming {temp_file_suffix}.")

        fd, temp_image_path = tempfile.mkstemp(suffix=temp_file_suffix)
        os.close(fd) 

        logger.info(f"Downloading {image_minio_object_name} from MinIO bucket '{image_minio_bucket}' to temp file {temp_image_path}")
        minio_client.fget_object(image_minio_bucket, image_minio_object_name, temp_image_path)
        logger.info("Image downloaded from MinIO successfully.")

        with open(temp_image_path, "rb") as f_img:
            image_bytes = f_img.read()
        
        predicted_species_name, confidence_score = classifier.predict(image_bytes)
        
        # Ensure confidence_score is float or None for logging and DB
        if confidence_score is not None:
            log_confidence = f"{confidence_score:.4f}"
            db_confidence = float(confidence_score)
        else:
            log_confidence = "N/A"
            db_confidence = None

        logger.info(f"Prediction for obs_id {observation_id}: Species='{predicted_species_name}', Confidence={log_confidence}")

        if predicted_species_name and db_confidence is not None:
            db = SessionLocal()
            observation = db.query(ObservationModel).filter(ObservationModel.id == observation_id).first()
            
            if not observation:
                logger.error(f"Observation with ID {observation_id} not found in DB.")
                raise ValueError(f"Observation ID {observation_id} not found for update.")

            species_record = db.query(SpeciesModel).filter(SpeciesModel.name == predicted_species_name).first()
            
            if not species_record:
                logger.warning(f"Predicted species name '{predicted_species_name}' not found in the Species table. Storing confidence only.")
                observation.species_id = None # Keep species_id as None if predicted name not in DB
            else:
                observation.species_id = species_record.id # Assign found species_id
            
            observation.classification_confidence = db_confidence # Store as float
            db.commit()
            logger.info(f"Observation {observation_id} updated in DB: species_id={observation.species_id}, confidence={observation.classification_confidence}")
            
            return {
                "status": "success", 
                "observation_id": observation_id, 
                "predicted_species_name": predicted_species_name, 
                "confidence_score": db_confidence,
                "updated_species_id": observation.species_id
            }
        else:
            logger.warning(f"Prediction for obs_id {observation_id} did not yield a species name or valid confidence.")
            return {"status": "no_prediction", "observation_id": observation_id, "message": "Model did not return a valid prediction."}

    except Exception as e:
        logger.error(f"Task: classify_observation_image failed for obs_id {observation_id}: {e}", exc_info=True)
        if db and db.is_active: # Check if session is active before rollback
            db.rollback()
        return {"status": "error", "observation_id": observation_id, "message": str(e)}
    finally:
        if db:
            db.close()
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.remove(temp_image_path)
                logger.info(f"Temporary image file {temp_image_path} cleaned up.")
            except OSError as e_os:
                logger.error(f"Error cleaning up temporary file {temp_image_path}: {e_os}")

# You might add other ML-related tasks here, e.g., for batch prediction, data preprocessing pipelines, etc. 
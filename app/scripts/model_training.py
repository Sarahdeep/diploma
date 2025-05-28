# scripts/model_training.py

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from PIL import Image
import os
import json
import argparse
from sklearn.model_selection import train_test_split
from datetime import datetime
import sys
import shutil # For cleaning up temp directory
import pathlib
import logging
from typing import Dict, List, Tuple, Optional
from urllib.parse import urlparse # Ensure this import is present
import numpy as np # Add numpy for array operations
from sklearn.metrics import roc_auc_score, f1_score # Add sklearn metrics

# Adjust path to import from the app directory
# This assumes the script is run from the project root (e.g., python scripts/model_training.py)
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPTS_DIR)
sys.path.insert(0, PROJECT_ROOT) # Add project root to allow app.X imports

from database import SessionLocal, engine
from models import Species as SpeciesModel, Observation as ObservationModel
from minio_client import minio_client
# from app.core.config import settings # If you have centralized paths

# Configuration for logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuration & Constants ---
# These can be overridden by argparse or a config file
MODEL_SAVE_DIR = os.path.join(PROJECT_ROOT, "ml_models")
MODEL_FILENAME = "active_classifier.pth"
CLASS_NAMES_FILENAME = "class_names.json"
TEMP_IMAGE_CACHE_DIR = os.path.join(PROJECT_ROOT, "temp_training_images_cache")

# Ensure save directory exists
os.makedirs(MODEL_SAVE_DIR, exist_ok=True)
os.makedirs(TEMP_IMAGE_CACHE_DIR, exist_ok=True)

# Training Hyperparameters (can be args)
LEARNING_RATE = 0.001
BATCH_SIZE = 4 # Reduced default for OOM issues, especially when run via Celery
NUM_EPOCHS = 10 
RANDOM_SEED = 42
VAL_SPLIT_SIZE = 0.2 # 20% for validation

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Image Transforms (as provided by user)
# For training
TRAIN_TRANSFORM = transforms.Compose([
    transforms.Resize(256),
    transforms.RandomCrop(224),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(15),
    transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# For validation/testing (no augmentation)
VAL_TRANSFORM = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# --- MinIO Image Handling ---
def download_image_from_minio(client, bucket_name, object_name, local_cache_dir):
    """
    Downloads an image from MinIO to a local cache directory if it doesn't already exist.
    Returns the local path to the image.
    """
    # Ensure object_name is a valid filename (e.g., replace slashes if object_name can be a path)
    _, file_extension = os.path.splitext(object_name)
    if not file_extension: # Add a default extension if missing, assuming JPEG
        local_filename = f"{object_name.replace('/', '_')}.jpg"
    else:
        local_filename = object_name.replace('/', '_')

    local_file_path = os.path.join(local_cache_dir, local_filename)

    if not os.path.exists(local_file_path):
        try:
            print(f"Downloading {object_name} from bucket {bucket_name} to {local_file_path}...")
            client.fget_object(bucket_name, object_name, local_file_path)
            print(f"Successfully downloaded {object_name}.")
            return local_file_path
        except Exception as e:
            print(f"Failed to download {object_name} from MinIO: {e}. Skipping this image.")
            return None
    else:
        # print(f"Image {object_name} already in cache: {local_file_path}")
        return local_file_path

# --- Database Interaction ---
def get_all_species_from_db(db_session):
    """Fetches all species names from the database, ordered by ID for consistency."""
    species_objects = db_session.query(SpeciesModel).order_by(SpeciesModel.id).all()
    if not species_objects:
        raise ValueError("No species found in the database. Cannot train.")
    return [s.name for s in species_objects]

def get_image_data_for_training(db_session, class_to_idx, minio_bucket_name, local_image_cache):
    """
    Fetches observation data, downloads images from MinIO, and returns local image paths and labels.
    Only uses observations marked as is_verified = True.
    """
    observations = db_session.query(ObservationModel).join(SpeciesModel).filter(ObservationModel.image_url.isnot(None)).filter(ObservationModel.is_verified == True).all() # Added filter
    
    local_image_paths = []
    labels = []
    
    print(f"Processing {len(observations)} observations for image downloading...")
    for i, obs in enumerate(observations):
        if i % 50 == 0 and i > 0:
            print(f"  Processed {i}/{len(observations)} observations for image download...")

        if obs.image_url and obs.species: # image_url is the MinIO object name
            minio_object_name = obs.image_url
            
            # Attempt to download the image
            local_path = download_image_from_minio(minio_client, minio_bucket_name, minio_object_name, local_image_cache)
            
            if local_path: # If download was successful and path is returned
                local_image_paths.append(local_path)
                labels.append(class_to_idx[obs.species.name])
            # else:
                # print(f"Skipping observation ID {obs.id} due to MinIO download failure for {minio_object_name}.")
        # else:
            # print(f"Warning: Observation ID {obs.id} missing image_url (MinIO object name) or species. Skipping.")
    
    if not local_image_paths:
        raise ValueError("No valid images could be processed from MinIO/observations. Cannot train.")
    print(f"Successfully processed and cached {len(local_image_paths)} images for training.")
    return local_image_paths, labels

# --- PyTorch Dataset ---
class AnimalDataset(Dataset):
    def __init__(self, image_paths, labels, transform=None):
        self.image_paths = image_paths
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        try:
            image = Image.open(img_path).convert("RGB")
        except FileNotFoundError:
            print(f"Error: Image file not found at {img_path} during dataset loading (should have been cached).")
            return None, None 
        except Exception as e:
            print(f"Error opening image {img_path}: {e}")
            return None, None
            
        label = self.labels[idx]
        if self.transform:
            image = self.transform(image)
        return image, label

# --- Model Definition ---
def get_model(num_classes: int, pretrained: bool = True, local_weights_path: Optional[str] = None):
    """
    Creates an EfficientNetV2-S model.
    - If `pretrained` is True and no `local_weights_path` is given or if loading from local_weights_path fails,
      the backbone is initialized with ImageNet weights.
    - If `local_weights_path` is provided and valid, it attempts to load backbone weights from this checkpoint.
      Classifier head weights from the checkpoint are ignored.
    - The classifier head is ALWAYS newly initialized for the specified `num_classes`.
    """
    backbone_weights_source = "random initialization"

    # Initialize the model. If pretrained is true, this loads ImageNet weights for the backbone.
    # If pretrained is false, the model starts with random weights.
    if pretrained:
        logger.info("Initializing EfficientNetV2-S model with ImageNet pre-trained backbone as a starting point.")
        model = models.efficientnet_v2_s(weights=models.EfficientNet_V2_S_Weights.IMAGENET1K_V1)
        backbone_weights_source = "ImageNet"
    else:
        logger.info("Initializing EfficientNetV2-S model with random weights (no ImageNet pretraining).")
        model = models.efficientnet_v2_s(weights=None)
        backbone_weights_source = "random initialization"

    # Load backbone weights from local_weights_path if provided
    if local_weights_path and os.path.exists(local_weights_path):
        logger.info(f"Attempting to load backbone weights from local checkpoint: {local_weights_path}")
        try:
            checkpoint = torch.load(local_weights_path, map_location=DEVICE)
            
            # Filter out classifier weights from the checkpoint
            # EfficientNet's classifier is typically named 'classifier' and is a Sequential block,
            # with the last layer being a Linear layer.
            # We want to load everything *except* model.classifier.* weights.
            filtered_checkpoint = {k: v for k, v in checkpoint.items() if not k.startswith('classifier.')}
            
            if not filtered_checkpoint:
                logger.warning(f"Checkpoint {local_weights_path} contained no non-classifier weights or was empty.")
            else:
                missing_keys, unexpected_keys = model.load_state_dict(filtered_checkpoint, strict=False)
                logger.info(f"Loaded backbone weights from {local_weights_path}.")
                backbone_weights_source = f"local checkpoint ({local_weights_path}) for backbone"
                if missing_keys:
                    logger.info(f"  Missing keys in model not found in checkpoint's backbone: {missing_keys}")
                if unexpected_keys:
                    logger.warning(f"  Unexpected keys in checkpoint's backbone not found in model: {unexpected_keys}")
        except Exception as e:
            logger.error(f"Error loading backbone weights from {local_weights_path}: {e}. Model will use previously set backbone weights ({backbone_weights_source}).")
    elif local_weights_path:
        logger.warning(f"Specified local_weights_path '{local_weights_path}' not found. Using previously set backbone weights ({backbone_weights_source}).")

    # Always re-initialize the classifier head for the current number of classes
    if hasattr(model, 'classifier') and isinstance(model.classifier, torch.nn.Sequential) and len(model.classifier) > 0:
        original_classifier_linear_layer = model.classifier[-1]
        if isinstance(original_classifier_linear_layer, torch.nn.Linear):
            in_features = original_classifier_linear_layer.in_features
            model.classifier[-1] = nn.Linear(in_features, num_classes)
            logger.info(f"Classifier head re-initialized with {in_features} in-features and {num_classes} out-features (classes).")
        else:
            logger.error("EfficientNetV2_S classifier's last layer is not Linear as expected.")
            raise ValueError("EfficientNetV2_S classifier's last layer is not Linear as expected.")
    else:
        logger.error("EfficientNetV2_S classifier structure not as expected.")
        raise ValueError("EfficientNetV2_S classifier structure not as expected.")

    logger.info(f"Model finalized. Backbone weights from: {backbone_weights_source}. Classifier head: newly initialized for {num_classes} classes.")
    return model.to(DEVICE)

# --- Training Loop ---
def train_one_epoch(model, dataloader, criterion, optimizer, current_epoch_display, total_epochs_for_run):
    model.train() # Set model to training mode
    running_loss = 0.0
    correct_predictions = 0
    total_samples = 0

    for i, batch_data in enumerate(dataloader):
        # 1. Check if batch_data is suitable for unpacking
        if not (isinstance(batch_data, (list, tuple)) and len(batch_data) == 2):
            logger.warning(f"Epoch {current_epoch_display}/{total_epochs_for_run}, Batch {i+1}/{len(dataloader)}: Malformed batch data. Skipping batch. Type: {type(batch_data)}")
            continue # Skip this entire batch

        inputs, labels = batch_data

        # 2. Check if the unpacked inputs or labels are None
        if inputs is None or labels is None:
            logger.warning(f"Epoch {current_epoch_display}/{total_epochs_for_run}, Batch {i+1}/{len(dataloader)}: Inputs or labels are None after unpacking. Skipping batch.")
            continue # Skip this entire batch

        # 3. If all checks passed, proceed
        try:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
        except Exception as e:
            logger.error(f"Epoch {current_epoch_display}/{total_epochs_for_run}, Batch {i+1}/{len(dataloader)}: Error moving batch to device: {e}. Inputs: {type(inputs)}, Labels: {type(labels)}", exc_info=True)
            continue # Skip this batch if moving to device fails

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * inputs.size(0)
        _, preds = torch.max(outputs, 1)
        correct_predictions += torch.sum(preds == labels.data)
        total_samples += labels.size(0)
        
        if (i + 1) % (max(1, len(dataloader) // 2)) == 0 or (i + 1) == len(dataloader):
             if total_samples > 0: # Avoid division by zero if a batch was skipped
                current_batch_loss = loss.item() # Loss for this specific batch
                print(f"  Epoch {current_epoch_display}/{total_epochs_for_run}, Batch {i+1}/{len(dataloader)}, Batch Train Loss: {current_batch_loss:.4f}")

    if total_samples == 0:
        print(f"  Epoch {current_epoch_display} - No samples processed in training. Skipping epoch metrics.")
        return 0.0, 0.0 # Avoid division by zero
        
    epoch_loss = running_loss / total_samples
    epoch_acc = correct_predictions.double() / total_samples
    return epoch_loss, epoch_acc

def validate_one_epoch(model, dataloader, criterion, num_classes: int):
    model.eval() # Set model to evaluation mode
    running_loss = 0.0
    correct_predictions = 0
    total_samples = 0
    
    all_labels_val = []
    all_preds_val = []
    all_probs_val = []

    with torch.no_grad():
        for i, batch_data in enumerate(dataloader):
            # 1. Check if batch_data is suitable for unpacking
            if not (isinstance(batch_data, (list, tuple)) and len(batch_data) == 2):
                logger.warning(f"Validation Batch {i+1}/{len(dataloader)}: Malformed batch data. Skipping. Type: {type(batch_data)}")
                continue

            inputs, labels = batch_data

            # 2. Check if the unpacked inputs or labels are None
            if inputs is None or labels is None:
                logger.warning(f"Validation Batch {i+1}/{len(dataloader)}: Inputs or labels are None after unpacking. Skipping.")
                continue
            
            # 3. If all checks passed, proceed
            try:
                inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            except Exception as e:
                logger.error(f"Validation Batch {i+1}/{len(dataloader)}: Error moving batch to device: {e}. Inputs: {type(inputs)}, Labels: {type(labels)}", exc_info=True)
                continue

            outputs = model(inputs)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * inputs.size(0)
            
            probabilities = torch.softmax(outputs, dim=1)
            _, preds = torch.max(outputs, 1)
            
            correct_predictions += torch.sum(preds == labels.data)
            total_samples += labels.size(0)
            
            all_labels_val.extend(labels.cpu().numpy())
            all_preds_val.extend(preds.cpu().numpy())
            all_probs_val.extend(probabilities.cpu().detach().numpy())

    if total_samples == 0:
        logger.warning("Validation: No samples processed. Returning 0 for metrics.")
        return 0.0, 0.0, 0.0, 0.0 # loss, acc, f1, roc_auc
        
    epoch_loss = running_loss / total_samples
    epoch_acc = correct_predictions.double() / total_samples
    
    # Calculate F1 and ROC AUC
    # Ensure all_labels_val and all_preds_val are numpy arrays for sklearn
    np_all_labels_val = np.array(all_labels_val)
    np_all_preds_val = np.array(all_preds_val)
    np_all_probs_val = np.array(all_probs_val)

    f1 = 0.0
    roc_auc = 0.0

    try:
        f1 = f1_score(np_all_labels_val, np_all_preds_val, average='weighted', zero_division=0)
    except Exception as e_f1:
        logger.error(f"Could not calculate F1 score: {e_f1}")

    try:
        if num_classes == 2:
            # For binary, roc_auc_score expects probabilities of the positive class (class 1)
            # Ensure labels are 0 and 1.
            if np.array_equal(np.unique(np_all_labels_val), np.array([0, 1])):
                 # Check if probs have shape (n_samples, 2)
                if np_all_probs_val.ndim == 2 and np_all_probs_val.shape[1] == 2:
                    roc_auc = roc_auc_score(np_all_labels_val, np_all_probs_val[:, 1]) 
                else:
                    logger.warning(f"Skipping ROC AUC for binary: Probs shape {np_all_probs_val.shape} not as expected (n_samples, 2).")
            else:
                logger.warning(f"Skipping ROC AUC for binary: Labels are not strictly 0 and 1. Unique labels: {np.unique(np_all_labels_val)}")
        elif num_classes > 2:
            # For multi-class, ensure labels are label-encoded (0, 1, ..., num_classes-1)
            # And provide probabilities for all classes
            roc_auc = roc_auc_score(np_all_labels_val, np_all_probs_val, multi_class='ovr', average='weighted')
        else: # num_classes <= 1, roc_auc is not well-defined or meaningful
            logger.warning(f"ROC AUC not calculated for num_classes={num_classes}")
    except ValueError as ve_auc: # Catch specific ValueError from roc_auc_score
        logger.error(f"ValueError calculating ROC AUC: {ve_auc}. Check if all classes are present in y_true or if y_score format is correct.")
    except Exception as e_auc:
        logger.error(f"Could not calculate ROC AUC score: {e_auc}")

    return epoch_loss, epoch_acc, f1, roc_auc

# --- Main Training Function (Refactored) ---
def run_training(
    learning_rate: float = LEARNING_RATE, 
    batch_size: int = BATCH_SIZE, 
    epochs: int = NUM_EPOCHS, 
    seed: int = RANDOM_SEED,
    minio_image_bucket: str = "observations", # Default to 'observations' bucket
    model_save_dir: str = MODEL_SAVE_DIR,
    model_filename: str = MODEL_FILENAME,
    class_names_filename: str = CLASS_NAMES_FILENAME,
    temp_image_cache_dir: str = TEMP_IMAGE_CACHE_DIR,
    cleanup_cache: bool = True,
    initial_weights_path: Optional[str] = None # New parameter for initial weights
    ):
    print(f"Starting training process at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Using device: {DEVICE}")
    print(f"Hyperparameters: Epochs={epochs}, Batch={batch_size}, LR={learning_rate}, Seed={seed}")
    print(f"MinIO Bucket for images: {minio_image_bucket}")
    print(f"Temporary image cache: {temp_image_cache_dir}")

    # Ensure cache directory exists
    os.makedirs(temp_image_cache_dir, exist_ok=True)
    
    torch.manual_seed(seed)
    if DEVICE.type == 'cuda': # Check type for safety
        torch.cuda.manual_seed(seed)

    db = SessionLocal()
    try:
        print("Fetching species from database...")
        class_names = get_all_species_from_db(db)
        if not class_names:
            print("No species found. Exiting.")
            return
        num_classes = len(class_names)
        class_to_idx = {name: i for i, name in enumerate(class_names)}
        print(f"Found {num_classes} classes: {class_names}")

        print("Fetching image data and caching from MinIO...")
        all_image_paths, all_labels = get_image_data_for_training(db, class_to_idx, minio_image_bucket, temp_image_cache_dir)
        if not all_image_paths:
            print("No image data successfully processed. Exiting.")
            return
        print(f"Successfully prepared {len(all_image_paths)} images for training/validation.")

        print("Splitting data into training and validation sets...")
        train_paths, val_paths, train_labels, val_labels = train_test_split(
            all_image_paths, all_labels, test_size=VAL_SPLIT_SIZE, random_state=seed, stratify=all_labels
        )
        print(f"Training set size: {len(train_paths)}, Validation set size: {len(val_paths)}")

        train_dataset = AnimalDataset(train_paths, train_labels, transform=TRAIN_TRANSFORM)
        val_dataset = AnimalDataset(val_paths, val_labels, transform=VAL_TRANSFORM)

        # Add num_workers and pin_memory for efficiency if not on Windows or if it works
        # On Windows, num_workers > 0 can sometimes cause issues with SQLAlchemy/multiprocessing.
        # Test carefully.
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0, pin_memory=False)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=0, pin_memory=False)

        print("Initializing model...")
        # Determine if we should use ImageNet pretrained weights
        # Use ImageNet if no initial_weights_path is given, or if it's given but doesn't exist.
        use_imagenet_pretrained = not (initial_weights_path and os.path.exists(initial_weights_path))
        if initial_weights_path and not os.path.exists(initial_weights_path):
            logger.warning(f"Specified initial_weights_path '{initial_weights_path}' not found. Will attempt to use ImageNet pretraining if enabled.")
        
        model = get_model(
            num_classes=num_classes, 
            pretrained=use_imagenet_pretrained, # True if no valid local path
            local_weights_path=initial_weights_path # Pass the path anyway
        )

        criterion = nn.CrossEntropyLoss()

        # Setup optimizer with differential learning rates
        # Use a smaller learning rate for the backbone (features) and a larger one for the classifier head
        if hasattr(model, 'features') and hasattr(model, 'classifier'):
            optimizer = optim.AdamW([
                {'params': model.features.parameters(), 'lr': learning_rate / 100.0}, # Backbone LR (reduced further)
                {'params': model.classifier.parameters(), 'lr': learning_rate}        # Classifier head LR
            ])
            logger.info(f"Optimizer AdamW initialized with differential LRs: Backbone LR = {learning_rate/100.0}, Classifier LR = {learning_rate}")
        else:
            logger.warning("Model does not have 'features' or 'classifier' attributes as expected. Using single LR for all parameters.")
            optimizer = optim.AdamW(model.parameters(), lr=learning_rate)
        
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.1, patience=3)

        best_val_loss = float('inf')
        epochs_no_improve = 0
        patience_early_stopping = 7 # Number of epochs to wait for improvement before stopping

        print("--- Starting Training ---")
        for epoch in range(epochs):
            epoch_display_num = epoch + 1 # For logging, 1-indexed
            start_time_epoch = datetime.now()
            print(f"Epoch {epoch_display_num}/{epochs}")
            
            # --- Set requires_grad for differential training ---
            # Classifier head always trainable
            for param in model.classifier.parameters():
                param.requires_grad = True
            
            # Backbone (features) trainable only on even-numbered display epochs (2, 4, ...)
            if epoch_display_num % 2 == 0: 
                print(f"  Epoch {epoch_display_num}: Training Backbone (Features) + Classifier Head")
                # For EfficientNet, the main feature extractor is typically model.features
                for param in model.features.parameters():
                    param.requires_grad = True
            else: # Odd display epoch (1, 3, ...)
                print(f"  Epoch {epoch_display_num}: Training Classifier Head ONLY (Backbone Frozen)")
                for param in model.features.parameters():
                    param.requires_grad = False
            # ----------------------------------------------------
            
            model.train() # Ensure model is in training mode for the training pass
            train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, epoch_display_num, epochs)
            print(f"  Epoch {epoch_display_num} Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f}")
            
            # For validation, model.eval() is called within validate_one_epoch
            # Gradients are not computed due to torch.no_grad() in validate_one_epoch
            val_loss, val_acc, val_f1, val_roc_auc = validate_one_epoch(model, val_loader, criterion, num_classes)
            print(f"  Epoch {epoch_display_num} Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}, Val F1: {val_f1:.4f}, Val ROC_AUC: {val_roc_auc:.4f}")
            
            scheduler.step(val_loss)

            if val_loss < best_val_loss and val_loss > 0:
                best_val_loss = val_loss
                epochs_no_improve = 0
                model_s_path = os.path.join(model_save_dir, model_filename)
                torch.save(model.state_dict(), model_s_path)
                print(f"  Best model saved to {model_s_path} (Val Loss: {best_val_loss:.4f})")
                
                class_names_s_path = os.path.join(model_save_dir, class_names_filename)
                with open(class_names_s_path, 'w') as f:
                    json.dump(class_names, f)
                print(f"  Class names saved to {class_names_s_path}")
            else:
                epochs_no_improve += 1
                print(f"  Validation loss did not improve for {epochs_no_improve} epoch(s). Current val_loss: {val_loss:.4f}")

            if epochs_no_improve >= patience_early_stopping:
                print(f"Early stopping triggered after {epoch_display_num} epochs.")
                break
            
            print(f"Epoch {epoch_display_num} completed in {(datetime.now() - start_time_epoch)}")
        
        print("--- Training Finished ---")
        print(f"Best validation loss: {best_val_loss:.4f}")
        final_model_path = os.path.join(model_save_dir, model_filename)
        final_classes_path = os.path.join(model_save_dir, class_names_filename)
        print(f"Final model should be at: {final_model_path}")
        print(f"Final class names should be at: {final_classes_path}")

    except ValueError as ve:
        print(f"ValueError during training setup: {ve}")
    except Exception as e:
        print(f"An unexpected error occurred during training: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
        print("Database session closed.")
        if cleanup_cache:
            try:
                print(f"Cleaning up temporary image cache: {temp_image_cache_dir}")
                shutil.rmtree(temp_image_cache_dir)
                print("Temporary image cache cleaned up.")
            except Exception as e:
                print(f"Error cleaning up cache directory {temp_image_cache_dir}: {e}")

# --- Argparse for Command Line Execution ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train an image classification model.")
    parser.add_argument("--lr", type=float, default=LEARNING_RATE, help="Learning rate")
    parser.add_argument("--batch_size", type=int, default=BATCH_SIZE, help="Batch size")
    parser.add_argument("--epochs", type=int, default=NUM_EPOCHS, help="Number of epochs")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="Random seed")
    parser.add_argument("--minio_bucket", type=str, default="observations", help="MinIO bucket for images")
    parser.add_argument("--model_dir", type=str, default=MODEL_SAVE_DIR, help="Directory to save trained model")
    parser.add_argument("--model_file", type=str, default=MODEL_FILENAME, help="Filename for trained model")
    parser.add_argument("--class_names_file", type=str, default=CLASS_NAMES_FILENAME, help="Filename for class names JSON")
    parser.add_argument("--cache_dir", type=str, default=TEMP_IMAGE_CACHE_DIR, help="Local directory to cache images from MinIO")
    parser.add_argument("--no_cleanup_cache", action="store_true", help="Do not cleanup the image cache directory after training")
    parser.add_argument("--initial_weights", type=str, default=None, help="Path to .pth file for initial model weights (optional, for retraining)")

    args = parser.parse_args()
    run_training(
        learning_rate=args.lr,
        batch_size=args.batch_size,
        epochs=args.epochs,
        seed=args.seed,
        minio_image_bucket=args.minio_bucket,
        model_save_dir=args.model_dir,
        model_filename=args.model_file,
        class_names_filename=args.class_names_file,
        temp_image_cache_dir=args.cache_dir,
        cleanup_cache=not args.no_cleanup_cache,
        initial_weights_path=args.initial_weights # Pass the new argument
    ) 
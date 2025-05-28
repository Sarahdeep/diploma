import torch
import torchvision
from torchvision import models, transforms
from PIL import Image
import io
import os
from typing import Tuple, Optional, List
import json # For potentially loading class_names

# Configuration
MODEL_PATH = os.getenv("MODEL_PATH", "ml_models/active_classifier.pth")
CLASS_NAMES_PATH = os.getenv("CLASS_NAMES_PATH", "ml_models/class_names.json") # Path to saved class names
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

EXPECTED_IMAGE_SIZE = (224, 224) # Standard for many EfficientNet models after cropping
NORMALIZATION_MEAN = [0.485, 0.456, 0.406] # ImageNet defaults
NORMALIZATION_STD = [0.229, 0.224, 0.225] # ImageNet defaults

class ImageClassifier:
    def __init__(self, 
                 model_path: str = MODEL_PATH, 
                 class_names_path: str = CLASS_NAMES_PATH,
                 class_names: Optional[List[str]] = None): # Allow direct class_names override
        self.model_path = model_path
        self.class_names_path = class_names_path
        
        loaded_class_names = None
        if class_names: # Direct override takes precedence
            loaded_class_names = class_names
            print("Using directly provided class_names.")
        elif os.path.exists(self.class_names_path):
            try:
                with open(self.class_names_path, 'r') as f:
                    loaded_class_names = json.load(f)
                print(f"Loaded class_names from {self.class_names_path}")
            except Exception as e:
                print(f"Warning: Could not load class_names from {self.class_names_path}: {e}. Using fallback.")
        
        if loaded_class_names:
            self.class_names = loaded_class_names
        else:
            print(f"Warning: class_names not loaded from file and not provided. Using default placeholders.")
            self.class_names = ["Vulpes vulpes", "Vulpes lagopus", "Vulpes zerda"] # Fallback

        if not self.class_names:
            print("Error: No class names available. Classifier cannot be initialized.")
            self.num_classes = 0
            self.model: Optional[torch.nn.Module] = None
        else:
            self.num_classes = len(self.class_names)
            self.model: Optional[torch.nn.Module] = None # Initialize model attribute
            if self.num_classes == 0:
                 print("Error: Number of classes is 0. Classifier cannot operate.")
            else:
                if os.path.exists(self.model_path):
                    self.load_model()
                else:
                    print(f"Warning: Model file not found at {self.model_path} during initialization. Call load_model() later.")
        
        self.inference_transforms = self._get_inference_transforms()

    def _get_inference_transforms(self):
        """
        Define the image transformations for inference.
        This should generally align with the validation/test transforms used during training,
        typically without data augmentation.
        """
        # Based on common practice for EfficientNet and typical validation transforms
        return transforms.Compose([
            transforms.Resize(256),      # Resize to 256 first
            transforms.CenterCrop(EXPECTED_IMAGE_SIZE[0]), # Center crop to 224x224
            transforms.ToTensor(),
            transforms.Normalize(mean=NORMALIZATION_MEAN, std=NORMALIZATION_STD)
        ])

    def load_model(self):
        """
        Loads the trained PyTorch model (EfficientNetV2_S base) from the specified path.
        The model's classifier head is adjusted to self.num_classes.
        """
        if self.num_classes == 0:
            print("Error: Cannot load model, number of classes is 0.")
            self.model = None
            return

        if not os.path.exists(self.model_path):
            print(f"Error: Model file not found at {self.model_path}. Cannot load model.")
            self.model = None
            return

        try:
            # Instantiate EfficientNetV2_S. We don't need pre-trained weights here
            # if we are loading a fully custom-trained model from self.model_path.
            # If fine-tuning, one might load pre-trained weights first, then adapt.
            self.model = models.efficientnet_v2_s(weights=None) # Using EfficientNetV2_S

            # Get the number of input features for the original classifier
            if hasattr(self.model, 'classifier') and isinstance(self.model.classifier, torch.nn.Sequential) and len(self.model.classifier) > 0:
                # EfficientNetV2 typically has a Sequential classifier, the last layer is Linear
                original_classifier_linear_layer = self.model.classifier[-1]
                if isinstance(original_classifier_linear_layer, torch.nn.Linear):
                    in_features = original_classifier_linear_layer.in_features
                    # Replace the classifier head
                    self.model.classifier[-1] = torch.nn.Linear(in_features, self.num_classes)
                else:
                    raise ValueError("EfficientNetV2_S classifier's last layer is not Linear as expected.")
            else:
                raise ValueError("EfficientNetV2_S classifier structure not as expected.")

            # Load the state dictionary
            self.model.load_state_dict(torch.load(self.model_path, map_location=DEVICE))
            self.model.to(DEVICE)
            self.model.eval() # Set the model to evaluation mode
            print(f"Model loaded successfully from {self.model_path}, adapted for {self.num_classes} classes ({self.class_names}), and moved to {DEVICE}.")
        except Exception as e:
            print(f"Error loading or adapting model from {self.model_path}: {e}")
            self.model = None

    def predict(self, image_bytes: bytes) -> Tuple[Optional[str], Optional[float]]:
        """
        Predicts the species from image bytes.
        Returns the predicted species name and confidence score.
        """
        if self.model is None:
            print("Error: Model is not loaded. Call load_model() or ensure model path is correct.")
            return None, None
        if self.num_classes == 0:
            print("Error: Model not functional, number of classes is 0.")
            return None, None

        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            processed_image = self.inference_transforms(image).unsqueeze(0).to(DEVICE)
            
            with torch.no_grad():
                outputs = self.model(processed_image)
                probabilities = torch.softmax(outputs, dim=1)
                confidence, predicted_idx = torch.max(probabilities, 1)
                
                if predicted_idx.item() >= self.num_classes:
                    print(f"Error: Predicted index {predicted_idx.item()} is out of bounds for {self.num_classes} classes.")
                    return None, None
                
                predicted_species_name = self.class_names[predicted_idx.item()]
                confidence_score = confidence.item()
                
                return predicted_species_name, confidence_score
        except IndexError: # Should be caught by the check above, but as a safeguard
            print(f"Critical Error: Predicted index is out of bounds for class_names list.")
            return None, None
        except Exception as e:
            print(f"Error during prediction: {e}")
            return None, None

# --- Training Related Aspects (for your training script, not directly in this class) ---
# Loss Function Candidate:
#   - torch.nn.CrossEntropyLoss: Standard for multi-class classification.
#     It expects raw logits from the model (do not apply Softmax before this loss).
#
# Optimizer:
#   - torch.optim.AdamW: Good general-purpose optimizer.
#
# Scheduler:
#   - torch.optim.lr_scheduler.ReduceLROnPlateau: Adjusts learning rate based on validation metric.
#
# Example of train_transform (as you provided, for your training script):
# train_transform = transforms.Compose([
#     transforms.Resize(256),
#     transforms.RandomCrop(224),
#     transforms.RandomHorizontalFlip(),
#     transforms.RandomRotation(15),
#     transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1),
#     transforms.ToTensor(),
#     transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]) # ImageNet defaults
# ])

# --- Example Usage (conceptual for testing image_classifier.py) ---
# if __name__ == '__main__':
#     # Create a dummy class_names.json for testing
#     _dummy_class_names_list = ["Vulpes vulpes", "Vulpes lagopus", "Vulpes zerda"]
#     if not os.path.exists(CLASS_NAMES_PATH):
#         os.makedirs(os.path.dirname(CLASS_NAMES_PATH), exist_ok=True)
#         with open(CLASS_NAMES_PATH, 'w') as f:
#             json.dump(_dummy_class_names_list, f)
#         print(f"Created dummy {CLASS_NAMES_PATH}")

#     if not os.path.exists(MODEL_PATH):
#         print(f"Creating a dummy model file at {MODEL_PATH} for structural testing.")
#         os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
#         _dummy_model = models.efficientnet_v2_s(weights=None)
#         _in_features = _dummy_model.classifier[-1].in_features
#         _dummy_model.classifier[-1] = torch.nn.Linear(_in_features, len(_dummy_class_names_list))
#         torch.save(_dummy_model.state_dict(), MODEL_PATH)
#         print(f"Dummy model saved. NOTE: This model is NOT TRAINED.")

#     # Test instantiation using the files
#     classifier = ImageClassifier() # Should load from files by default

#     # Or test by providing class_names directly (e.g., if app fetches from DB)
#     # classifier_direct = ImageClassifier(class_names=_dummy_class_names_list)

#     if classifier.model:
#         print(f"Classifier initialized with {len(classifier.class_names)} classes: {classifier.class_names}")
#         try:
#             dummy_image_bytes = io.BytesIO()
#             Image.new('RGB', (300, 300), color = 'red').save(dummy_image_bytes, format='JPEG')
#             dummy_image_bytes.seek(0)
            
#             species, score = classifier.predict(dummy_image_bytes.read())
#             if species:
#                 print(f"Dummy Prediction -> Species: {species}, Confidence: {score:.4f}")
#             else:
#                 print("Dummy Prediction failed.")
#         except Exception as e:
#             print(f"Error in dummy prediction example: {e}")
#     else:
#         print("Classifier model not loaded. Cannot run prediction example.")
#         print(f"Ensure model exists at: {MODEL_PATH} and class names at: {CLASS_NAMES_PATH}") 
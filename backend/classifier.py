import os
import sys

# Ensure Keras, Matplotlib, and TensorFlow use local directories inside workspace before any imports
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("KERAS_HOME", os.path.join(BASE_DIR, ".keras"))
os.environ.setdefault("MPLCONFIGDIR", os.path.join(BASE_DIR, ".matplotlib"))
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.makedirs(os.environ["KERAS_HOME"], exist_ok=True)
os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)

import json
import logging
from typing import Dict, Any, List, Tuple
import numpy as np
from PIL import Image

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

logger = logging.getLogger("classifier")
logger.setLevel(logging.INFO)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
MODEL_PATH = os.path.join(MODEL_DIR, "flora_model.keras")
CLASS_INDICES_PATH = os.path.join(MODEL_DIR, "class_indices.json")
TRAINING_METRICS_PATH = os.path.join(MODEL_DIR, "training_metrics.json")

IMAGE_SIZE = (224, 224)
BATCH_SIZE = 8
CONFIDENCE_THRESHOLD = 0.45  # Stricter honest threshold to avoid fabricated predictions

# In-memory cached model and classes
_CACHED_MODEL = None
_CACHED_CLASSES = None


def inspect_dataset_stats(dataset_dir: str) -> Dict[str, Any]:
    """
    Inspects existing dataset folder structure and counts images per species.
    Identifies severe data limitations and returns structured diagnostics.
    """
    if not os.path.exists(dataset_dir):
        return {
            "exists": False,
            "error": f"Dataset directory not found at {dataset_dir}",
            "species": [],
            "total_images": 0,
            "warnings": ["Dataset directory is missing."]
        }

    species_list = []
    total_images = 0
    warnings = []

    for entry in sorted(os.listdir(dataset_dir)):
        folder_path = os.path.join(dataset_dir, entry)
        if os.path.isdir(folder_path):
            files = [
                f for f in os.listdir(folder_path)
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
            ]
            count = len(files)
            total_images += count
            species_list.append({
                "species_name": entry,
                "image_count": count,
                "sample_images": files[:3]
            })

    total_classes = len(species_list)
    avg_images = round(total_images / max(1, total_classes), 1)

    # Honest warnings about the dataset limitation
    if total_classes > 0:
        warnings.append(
            f"DATASET LIMITATION DETECTED: Found {total_classes} species with only {total_images} total images "
            f"(average {avg_images} images per species, ranging from 1 to 6)."
        )
        warnings.append(
            "CRITICAL WARNING: 2–6 images per species is severely insufficient for high-confidence real-world "
            "plant identification. Standard deep learning vision models require at least 30–50+ diverse images "
            "per class across varied lighting, angles, and growth stages to prevent severe overfitting."
        )

        single_classes = [s["species_name"] for s in species_list if s["image_count"] <= 1]
        if single_classes:
            warnings.append(
                f"SINGLE-IMAGE CLASSES DETECTED: {', '.join(single_classes)} contain only 1 photo. "
                "These cannot provide an unseen validation sample, making out-of-sample validation impossible."
            )

    return {
        "exists": True,
        "dataset_path": os.path.abspath(dataset_dir),
        "total_classes": total_classes,
        "total_images": total_images,
        "average_images_per_class": avg_images,
        "species": species_list,
        "warnings": warnings,
        "is_small_dataset": True
    }


def split_dataset_files(dataset_dir: str) -> Tuple[List[Tuple[str, int]], List[Tuple[str, int]], List[str]]:
    """
    Splits dataset files strictly into train and validation sets WITHOUT duplicate leakage.
    Returns (train_files, val_files, class_names).
    """
    class_names = sorted([
        d for d in os.listdir(dataset_dir)
        if os.path.isdir(os.path.join(dataset_dir, d))
    ])
    
    train_items = []
    val_items = []

    for class_idx, class_name in enumerate(class_names):
        folder = os.path.join(dataset_dir, class_name)
        files = [
            os.path.join(folder, f) for f in os.listdir(folder)
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
        ]
        
        # Sort deterministically
        files.sort()

        if len(files) == 0:
            continue
        elif len(files) == 1:
            # Cannot split 1 image: assign to train
            train_items.append((files[0], class_idx))
        else:
            # Strictly reserve 1 image for validation, remaining for train
            # This avoids overlap / duplicate-image leakage!
            val_items.append((files[-1], class_idx))
            for f in files[:-1]:
                train_items.append((f, class_idx))

    return train_items, val_items, class_names


def load_and_preprocess_image(path_str: str) -> tf.Tensor:
    img_raw = tf.io.read_file(path_str)
    img = tf.image.decode_jpeg(img_raw, channels=3)
    img = tf.image.resize(img, IMAGE_SIZE)
    # MobileNetV2 expects [-1, 1] input range
    img = keras.applications.mobilenet_v2.preprocess_input(img)
    return img


def create_tf_dataset(items: List[Tuple[str, int]], is_training: bool = False) -> tf.data.Dataset:
    paths = [item[0] for item in items]
    labels = [item[1] for item in items]

    ds = tf.data.Dataset.from_tensor_slices((paths, labels))

    def _map_fn(path, label):
        img = load_and_preprocess_image(path)
        return img, label

    ds = ds.map(_map_fn, num_parallel_calls=tf.data.AUTOTUNE)

    # Data augmentation is applied STRICTLY and ONLY on the training dataset!
    if is_training:
        data_augmentation = keras.Sequential([
            layers.RandomFlip("horizontal"),
            layers.RandomRotation(0.15),
            layers.RandomZoom(0.15),
            layers.RandomContrast(0.1),
        ], name="train_augmentation")

        ds = ds.map(lambda x, y: (data_augmentation(x, training=True), y), num_parallel_calls=tf.data.AUTOTUNE)
        ds = ds.shuffle(buffer_size=len(items) + 10, seed=42)

    ds = ds.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)
    return ds


def train_classifier(dataset_dir: str, epochs: int = 15) -> Dict[str, Any]:
    """
    Trains a transfer learning classifier on the existing dataset.
    - Preserves user photos strictly as primary dataset.
    - Augmentation only on train split.
    - Zero data leakage into validation.
    - Produces honest accuracy metrics.
    """
    stats = inspect_dataset_stats(dataset_dir)
    if stats["total_images"] == 0:
        raise ValueError("Cannot train model: No valid images found in dataset.")

    train_items, val_items, class_names = split_dataset_files(dataset_dir)
    num_classes = len(class_names)

    logger.info(f"Training items: {len(train_items)}, Validation items: {len(val_items)}, Classes: {num_classes}")

    train_ds = create_tf_dataset(train_items, is_training=True)
    val_ds = create_tf_dataset(val_items, is_training=False)

    # Build Transfer Learning Model with MobileNetV2
    base_model = keras.applications.MobileNetV2(
        input_shape=(IMAGE_SIZE[0], IMAGE_SIZE[1], 3),
        include_top=False,
        weights="imagenet"
    )
    base_model.trainable = False  # Freeze pre-trained weights for small dataset

    inputs = keras.Input(shape=(IMAGE_SIZE[0], IMAGE_SIZE[1], 3))
    x = base_model(inputs, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = keras.Model(inputs, outputs)

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )

    # Fit model
    history = model.fit(
        train_ds,
        validation_data=val_ds if len(val_items) > 0 else None,
        epochs=epochs,
        verbose=1
    )

    # Evaluate honestly
    val_acc = 0.0
    val_loss = 0.0
    if len(val_items) > 0:
        eval_res = model.evaluate(val_ds, verbose=0)
        val_loss = float(eval_res[0])
        val_acc = float(eval_res[1])

    train_acc = float(history.history["accuracy"][-1]) if "accuracy" in history.history else 0.0
    train_loss = float(history.history["loss"][-1]) if "loss" in history.history else 0.0

    # Ensure output model dir exists
    os.makedirs(MODEL_DIR, exist_ok=True)
    model.save(MODEL_PATH)

    with open(CLASS_INDICES_PATH, "w", encoding="utf-8") as f:
        json.dump(class_names, f, indent=2)

    # Honest assessment text
    honest_assessment = (
        f"Model trained on {len(train_items)} training images and evaluated on {len(val_items)} "
        f"unseen validation images across {num_classes} classes. "
        f"Final Training Accuracy: {train_acc:.1%}, Validation Accuracy: {val_acc:.1%}. "
        f"IMPORTANT: Because validation set contains only 1 sample per multi-image species ({len(val_items)} total), "
        f"validation metrics have high variance. Do NOT claim high generalisation accuracy until a larger benchmark "
        f"(30+ images per class) is gathered."
    )

    metrics_result = {
        "status": "trained",
        "num_classes": num_classes,
        "classes": class_names,
        "train_samples": len(train_items),
        "val_samples": len(val_items),
        "epochs_trained": epochs,
        "train_loss": round(train_loss, 4),
        "train_accuracy": round(train_acc, 4),
        "val_loss": round(val_loss, 4),
        "val_accuracy": round(val_acc, 4),
        "dataset_warning": stats["warnings"],
        "honest_assessment": honest_assessment
    }

    with open(TRAINING_METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_result, f, indent=2)

    # Update global cache
    global _CACHED_MODEL, _CACHED_CLASSES
    _CACHED_MODEL = model
    _CACHED_CLASSES = class_names

    return metrics_result


def get_model_status() -> Dict[str, Any]:
    """Returns the current trained model status and honest metrics."""
    if not os.path.exists(MODEL_PATH) or not os.path.exists(CLASS_INDICES_PATH):
        return {
            "is_trained": False,
            "message": "Model is not trained yet. Predictions will indicate that no trained model is available.",
            "metrics": None
        }

    try:
        metrics = {}
        if os.path.exists(TRAINING_METRICS_PATH):
            with open(TRAINING_METRICS_PATH, "r", encoding="utf-8") as f:
                metrics = json.load(f)

        with open(CLASS_INDICES_PATH, "r", encoding="utf-8") as f:
            classes = json.load(f)

        return {
            "is_trained": True,
            "classes_count": len(classes),
            "classes": classes,
            "metrics": metrics
        }
    except Exception as e:
        return {
            "is_trained": False,
            "error": str(e),
            "metrics": None
        }


def load_classifier():
    """Loads the model and class names into memory."""
    global _CACHED_MODEL, _CACHED_CLASSES

    if _CACHED_MODEL is not None and _CACHED_CLASSES is not None:
        return _CACHED_MODEL, _CACHED_CLASSES

    if not os.path.exists(MODEL_PATH) or not os.path.exists(CLASS_INDICES_PATH):
        return None, None

    try:
        _CACHED_MODEL = keras.models.load_model(MODEL_PATH)
        with open(CLASS_INDICES_PATH, "r", encoding="utf-8") as f:
            _CACHED_CLASSES = json.load(f)
        return _CACHED_MODEL, _CACHED_CLASSES
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return None, None


def predict_flora(
    image: Image.Image,
    species_metadata: Dict[str, Any] = None,
    confidence_threshold: float = CONFIDENCE_THRESHOLD
) -> Dict[str, Any]:
    """
    Predicts species for an uploaded image.
    Applies honest thresholding: if confidence is below threshold,
    or model is untrained, explicitly refuses to fabricate a result.
    """
    model, classes = load_classifier()

    if model is None or classes is None:
        return {
            "is_confident": False,
            "status": "model_untrained",
            "message": "No trained model found. Please train the model in the 'Dataset & Model' tab first.",
            "predictions": []
        }

    # Preprocess PIL image
    img = image.convert("RGB").resize(IMAGE_SIZE)
    img_arr = np.array(img, dtype=np.float32)
    img_arr = keras.applications.mobilenet_v2.preprocess_input(img_arr)
    img_tensor = np.expand_dims(img_arr, axis=0)

    # Model inference
    preds = model.predict(img_tensor, verbose=0)[0]

    # Rank predictions
    top_indices = np.argsort(preds)[::-1]
    top_results = []

    for rank, idx in enumerate(top_indices[:3]):
        species_name = classes[idx]
        conf = float(preds[idx])
        meta = (species_metadata or {}).get(species_name, {})

        top_results.append({
            "rank": rank + 1,
            "species_name": species_name,
            "confidence": round(conf, 4),
            "confidence_percentage": f"{conf * 100:.1f}%",
            "common_name": meta.get("common_name", species_name.title()),
            "scientific_name": meta.get("scientific_name", "Unknown"),
            "category": meta.get("category", "Plant"),
            "campus_location": meta.get("campus_location", "Unspecified Campus Location"),
            "description": meta.get("description", "")
        })

    top1 = top_results[0]
    top1_conf = top1["confidence"]
    top2_conf = top_results[1]["confidence"] if len(top_results) > 1 else 0.0

    # Strict honest confidence check:
    # 1. Top score must meet threshold (>= 45%)
    # 2. Must not be a near-tie with top2 (difference >= 0.08)
    if top1_conf < confidence_threshold or (top1_conf - top2_conf < 0.08 and top1_conf < 0.60):
        return {
            "is_confident": False,
            "status": "low_confidence",
            "message": (
                f"Low Confidence Prediction ({top1['confidence_percentage']}). "
                f"The image cannot be reliably identified as '{top1['species_name']}'. "
                f"Due to the small dataset (2–6 training images per species), the model cannot generalize "
                f"reliably to varying perspectives or lighting. Manual botanical inspection required."
            ),
            "top_prediction": top1,
            "top_candidates": top_results
        }

    return {
        "is_confident": True,
        "status": "success",
        "message": (
            f"Candidate Match: {top1['common_name']} ({top1['scientific_name']}) "
            f"with {top1['confidence_percentage']} model score. "
            f"Note: Reference dataset is small; please verify campus specimen against recorded location."
        ),
        "top_prediction": top1,
        "top_candidates": top_results
    }

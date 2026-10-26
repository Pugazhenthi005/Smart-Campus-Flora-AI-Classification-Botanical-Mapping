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

import io
import json
import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image

from classifier import (
    inspect_dataset_stats,
    train_classifier,
    get_model_status,
    predict_flora
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
METADATA_FILE = os.path.join(os.path.dirname(__file__), "species_metadata.json")

app = FastAPI(
    title="Smart Campus Flora API",
    description="Backend API for Smart Campus Flora classification, botanical catalog, and metadata management",
    version="1.0.0"
)

# CORS middleware for Web and Capacitor Android app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cache_control_header(request, call_next):
    response = await call_next(request)
    if request.url.path.endswith(".js") or request.url.path.endswith(".html") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# Mount dataset images statically so the frontend can display actual campus photos dynamically
if os.path.exists(DATASET_DIR):
    app.mount("/dataset_images", StaticFiles(directory=DATASET_DIR), name="dataset_images")


def load_metadata() -> Dict[str, Any]:
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading metadata: {e}")
    return {}


def save_metadata(data: Dict[str, Any]):
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


class SpeciesUpdateModel(BaseModel):
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    category: Optional[str] = None  # Plant, Tree, Weed
    campus_location: Optional[str] = None
    description: Optional[str] = None


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "app": "Smart Campus Flora",
        "dataset_accessible": os.path.exists(DATASET_DIR)
    }


@app.get("/api/dataset/stats")
def dataset_stats():
    """
    Returns image count per species and displays explicit warnings about
    the small 2–6 image dataset limitations before training.
    """
    stats = inspect_dataset_stats(DATASET_DIR)
    return stats


@app.get("/api/species")
def get_all_species():
    """
    Dynamically loads all species from the dataset folders and merges with
    campus metadata (common name, scientific name, category, campus location).
    """
    if not os.path.exists(DATASET_DIR):
        raise HTTPException(status_code=404, detail="Dataset directory not found.")

    metadata = load_metadata()
    species_list = []

    for entry in sorted(os.listdir(DATASET_DIR)):
        folder_path = os.path.join(DATASET_DIR, entry)
        if os.path.isdir(folder_path):
            files = [
                f for f in os.listdir(folder_path)
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
            ]
            meta = metadata.get(entry, {})
            # Form image URLs using URL encoding
            from urllib.parse import quote
            image_urls = [f"/dataset_images/{quote(entry)}/{quote(f)}" for f in files]

            species_list.append({
                "species_id": entry,
                "folder_name": entry,
                "common_name": meta.get("common_name", entry.title()),
                "scientific_name": meta.get("scientific_name", "Pending Botanical Record"),
                "category": meta.get("category", "Plant"),
                "campus_location": meta.get("campus_location", "Unrecorded Campus Location"),
                "description": meta.get("description", ""),
                "image_count": len(files),
                "images": image_urls,
                "thumbnail": image_urls[0] if image_urls else None
            })

    return {
        "count": len(species_list),
        "species": species_list
    }


@app.get("/api/species/{species_id}")
def get_species_detail(species_id: str):
    """Returns single species details and all associated campus photos."""
    folder_path = os.path.join(DATASET_DIR, species_id)
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        raise HTTPException(status_code=404, detail=f"Species '{species_id}' not found.")

    metadata = load_metadata()
    meta = metadata.get(species_id, {})
    files = [
        f for f in os.listdir(folder_path)
        if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
    ]
    from urllib.parse import quote
    image_urls = [f"/dataset_images/{quote(species_id)}/{quote(f)}" for f in files]

    return {
        "species_id": species_id,
        "folder_name": species_id,
        "common_name": meta.get("common_name", species_id.title()),
        "scientific_name": meta.get("scientific_name", ""),
        "category": meta.get("category", "Plant"),
        "campus_location": meta.get("campus_location", ""),
        "description": meta.get("description", ""),
        "image_count": len(files),
        "images": image_urls,
        "thumbnail": image_urls[0] if image_urls else None
    }


@app.put("/api/species/{species_id}")
def update_species_metadata(species_id: str, update: SpeciesUpdateModel):
    """
    Updates common name, scientific name, category (Plant, Tree, Weed),
    and campus location for a species.
    """
    folder_path = os.path.join(DATASET_DIR, species_id)
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail=f"Species '{species_id}' not found in dataset.")

    metadata = load_metadata()
    if species_id not in metadata:
        metadata[species_id] = {}

    if update.common_name is not None:
        metadata[species_id]["common_name"] = update.common_name
    if update.scientific_name is not None:
        metadata[species_id]["scientific_name"] = update.scientific_name
    if update.category is not None:
        metadata[species_id]["category"] = update.category
    if update.campus_location is not None:
        metadata[species_id]["campus_location"] = update.campus_location
    if update.description is not None:
        metadata[species_id]["description"] = update.description

    save_metadata(metadata)
    return {
        "message": f"Metadata for '{species_id}' updated successfully.",
        "updated": metadata[species_id]
    }


@app.post("/api/train")
def trigger_training(epochs: int = 15):
    """
    Triggers model training with data augmentation ONLY on training images,
    strict train/validation isolation, and honest reporting of accuracy.
    """
    try:
        results = train_classifier(DATASET_DIR, epochs=epochs)
        return results
    except Exception as e:
        logger.error(f"Training failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/model/status")
def model_status():
    """Returns current model status and metrics."""
    return get_model_status()


@app.post("/api/predict")
async def predict_plant(file: UploadFile = File(...)):
    """
    Classifies an uploaded plant photo using the trained model.
    Applies honest thresholding: refuses to fabricate predictions if confidence is low
    or if model is untrained.
    """
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No image file was provided in the upload request.")

    try:
        contents = await file.read()
        if not contents or len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")
        image = Image.open(io.BytesIO(contents))
        image.verify()  # Verify image integrity
        # Re-open for actual processing because verify() closes or alters the stream pointer
        image = Image.open(io.BytesIO(contents))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Invalid image uploaded: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted image format: {e}")

    metadata = load_metadata()
    try:
        result = predict_flora(image, species_metadata=metadata)
        return result
    except Exception as e:
        logger.error(f"Inference error in predict_flora: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model inference failed: {e}")


@app.get("/api/campus/zones")
def get_campus_zones():
    """Returns interactive campus zones with mapped flora species and coordinates for UCEV Villupuram."""
    zones = [
        {
            "id": "zone-herbal",
            "name": "UCEV Science & Humanities Herbal Garden",
            "code": "ZONE-A",
            "description": "Dedicated sanctuary for Ayurvedic and medicinal flora beside the Science & Humanities Block.",
            "x": 26, "y": 32,
            "species_ids": ["aloe vera", "madagascar periwinkle", "tulasi"]
        },
        {
            "id": "zone-admin",
            "name": "Administrative Block & Dean's Quadrangle",
            "code": "ZONE-B",
            "description": "Formal landscaped courtyards featuring ornamental and cycad specimens at the Administrative Block.",
            "x": 52, "y": 38,
            "species_ids": ["areca palm", "china doll plant", "sago palm"]
        },
        {
            "id": "zone-avenue",
            "name": "Main Entrance Boulevard & Central Library Avenue",
            "code": "ZONE-C",
            "description": "Kakuppam main gate entrance drive lined with columnar and foxtail avenue shade trees.",
            "x": 76, "y": 24,
            "species_ids": ["alstonia scholaris", "foxtail palm", "indian mast tree"]
        },
        {
            "id": "zone-academic",
            "name": "Engineering Departments (CSE/ECE/EEE/MECH/IT) & Auditorium",
            "code": "ZONE-D",
            "description": "Lawn courtyards surrounding engineering labs and the university auditorium.",
            "x": 38, "y": 68,
            "species_ids": ["indian almond tree", "neem", "hibiscus"]
        },
        {
            "id": "zone-perimeter",
            "name": "Sports Ground, Mallakhamb Arena & Campus Boundary",
            "code": "ZONE-E",
            "description": "Perimeter green belt and athletic ground boundaries along Kakuppam fence line.",
            "x": 82, "y": 74,
            "species_ids": ["celtis australis", "coconut tree", "manila tamarind"]
        },
        {
            "id": "zone-orchard",
            "name": "Hostel Grounds (Boys & Girls) & Demonstration Orchard",
            "code": "ZONE-F",
            "description": "Fruit trees, flowering border beds, and agricultural demo plots around student hostels.",
            "x": 62, "y": 80,
            "species_ids": ["banana tree", "mango tree(mangifera indica)", "pomegranate plant", "lxora plant"]
        }
    ]
    return {"zones": zones}


@app.get("/api/quiz")
def generate_quiz():
    """Generates an educational campus flora quiz using real dataset photos and metadata."""
    if not os.path.exists(DATASET_DIR):
        raise HTTPException(status_code=404, detail="Dataset missing")
    
    metadata = load_metadata()
    species_dirs = [d for d in os.listdir(DATASET_DIR) if os.path.isdir(os.path.join(DATASET_DIR, d))]
    
    import random
    selected = random.sample(species_dirs, min(5, len(species_dirs)))
    questions = []
    
    from urllib.parse import quote
    for idx, sp in enumerate(selected):
        meta = metadata.get(sp, {})
        folder = os.path.join(DATASET_DIR, sp)
        imgs = [f for f in os.listdir(folder) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
        if not imgs:
            continue
            
        chosen_img = random.choice(imgs)
        img_url = f"/dataset_images/{quote(sp)}/{quote(chosen_img)}"
        
        # 3 distractors
        distractors = [d for d in species_dirs if d != sp]
        wrong = random.sample(distractors, min(3, len(distractors)))
        
        correct_name = meta.get("common_name", sp.title())
        wrong_names = [metadata.get(w, {}).get("common_name", w.title()) for w in wrong]
        options = [correct_name] + wrong_names
        random.shuffle(options)
        
        questions.append({
            "id": idx + 1,
            "image_url": img_url,
            "question": f"Which campus species is shown in this specimen photo?",
            "scientific_hint": f"Botanical family / traits: {meta.get('scientific_name', 'Campus Flora')}",
            "location_hint": f"Usually spotted at: {meta.get('campus_location', 'Campus')}",
            "options": options,
            "correct_answer": correct_name,
            "explanation": f"{correct_name} ({meta.get('scientific_name', '')}) is categorized as a {meta.get('category', 'Plant')} located at {meta.get('campus_location', 'our campus')}."
        })
        
    return {"questions": questions}


@app.post("/api/species/{species_id}/add-photo")
async def add_species_photo(species_id: str, file: UploadFile = File(...)):
    """Uploads a new specimen photo directly into the designated species folder."""
    folder_path = os.path.join(DATASET_DIR, species_id)
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail=f"Species '{species_id}' folder not found")
        
    import time
    ext = os.path.splitext(file.filename)[1] or ".jpeg"
    new_filename = f"specimen_{int(time.time())}{ext}"
    dest_path = os.path.join(folder_path, new_filename)
    
    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)
        
    return {
        "message": f"New photo successfully added to '{species_id}' dataset folder",
        "filename": new_filename,
        "new_count": len([f for f in os.listdir(folder_path) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
    }


@app.get("/api/export")
def export_registry():
    """Exports full botanical registry and dataset distribution."""
    metadata = load_metadata()
    stats = inspect_dataset_stats(DATASET_DIR)
    return {
        "institution": "Smart Campus Flora Project",
        "dataset_statistics": stats,
        "species_records": metadata
    }


WWW_DIR = os.path.join(BASE_DIR, "frontend", "www")
if os.path.exists(WWW_DIR):
    app.mount("/", StaticFiles(directory=WWW_DIR, html=True), name="static_frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

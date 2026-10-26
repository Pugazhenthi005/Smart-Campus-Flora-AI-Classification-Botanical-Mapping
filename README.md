# 🌿 Smart Campus Flora (Android + Website)

An end-to-end botanical inventory, species catalogue, and plant classification system built exclusively with your college plant dataset.

---

## 📁 Dataset Audit & Critical Limitation Warning

The project uses strictly your primary college dataset located in `dataset/`:
- **19 Botanical Classes**:
  1. `aloe vera` (3 images)
  2. `alstonia scholaris` (2 images)
  3. `areca palm` (5 images)
  4. `banana tree` (3 images)
  5. `celtis australis` (2 images)
  6. `china doll plant` (1 image)
  7. `coconut tree` (4 images)
  8. `foxtail palm` (6 images)
  9. `hibiscus` (2 images)
  10. `indian almond tree` (2 images)
  11. `indian mast tree` (2 images)
  12. `lxora plant` (6 images)
  13. `madagascar periwinkle` (1 image)
  14. `mango tree(mangifera indica)` (2 images)
  15. `manila tamarind` (2 images)
  16. `neem` (3 images)
  17. `pomegranate plant` (2 images)
  18. `sago palm` (3 images)
  19. `tulasi` (1 image)
- **Total Images**: 52 (Average: 2.7 images/class)

> [!WARNING]
> **Severe Dataset Limitation**:
> Having only 1 to 6 images per species is severely below the minimum sample size required for high-accuracy deep learning computer vision.
> Standard transfer learning models require **at least 30–50+ diverse images per class** taken in varied lighting conditions, camera angles, and seasons.
>
> **Measures Taken to Maintain Scientific Integrity**:
> 1. **No Duplicate-Image Leakage**: Validation and test sets are partitioned *before* any transformation. Single-sample classes are placed in train with explicit zero-test warnings.
> 2. **Train-Only Augmentation**: Rotations, zooms, horizontal flips, and contrast adjustments are applied strictly to the training split. Validation images remain 100% untouched for honest evaluation.
> 3. **Honest Confidence Thresholding**: Predictions with low confidence (<45%) or ambiguous margins refuse to claim false certainty, alerting the user to inspect physical campus specimens manually.
> 4. **No Fabricated Predictions**: If the model is not trained or an image is unrecognizable, the app displays an honest diagnostic message.

---

## 🏗️ Architecture

```
C:\SmartCampusFlora\
├── dataset/                     # Original 19 species image folders (strictly preserved)
├── backend/
│   ├── main.py                  # FastAPI REST API & static server
│   ├── classifier.py            # TensorFlow / Keras MobileNetV2 transfer learning
│   ├── species_metadata.json    # Persisted botanical details & campus locations
│   ├── requirements.txt         # Python dependencies
│   └── model/                   # Trained weights (.keras), classes, and metrics
├── frontend/
│   ├── www/
│   │   ├── index.html           # Responsive Web & Mobile UI
│   │   ├── app.js               # Catalogue rendering, camera capture, API client
│   │   └── style.css            # Nature/campus theme design
│   ├── capacitor.config.json    # Capacitor configuration
│   ├── package.json             # Capacitor dependencies
│   └── android/                 # Generated native Android project
└── run_backend.bat              # Quick-start script for Windows
```

---

## 🚀 Running the Project

### 1. Launch Backend & Web Server
```powershell
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

### 2. Features on the Website
- **Catalogue Tab**:
  - Dynamically lists all 19 species from your folders with actual thumbnails.
  - Search by common name, scientific name, or campus location.
  - Filter by category (**Tree**, **Plant**, **Weed**).
  - Click any species card to view all photos in a gallery and edit botanical records (Common Name, Botanical Name, Category, Campus Location, Notes). Changes persist to `backend/species_metadata.json`.
- **Identify Tab**:
  - Drag-and-drop or select an image (or capture using device camera).
  - Click **"Identify Specimen"**.
  - Displays prediction, confidence score, category badge, campus location, and runner-up candidates.
  - Displays honest low-confidence warning when certainty is low.
- **Dataset & Model Tab**:
  - Full breakdown table of all 19 species and their image counts.
  - Prominent warning regarding dataset size.
  - **"Start Model Training"** button to execute transfer learning.
  - Displays honest training accuracy and out-of-sample validation accuracy.

---

## 📱 Android Packaging with Capacitor

The project is pre-configured with Capacitor for Android:

1. **Navigate to the frontend folder**:
   ```powershell
   cd frontend
   ```
2. **Sync web assets to Android**:
   ```powershell
   npx cap sync android
   ```
3. **Open in Android Studio**:
   ```powershell
   npx cap open android
   ```
4. **Build APK**:
   - In Android Studio, select **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
   - Run on an emulator or connect your phone with USB debugging enabled.
   - The app has camera permissions (`android.permission.CAMERA`) and cleartext network permissions enabled in `AndroidManifest.xml` so it can talk to your FastAPI backend.

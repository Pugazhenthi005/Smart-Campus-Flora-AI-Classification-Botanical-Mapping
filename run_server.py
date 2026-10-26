import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("KERAS_HOME", os.path.join(BASE_DIR, ".keras"))
os.environ.setdefault("MPLCONFIGDIR", os.path.join(BASE_DIR, ".matplotlib"))
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.makedirs(os.environ["KERAS_HOME"], exist_ok=True)
os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)

sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, app_dir=os.path.join(BASE_DIR, "backend"))

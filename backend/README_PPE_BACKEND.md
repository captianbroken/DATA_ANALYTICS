# PPE Backend Run Guide

This backend is aligned to the camera-side script [`PPE .py`](C:/Users/91832/Desktop/Praveen/PPE%20.py).

## Runtime pieces

- `backend/fastapi_app.py`
  Receives PPE violation events at `POST /api/v1/ppe-events` on port `8000`.
- `backend/app.py`
  Serves frontend-facing PPE event, violation, stats, and detection-image APIs on port `5000`.
- `backend/ppe_model/detect_ppe.py`
  Batch detector for local dataset images using the latest PPE model asset.
- `backend/ppe_model/seed_db.py`
  Seeds detected PPE events and violations into PostgreSQL.

## Environment

Use the root `.env` file.

Required:

```env
Postgresql_Url=postgresql://...
INGEST_API_KEY=your_key_here
```

Accepted aliases:

- `PPE_INGEST_API_KEY` can be used instead of `INGEST_API_KEY`
- `MODEL_PATH` can be used instead of `PPE_MODEL_SOURCE`

## Model assets

Supported PPE model inputs:

- `best (17).pt.zip`
- `sh17_best.pt`
- `sh17_best.pt.zip`
- `weights/sh17_best.pt`
- `PPE_MODEL_SOURCE` or `MODEL_PATH`

The backend reads class names from `sh17.yaml`.

## Exact run commands

Start the ingestion API used by `PPE .py`:

```powershell
cd C:\Users\91832\Desktop\Praveen
uvicorn backend.fastapi_app:app --host 0.0.0.0 --port 8000
```

Start the frontend-facing Flask API:

```powershell
cd C:\Users\91832\Desktop\Praveen\backend
python app.py
```

Run the camera-side PPE detection script:

```powershell
cd C:\Users\91832\Desktop\Praveen
python "PPE .py"
```

Optional batch detection + DB seeding flow:

```powershell
cd C:\Users\91832\Desktop\Praveen
python backend\run_pipeline.py --no-api
```

## Matching settings with `PPE .py`

`PPE .py` defaults:

- model path: `sh17_best.pt`
- ingestion URL: `http://localhost:8000/api/v1/ppe-events`
- camera id: `4`

So for end-to-end local use:

1. Keep the FastAPI ingestion server on port `8000`
2. Keep `INGEST_API_KEY` and `PPE_INGEST_API_KEY` identical
3. Ensure camera id `4` exists in the `cameras` table, or update `DEFAULT_CAMERAS` / `cameras.json`
4. Set `PPE_MODEL_SOURCE=C:\Users\91832\Desktop\Praveen\best (17).pt.zip` in the root `.env` to force the newest PPE weights

# Seismic Interpretation Pro - Worker Architecture & Deployment

*Note: Due to the strict frontend-only constraints of this environment, the requested Python backend service (.py files, requirements.txt, Python-specific modules like segyio/zarr/structlog) cannot be generated or implemented here. This document outlines the conceptual architecture and deployment strategy for your reference when building the worker in a supported external environment.*

## 1. Architecture Overview (Task 20)

The ingestion pipeline is designed as a decoupled, asynchronous, worker-based architecture. It bridges the gap between raw SEG-Y file uploads (stored in an object storage bucket) and optimized cloud-native formats (Zarr) suitable for web-based rendering and machine learning.

### Core Components
*   **Job Poller (`job_handler`)**: Continuously polls the Supabase `sip_jobs` table for 'queued' jobs, claims them using atomic updates (to prevent dual-processing), and routes them to the appropriate processing module.
*   **SEG-Y Inspector (`segy_inspector` & `geometry_detector`)**: Reads headers and a sample of traces to determine coordinate systems, dimensionality (2D vs 3D), missing values, and amplitude distributions.
*   **Conversion Engine (`conversion_service`)**: The heavy lifter. Streams SEG-Y traces and reshapes them into multi-dimensional Zarr chunks, allowing partial reads by the frontend.
*   **Derivatives Generators (`pyramid_builder` & `preview_builder`)**: Creates level-of-detail (LOD) decimated versions of the Zarr arrays and generates standard 2D image slices (PNG/JPG) for rapid UI previews.
*   **QC & Validation (`qc_service`)**: Intercepts outputs from all stages to generate a comprehensive `qc_report_jsonb` reflecting data integrity.

### Error Handling & Retry Strategy
*   **Transient Failures**: Network timeouts, database locks, or temporary storage unavailability are handled via exponential backoff retries.
*   **Fatal Failures**: Corrupted SEG-Y files, unsupported formats, or out-of-memory errors trigger an immediate job transition to 'failed', storing the exact stack trace in `error_text`.
*   **Cleanup**: A dedicated cleanup utility guarantees that partially written Zarr stores or downloaded temporary SEG-Y chunks are wiped from the worker's disk/memory and the remote bucket if a job fails mid-flight.

### Extensibility Guidelines
To add new job types (e.g., `attribute_extraction`, `fault_prediction`):
1.  Define the new `job_type` enum in the database.
2.  Create a new Pydantic schema for the `input_jsonb` payload.
3.  Add a new handler module (e.g., `attribute_service.py`).
4.  Register the handler in the main `job_handler.py` router map.

## 2. Deployment Notes (Task 19)

When deploying this worker service to a platform like Render, you will need to provision a background worker process (not a web service, as it does not need to expose HTTP endpoints).

### Required Environment Variables
*   `SUPABASE_URL`: Your Supabase project REST URL.
*   `SUPABASE_SERVICE_ROLE_KEY`: Required to bypass RLS and securely read/update jobs and write volume data.
*   `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY`: Credentials for the object storage bucket containing the SEG-Y files and where Zarr files will be written (e.g., AWS S3, Google Cloud Storage, or Supabase Storage).
*   `LOG_LEVEL`: Set to `INFO` for production, `DEBUG` for development.
*   `MAX_CONCURRENCY`: Number of jobs a single worker instance should process simultaneously (depends heavily on available RAM).

### Scaling Strategy
*   **Memory Constraints**: SEG-Y conversion is highly memory-intensive. Initial production deployments should use high-memory compute instances (e.g., 16GB+ RAM).
*   **Horizontal Scaling**: You can spin up multiple instances of the worker service. The atomic job claiming mechanism (e.g., `UPDATE sip_jobs SET status = 'running' WHERE id = X AND status = 'queued'`) ensures jobs are distributed safely across the cluster.
*   **Storage Throughput**: Ensure your worker is deployed in the same region as your object storage bucket to minimize latency and egress bandwidth costs during the massive read/write operations required for Zarr chunking.
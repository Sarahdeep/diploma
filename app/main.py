from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from database import engine, Base
from models import User, Species, Observation, HabitatArea
from endpoints import species, observations, habitats
from auth import router as auth_router
from minio_client import ensure_buckets_exist

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Animal Habitat Service",
    description="""
    API for tracking animal observations and analyzing habitats using geospatial data.
    
    ## Features
    
    * 🔒 Authentication and user management
    * 🦊 Species management
    * 📸 Observation recording (via image upload with EXIF extraction)
    * 🗺️ Habitat area calculation (MCP, KDE)
    * 📈 Retrieval of observations and calculated habitats for visualization
    
    ## API Structure
    
    The API is organized into the following modules:
    * **auth**: User authentication and registration
    * **species**: Managing species information
    * **observations**: Creating and retrieving individual observations
    * **habitats**: Triggering and retrieving habitat area calculations
    """,
    version="0.2.0",
    contact={
        "name": "Project Developer",
        "email": "developer@example.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
app.include_router(species.router, prefix=f"{API_PREFIX}/species", tags=["Species"])
app.include_router(observations.router, prefix=f"{API_PREFIX}/observations", tags=["Observations"])
app.include_router(habitats.router, prefix=f"{API_PREFIX}/habitats", tags=["Habitats"])

@app.on_event("startup")
async def startup_event():
    try:
        ensure_buckets_exist()
    except Exception as e:
        print(f"Error initializing MinIO buckets: {e}")

@app.get("/", tags=["Health Check"])
async def root():
    return {
        "message": "Animal Habitat Service", 
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health", tags=["Health Check"])
async def health():
    status = {
        "service": "ok",
        "database": "unknown"
    }
    
    try:
        from sqlalchemy import text
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        status["database"] = "ok"
    except OperationalError as e:
        print(f"Database connection error: {e}")
        status["database"] = "error"
    except Exception as e:
        print(f"Health check error: {e}")
        status["database"] = "error"
    
    if status["database"] != "ok":
        from fastapi import Response
        return Response(content=str(status), status_code=503)
        
    return status
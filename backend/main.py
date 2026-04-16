import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.fiveg import router as fiveg_router

app = FastAPI(title="Beamforming Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fiveg_router, prefix="/api/5g", tags=["5g"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

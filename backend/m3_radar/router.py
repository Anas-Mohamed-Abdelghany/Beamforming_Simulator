"""
m3_radar/router.py — Spec-named alias for the radar router.

Re-exports the radar router from backend.routes.radar.
All endpoints live in backend/routes/radar.py.
"""
from backend.routes.radar import router  # noqa: F401

__all__ = ["router"]

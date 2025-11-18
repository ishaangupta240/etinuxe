from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import admin, auth, dreams, memories, organism, support, users

app = FastAPI(title="EtinuxE API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(memories.router)
app.include_router(dreams.router)
app.include_router(organism.router)
app.include_router(support.router)


@app.get("/")
def root() -> dict:
    return {"status": "ok", "message": "EtinuxE API online"}

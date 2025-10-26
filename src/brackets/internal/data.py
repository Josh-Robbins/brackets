from __future__ import annotations
from datetime import datetime
from typing import Any
from sqlmodel import SQLModel, Field, Session, select
from pydantic import BaseModel
from pydantic.alias_generators import to_camel
from sqlalchemy import create_engine

_engine = None

def useDatabase(dsn: str):
    global _engine
    _engine = create_engine(dsn, future=True)
    SQLModel.metadata.create_all(_engine)
    return _engine

class Data(BaseModel):
    class Config:
        alias_generator = to_camel
        populate_by_name = True
        json_encoders = {datetime: lambda d: d.isoformat()}

def Id():
    return Field(default=None, primary_key=True)

def CreatedAt():
    return Field(default_factory=datetime.utcnow, nullable=False)

def UpdatedAt():
    return Field(default_factory=datetime.utcnow, nullable=False)

class Model(SQLModel):
    @classmethod
    def all(cls, db=None) -> list[Any]:
        if db is None: db = Session(_engine)
        with db as s:
            return list(s.exec(select(cls)))

    @classmethod
    def find(cls, db, id: Any):
        if db is None: db = Session(_engine)
        with db as s:
            return s.get(cls, id)

    @classmethod
    def add(cls, db, obj: dict | BaseModel):
        if db is None: db = Session(_engine)
        data = obj.dict(by_alias=True) if isinstance(obj, BaseModel) else dict(obj)
        inst = cls(**data)
        with db as s:
            s.add(inst); s.commit(); s.refresh(inst)
            return inst

    @classmethod
    def edit(cls, db, id: Any, obj: dict | BaseModel):
        if db is None: db = Session(_engine)
        patch = obj.dict(exclude_unset=True, by_alias=True) if isinstance(obj, BaseModel) else dict(obj)
        with db as s:
            inst = s.get(cls, id)
            if not inst: return None
            for k, v in patch.items(): setattr(inst, k, v)
            if hasattr(inst, 'updatedAt'): setattr(inst, 'updatedAt', datetime.utcnow())
            s.add(inst); s.commit(); s.refresh(inst)
            return inst

    @classmethod
    def remove(cls, db, id: Any):
        if db is None: db = Session(_engine)
        with db as s:
            inst = s.get(cls, id)
            if not inst: return None
            s.delete(inst); s.commit(); return True

def resource(path: str, *, model: type[Model], Create: type[Data]|None=None, Update: type[Data]|None=None, tags: list[str]|None=None):
    from fastapi import APIRouter, Body
    router = APIRouter(prefix=path, tags=tags or [model.__name__])

    @router.get('/')
    def list_items():
        return [r for r in model.all(None)]

    @router.post('/')
    def create(payload: dict = Body(...)):
        obj = Create(**payload) if Create else payload
        return model.add(None, obj)

    @router.get('/{id}')
    def read(id: int):
        return model.find(None, id)

    @router.patch('/{id}')
    def update(id: int, payload: dict = Body(...)):
        obj = Update(**payload) if Update else payload
        return model.edit(None, id, obj)

    @router.delete('/{id}')
    def delete(id: int):
        model.remove(None, id); return {"ok": True}

    return router

crud = resource

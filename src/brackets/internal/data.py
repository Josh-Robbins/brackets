from __future__ import annotations
from typing import Any, Optional
from datetime import datetime, timezone
from contextlib import contextmanager

from sqlmodel import SQLModel, Field, Session, select
from sqlalchemy import create_engine
from pydantic import BaseModel, ConfigDict

_engine = None

def useDatabase(url: str = 'sqlite:///app.db', *, echo: bool = False):
    global _engine
    _engine = create_engine(url, echo=echo, future=True, pool_pre_ping=True)
    SQLModel.metadata.create_all(_engine)
    return _engine

@contextmanager
def session_scope():
    from sqlalchemy.orm import sessionmaker
    if _engine is None:
        raise RuntimeError('Database not initialized. Call useDatabase(url).')
    SessionLocal = sessionmaker(bind=_engine, class_=Session, expire_on_commit=False, autoflush=False)
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback(); raise
    finally:
        db.close()

def Id(): return Field(default=None, primary_key=True)
def CreatedAt(): return Field(default_factory=lambda: datetime.now(timezone.utc))
def UpdatedAt(): return Field(default_factory=lambda: datetime.now(timezone.utc), sa_column_kwargs={'onupdate': datetime.now(timezone.utc)})

def _to_camel(s: str) -> str:
    parts = s.split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])

class Data(BaseModel):
    model_config = ConfigDict(alias_generator=_to_camel, populate_by_name=True, str_strip_whitespace=True, validate_assignment=True)

class Model(SQLModel):
    @classmethod
    def all(cls, db: Optional[Session] = None):
        if db is None:
            with session_scope() as s: return list(s.exec(select(cls)))
        return list(db.exec(select(cls)))
    @classmethod
    def find(cls, db: Optional[Session], id: Any):
        if db is None:
            with session_scope() as s: return s.get(cls, id)
        return db.get(cls, id)
    @classmethod
    def add(cls, db: Optional[Session], data: Any):
        obj = data if isinstance(data, cls) else cls(**(data.model_dump(exclude_none=True) if hasattr(data,'model_dump') else data))
        if db is None:
            with session_scope() as s:
                s.add(obj); s.flush(); s.refresh(obj); return obj
        db.add(obj); db.flush(); db.refresh(obj); return obj
    @classmethod
    def edit(cls, db: Optional[Session], id: Any, data: Any):
        payload = data.model_dump(exclude_none=True) if hasattr(data,'model_dump') else data
        if db is None:
            with session_scope() as s:
                obj = s.get(cls, id)
                if not obj: return None
                for k,v in payload.items(): setattr(obj, k, v)
                s.add(obj); s.flush(); s.refresh(obj); return obj
        obj = db.get(cls, id)
        if not obj: return None
        for k,v in payload.items(): setattr(obj, k, v)
        db.add(obj); db.flush(); db.refresh(obj); return obj
    @classmethod
    def remove(cls, db: Optional[Session], id: Any):
        if db is None:
            with session_scope() as s:
                obj = s.get(cls, id)
                if obj: s.delete(obj); return
        obj = db.get(cls, id)
        if obj: db.delete(obj)

def resource(path: str, *, model: type[Model], Create: type[Data] | None = None, Update: type[Data] | None = None, title: str | None = None):
    from fastapi import Body
    from ..internal.http import json
    from ..internal.router import _add
    from ..internal.cache import invalidate
    base = path.rstrip('/')
    def list_items():
        rows = model.all(None)
        return json([r.__dict__ for r in rows])
    def create_item(form: (Create or Data) = Body(...)):
        obj = model.add(None, form); invalidate(tags=[base]); return json(obj.__dict__)
    def get_item(id: int):
        r = model.find(None, id); return json(r.__dict__ if r else None)
    def update_item(id: int, form: (Update or Data) = Body(...)):
        r = model.edit(None, id, form); invalidate(tags=[base], key=f"{base}:{id}"); return json(r.__dict__ if r else None)
    def delete_item(id: int):
        model.remove(None, id); invalidate(tags=[base], key=f"{base}:{id}"); return json({'ok': True})
    _add('GET',    base, list_items)
    _add('POST',   base, create_item)
    _add('GET',    f"{base}/{{id}}", get_item)
    _add('PATCH',  f"{base}/{{id}}", update_item)
    _add('DELETE', f"{base}/{{id}}", delete_item)

def crud(path: str, *, model: type[Model], Create: type[Data] | None = None, Update: type[Data] | None = None, title: str | None = None, rate: str | None = None, auth: str | None = None, ui: bool = True, order: str | None = "-createdAt", pageSize: int = 20, search: list[str] | bool = True):
    # For now, wire JSON endpoints via resource(). UI pages can be provided by app templates; otherwise authors add their own.
    resource(path, model=model, Create=Create, Update=Update, title=title)

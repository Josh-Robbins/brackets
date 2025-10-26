from pathlib import Path
from datetime import datetime
from brackets import App, get, page, Model, Data, Id, CreatedAt, UpdatedAt, crud, useDatabase

app = App(templates=str(Path(__file__).parent / 'templates'))
useDatabase('sqlite:///app.db')

class Todo(Model, table=True):
    id: int | None = Id()
    title: str
    done: bool = False
    createdAt: datetime = CreatedAt()
    updatedAt: datetime = UpdatedAt()

class TodoCreate(Data): title: str
class TodoUpdate(Data): title: str | None = None; done: bool | None = None

crud('/todos', model=Todo)

@get('/')
def home():
    return page('pages/index.bx', title='Todos', _app=app)

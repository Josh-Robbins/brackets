from datetime import datetime
from brackets import App, get, page, useDatabase, crud, Model, Data, Id, CreatedAt, UpdatedAt
from fastapi.responses import HTMLResponse

app = App(templates='examples/todos/app/templates')
useDatabase('sqlite:///examples/todos/app/app.db')

class Todo(Model, table=True):
    id: int | None = Id()
    title: str
    done: bool = False
    createdAt: datetime = CreatedAt()
    updatedAt: datetime = UpdatedAt()

class TodoCreate(Data): title: str
class TodoUpdate(Data): title: str | None = None; done: bool | None = None

crud('/todos', model=Todo, Create=TodoCreate, Update=TodoUpdate)

@get('/')
def home():
    html = app.render('pages/index.bx', title='Welcome')
    return HTMLResponse(html)

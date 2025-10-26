# Data & CRUD

```python
from datetime import datetime
from brackets import Model, Data, Id, CreatedAt, UpdatedAt

class Todo(Model, table=True):
    id: int | None = Id()
    title: str
    done: bool = False
    createdAt: datetime = CreatedAt()
    updatedAt: datetime = UpdatedAt()

from brackets import crud
crud('/todos', model=Todo)
```

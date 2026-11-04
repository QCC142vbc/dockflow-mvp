from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from pathlib import Path

from app.core.database import Base, engine
from app.models import Carrier, Dock, EventOutbox, EventTracking, Operation, QueueEntry, Shipment, User, Vehicle, Warehouse


def init_db():
    config = Config(str(Path(__file__).with_name("alembic.ini")))
    table_names = set(inspect(engine).get_table_names())
    if not table_names:
        print("Creating an empty DockFlow database...")
        Base.metadata.create_all(bind=engine)
        command.stamp(config, "head")
    elif "users" not in table_names:
        raise RuntimeError("DockFlow database has an incomplete schema; refusing to stamp it as current.")
    else:
        print("Applying DockFlow database migrations...")
        command.upgrade(config, "head")
    print("Database schema initialized. No operational records were created.")


if __name__ == "__main__":
    init_db()

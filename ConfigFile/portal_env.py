import os
from pathlib import Path

from dotenv import load_dotenv


def load_portal_env():
    configured_path = os.getenv("PORTAL_ENV_FILE")
    env_path = (
        Path(configured_path).expanduser()
        if configured_path
        else Path(__file__).resolve().parent.parent / ".env"
    )
    load_dotenv(dotenv_path=env_path, override=False)

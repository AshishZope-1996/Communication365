import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ConfigFile"))

from portal_env import load_portal_env


class PortalEnvTests(unittest.TestCase):
    def test_loads_values_from_configured_env_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_file = Path(temp_dir) / ".env"
            env_file.write_text("DB_HOST=dotenv-test-host\n", encoding="utf-8")

            with patch.dict(os.environ, {"PORTAL_ENV_FILE": str(env_file)}, clear=True):
                load_portal_env()
                self.assertEqual(os.environ["DB_HOST"], "dotenv-test-host")

    def test_process_environment_takes_precedence(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            env_file = Path(temp_dir) / ".env"
            env_file.write_text("DB_HOST=dotenv-test-host\n", encoding="utf-8")

            with patch.dict(
                os.environ,
                {"PORTAL_ENV_FILE": str(env_file), "DB_HOST": "process-test-host"},
                clear=True
            ):
                load_portal_env()
                self.assertEqual(os.environ["DB_HOST"], "process-test-host")


if __name__ == "__main__":
    unittest.main()

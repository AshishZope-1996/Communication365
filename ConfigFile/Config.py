import logging
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ConfigFile'))

from portal_env import load_portal_env

load_portal_env()

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

SENDER_EMAIL = os.getenv("SENDER_EMAIL", "")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")

# Recipients are loaded from the database in EmailWrapper.py.
RECEIVERS = []

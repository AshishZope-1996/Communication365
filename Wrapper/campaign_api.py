import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ConfigFile'))

from EmailWrapper import (
    CampaignConfigurationError,
    get_campaign_catalog,
    get_campaign_template,
    load_campaign_history,
    send_campaign_email,
)

logger = logging.getLogger(__name__)


class CampaignHandler(BaseHTTPRequestHandler):
    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/campaigns":
            try:
                self._send_json(get_campaign_catalog())
            except Exception:
                logger.exception("Campaign catalog request failed.")
                self._send_json({"error": "Unable to load the campaign catalog from the database."}, 500)
        elif self.path.startswith("/history"):
            try:
                self._send_json({"history": load_campaign_history(limit=25)})
            except Exception:
                logger.exception("Campaign history request failed.")
                self._send_json({"error": "Unable to load campaign history from the database."}, 500)
        else:
            self._send_json({"error": "Not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/send":
            self._send_json({"error": "Not found"}, 404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body or "{}")
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, 400)
            return

        template_id = data.get("template_id")

        if template_id is None:
            self._send_json({"error": "template_id is required"}, 400)
            return
        try:
            template_id = int(template_id)
        except (TypeError, ValueError):
            self._send_json({"error": "template_id must be an integer"}, 400)
            return

        try:
            template = get_campaign_template(template_id)
            if not template:
                self._send_json({"error": "The selected template is unavailable or inactive."}, 404)
                return

            pdf_paths = [template["pdfPath"]] if template["pdfPath"] else []
            result = send_campaign_email(
                template["template"],
                (data.get("subject") or "").strip() or template["subject"],
                template["campaign"],
                None,
                pdf_paths
            )
            self._send_json({
                "success": result["accepted"] > 0,
                "accepted": result["accepted"],
                "failed": result["failed"],
                "message": "Email provider accepted the campaign submissions."
            }, 200 if result["accepted"] > 0 else 502)
        except CampaignConfigurationError as exc:
            logger.warning("Campaign is not ready for submission: %s", exc)
            self._send_json({"error": str(exc)}, 503)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, 400)
        except FileNotFoundError as exc:
            logger.warning("Campaign file is unavailable: %s", exc)
            self._send_json({"error": str(exc)}, 400)
        except Exception:
            logger.exception("Campaign submission request failed.")
            self._send_json({"error": "Campaign submission failed. Check the server logs and configuration."}, 500)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8001), CampaignHandler)
    print("Campaign API running on http://127.0.0.1:8001")
    server.serve_forever()

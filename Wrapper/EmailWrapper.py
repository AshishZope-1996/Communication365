import os
import sys
import smtplib
import logging
from datetime import datetime
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ConfigFile'))

from Config import SENDER_EMAIL, SENDER_PASSWORD # type: ignore
from configdb import get_db_connection # type: ignore

# 
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
logger = logging.getLogger(__name__)


class CampaignConfigurationError(RuntimeError):
    pass


def load_receivers_from_db():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT "FirstName", "LastName", "EmailAddress", "Date" '
                    'FROM master."UserDetails" WHERE isactive = true ORDER BY "UserId"'
                )
                rows = cur.fetchall()

        receivers = []
        for first_name, last_name, email_address, date_value in rows:
            if not email_address:
                continue
            receivers.append({
                "email": email_address,
                "name": first_name or last_name or "User",
                "date": str(date_value) if date_value is not None else ""
            })
        return receivers
    except Exception as exc:
        logger.exception("Database error while loading active recipients.")
        raise RuntimeError("Unable to load active recipients from the database.") from exc


def log_to_db(RECEIVER, STATUS, CAMPAIGN_TYPE, ERROR=""):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'INSERT INTO log."EmailAuditLog" ("TimeStamp", "SentFrom", "SentTo", "CampaignType", "Status", "ErrorMessage") '
                    'VALUES (%s, %s, %s, %s, %s, %s)',
                    (
                        datetime.now(),
                        SENDER_EMAIL,
                        RECEIVER,
                        CAMPAIGN_TYPE,
                        STATUS,
                        ERROR
                    )
                )
                conn.commit()
    except Exception as exc:
        logger.exception("Database error while writing an email audit entry.")


def get_campaign_catalog():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "TemplateId", "TemplateFile", "CampaignType", '
                '"DisplayName", "Subject", "PdfPath" '
                'FROM master."TemplateCatalog" '
                'WHERE "IsActive" = TRUE '
                'ORDER BY "CampaignType", "DisplayName", "TemplateId"'
            )
            rows = cur.fetchall()

    templates = [
        {
            "id": row[0],
            "template": row[1],
            "campaign": row[2],
            "label": row[3],
            "subject": row[4] or "",
            "pdfPath": row[5] or ""
        }
        for row in rows
    ]
    campaigns_by_key = {}
    for template in templates:
        key = template["campaign"]
        if key and key not in campaigns_by_key:
            campaigns_by_key[key] = {"key": key, "label": key}

    return {"campaigns": list(campaigns_by_key.values()), "templates": templates}


def get_campaign_template(template_id):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT "TemplateId", "TemplateFile", "CampaignType", '
                '"DisplayName", "Subject", "PdfPath" '
                'FROM master."TemplateCatalog" '
                'WHERE "TemplateId" = %s AND "IsActive" = TRUE',
                (template_id,)
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "template": row[1],
        "campaign": row[2],
        "label": row[3],
        "subject": row[4] or "",
        "pdfPath": row[5] or ""
    }


def load_campaign_history(limit=20):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'SELECT "TimeStamp", "SentTo", "CampaignType", "Status", "ErrorMessage" '
                    'FROM log."EmailAuditLog" ORDER BY "TimeStamp" DESC LIMIT %s',
                    (limit,)
                )
                rows = cur.fetchall()

        history = []
        for timestamp, sent_to, campaign_type, status, error_message in rows:
            history.append({
                "timestamp": str(timestamp),
                "sent_to": sent_to,
                "campaign_type": campaign_type,
                "status": status,
                "error_message": error_message or ""
            })
        return history
    except Exception as exc:
        logger.exception("Database error while loading campaign history.")
        raise RuntimeError("Unable to load campaign history from the database.") from exc


def get_pdf_attachments(pdf_dir=None):
    if pdf_dir is None:
        pdf_dir = os.path.join(os.path.dirname(__file__), "..", "Templates", "PDF")

    if not os.path.isdir(pdf_dir):
        return []

    pdf_files = []
    for file_name in sorted(os.listdir(pdf_dir)):
        full_path = os.path.join(pdf_dir, file_name)
        if os.path.isfile(full_path) and file_name.lower().endswith(".pdf"):
            pdf_files.append(full_path)
    return pdf_files


def send_campaign_email(TEMPLATE_NAME, EMAIL_SUBJECT, CAMPAIGN_TYPE, RECIPIENTS=None, PDF_PATHS=None):
    TOTAL_SENT = 0
    TOTAL_FAILED = 0

    if RECIPIENTS is None:
        RECIPIENTS = load_receivers_from_db()

    if not RECIPIENTS:
        raise ValueError("No active recipients were found.")

    DATA_FOLDER = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "Templates"))
    HTML_PATH = os.path.realpath(os.path.join(DATA_FOLDER, TEMPLATE_NAME))
    if os.path.commonpath([DATA_FOLDER, HTML_PATH]) != DATA_FOLDER or not TEMPLATE_NAME.lower().endswith(".html"):
        raise ValueError("The selected template file is invalid.")
    if not os.path.isfile(HTML_PATH):
        raise FileNotFoundError("The selected template file was not found.")

    PDF_FILES = PDF_PATHS if PDF_PATHS is not None else get_pdf_attachments(os.path.join(DATA_FOLDER, "PDF"))
    missing_pdf_files = any(not os.path.isfile(path) for path in PDF_FILES)

    with open(HTML_PATH, "r", encoding="utf-8") as F:
        HTML_TEMPLATE = F.read()

    configuration_errors = []
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        configuration_errors.append(
            "Set SENDER_EMAIL and SENDER_PASSWORD in the portal .env, then restart the Campaign API."
        )
    if missing_pdf_files:
        configuration_errors.append(
            "A configured PDF attachment is missing. Place the PDF at its configured path or update PdfPath in the database."
        )
    if configuration_errors:
        raise CampaignConfigurationError("Campaign cannot be submitted: " + " ".join(configuration_errors))

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as SERVER:
        SERVER.starttls()
        SERVER.login(SENDER_EMAIL, SENDER_PASSWORD)

        for RECEIVER in RECIPIENTS:
            RECEIVER_EMAIL = RECEIVER["email"]
            try:
                RECEIVER_NAME = RECEIVER.get("name") or "User"
                HTML_CONTENT = HTML_TEMPLATE.replace("{{NAME}}", RECEIVER_NAME)

                MSG = MIMEMultipart("mixed")
                MSG["From"] = SENDER_EMAIL
                MSG["To"] = RECEIVER_EMAIL
                MSG["Subject"] = EMAIL_SUBJECT

                BODY_PART = MIMEText(HTML_CONTENT, "html")
                MSG.attach(BODY_PART)

                for pdf_path in PDF_FILES:
                    with open(pdf_path, "rb") as pdf_file:
                        pdf_data = pdf_file.read()

                    pdf_attachment = MIMEApplication(pdf_data, _subtype="pdf")
                    pdf_attachment.add_header(
                        "Content-Disposition",
                        "attachment",
                        filename=os.path.basename(pdf_path)
                    )
                    MSG.attach(pdf_attachment)

                refused = SERVER.send_message(MSG)
                if refused:
                    raise smtplib.SMTPRecipientsRefused(refused)
                TOTAL_SENT += 1
                log_to_db(RECEIVER_EMAIL, "ACCEPTED", CAMPAIGN_TYPE)

            except Exception:
                logger.exception("Email submission failed for recipient %s", RECEIVER_EMAIL)
                TOTAL_FAILED += 1
                log_to_db(RECEIVER_EMAIL, "FAILED", CAMPAIGN_TYPE, "Email submission failed.")

    return {"accepted": TOTAL_SENT, "failed": TOTAL_FAILED}


def main():
    while True:
        catalog = get_campaign_catalog()
        campaigns = catalog["campaigns"]
        print("\nEMAIL CAMPAIGN MENU")
        for index, campaign in enumerate(campaigns, 1):
            print(f"{index}. {campaign['label']}")
        print(f"{len(campaigns) + 1}. Exit")
        choice = input(f"Select option (1-{len(campaigns) + 1}): ").strip()

        if choice == str(len(campaigns) + 1):
            print("Exiting... Goodbye!")
            break
        if not choice.isdigit() or not 1 <= int(choice) <= len(campaigns):
            print("Invalid option. Please try again.")
            continue

        campaign = campaigns[int(choice) - 1]
        templates = [
            item for item in catalog["templates"]
            if item["campaign"] == campaign["key"]
        ]
        if not templates:
            print("No active templates are configured for this campaign.")
            continue

        for index, template in enumerate(templates, 1):
            print(f"{index}. {template['label']} — {template['subject']}")
        template_choice = input(f"Select template (1-{len(templates)}): ").strip()
        if not template_choice.isdigit() or not 1 <= int(template_choice) <= len(templates):
            print("Invalid template selection.")
            continue

        template = templates[int(template_choice) - 1]
        pdf_paths = [template["pdfPath"]] if template["pdfPath"] else []
        send_campaign_email(
            template["template"],
            template["subject"],
            template["campaign"],
            PDF_PATHS=pdf_paths
        )


if __name__ == "__main__":
    main()

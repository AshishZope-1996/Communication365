import os
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import EmailWrapper


ROOT = Path(__file__).resolve().parents[1]


class ImageSourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "img":
            self.images.append(dict(attrs))


class EmailAssetTests(unittest.TestCase):
    def test_public_https_base_rewrites_local_image_sources(self):
        html = '<img src="../assets/images/diwali-banner.jpg" alt="Diwali lights">'

        rewritten, inline_assets = EmailWrapper.prepare_email_images(
            html, "https://cdn.example.com/campaign/images/"
        )

        self.assertIn(
            'src="https://cdn.example.com/campaign/images/diwali-banner.jpg"',
            rewritten
        )
        self.assertEqual(inline_assets, {})

    def test_missing_public_base_uses_inline_cid_images(self):
        html = '<img src="../assets/images/diwali-banner.jpg" alt="Diwali lights">'

        rewritten, inline_assets = EmailWrapper.prepare_email_images(html, "")
        body = EmailWrapper._make_email_body(rewritten, inline_assets)

        self.assertIsInstance(body, EmailWrapper.MIMEMultipart)
        self.assertEqual(len(body.get_payload()), 2)
        html_part, image_part = body.get_payload()
        html = html_part.get_payload(decode=True).decode("utf-8")
        image_content_id = image_part["Content-ID"]

        self.assertEqual(body.get_param("type"), "text/html")
        self.assertEqual(
            body.get_param("start"), f"<{html_part['Content-ID'].strip('<>')}>"
        )
        self.assertEqual(image_part.get_content_type(), "image/jpeg")
        self.assertIn(
            f'src="cid:{image_content_id.strip("<>")}"',
            html
        )

    def test_non_https_public_asset_base_is_rejected(self):
        with self.assertRaises(EmailWrapper.CampaignConfigurationError):
            EmailWrapper.prepare_email_images(
                '<img src="../assets/images/diwali-banner.jpg" alt="Diwali lights">',
                "http://cdn.example.com/images"
            )

    def test_campaign_send_embeds_images_and_personalizes_html(self):
        smtp_client = Mock()
        smtp_client.send_message.return_value = {}

        with patch.object(EmailWrapper, "SENDER_EMAIL", "sender@example.com"), \
                patch.object(EmailWrapper, "SENDER_PASSWORD", "test-password"), \
                patch.object(EmailWrapper, "log_to_db"), \
                patch.object(EmailWrapper.smtplib, "SMTP") as smtp_factory, \
                patch.dict(os.environ, {"EMAIL_ASSETS_BASE_URL": ""}):
            smtp_factory.return_value.__enter__.return_value = smtp_client
            result = EmailWrapper.send_campaign_email(
                "Diwali.html",
                "Happy Diwali",
                "Festival",
                RECIPIENTS=[{"email": "recipient@example.com", "name": "Asha"}],
                PDF_PATHS=[]
            )

        message = smtp_client.send_message.call_args.args[0]
        related_body = message.get_payload()[0]
        html_part, image_part = related_body.get_payload()
        html = html_part.get_payload(decode=True).decode("utf-8")

        self.assertEqual(result, {"accepted": 1, "failed": 0})
        self.assertIn("Dear <strong style=", html)
        self.assertIn("Asha", html)
        self.assertNotIn("{{NAME}}", html)
        self.assertIn("src=\"cid:communication360-", html)
        self.assertEqual(image_part.get_content_type(), "image/jpeg")
        smtp_client.send_message.assert_called_once()

    def test_all_templates_keep_personalization_and_use_existing_local_images(self):
        templates_dir = ROOT / "Templates"
        assets_dir = ROOT / "assets" / "images"

        for template_path in templates_dir.glob("*.html"):
            with self.subTest(template=template_path.name):
                html = template_path.read_text(encoding="utf-8")
                self.assertIn("{{NAME}}", html)

                parser = ImageSourceParser()
                parser.feed(html)
                for image in parser.images:
                    self.assertTrue(image.get("alt", "").strip())
                    source = image.get("src", "")
                    self.assertTrue(
                        source.startswith("../assets/images/"),
                        f"Unexpected non-local image source in {template_path.name}: {source}"
                    )
                    self.assertTrue(
                        (assets_dir / source.rsplit("/", 1)[-1]).is_file(),
                        f"Missing template image in {template_path.name}: {source}"
                    )

    @patch.dict(os.environ, {"EMAIL_ASSETS_BASE_URL": "https://cdn.example.com/images"})
    def test_public_base_is_read_from_environment(self):
        html = '<img src="../assets/images/holi-banner.jpg" alt="Holi colors">'

        rewritten, inline_assets = EmailWrapper.prepare_email_images(html)

        self.assertIn(
            'src="https://cdn.example.com/images/holi-banner.jpg"',
            rewritten
        )
        self.assertEqual(inline_assets, {})


if __name__ == "__main__":
    unittest.main()

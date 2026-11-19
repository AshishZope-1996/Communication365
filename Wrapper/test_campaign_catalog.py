import unittest
from unittest.mock import Mock, patch

import EmailWrapper


class CampaignCatalogTests(unittest.TestCase):
    def setUp(self):
        self.connection = Mock()
        self.connection.__enter__ = Mock(return_value=self.connection)
        self.connection.__exit__ = Mock(return_value=False)
        self.cursor = Mock()
        self.cursor.__enter__ = Mock(return_value=self.cursor)
        self.cursor.__exit__ = Mock(return_value=False)
        self.connection.cursor.return_value = self.cursor

    @patch.object(EmailWrapper, "get_db_connection")
    def test_catalog_uses_active_database_rows_and_groups_campaigns(self, get_connection):
        get_connection.return_value = self.connection
        self.cursor.fetchall.return_value = [
            (5, "Instagram.html", "linkedin", "Instagram.html", "Learn Data Engineering", None),
            (8, "Holi.html", "Festival", "Festival - Holi", "Happy Holi", "C:\\Templates\\Holi.pdf"),
        ]

        catalog = EmailWrapper.get_campaign_catalog()

        self.assertEqual(
            catalog["campaigns"],
            [{"key": "linkedin", "label": "linkedin"}, {"key": "Festival", "label": "Festival"}]
        )
        self.assertEqual(catalog["templates"][0]["id"], 5)
        self.assertEqual(catalog["templates"][0]["subject"], "Learn Data Engineering")
        self.assertEqual(catalog["templates"][0]["pdfPath"], "")
        query = self.cursor.execute.call_args[0][0]
        self.assertIn('FROM master."TemplateCatalog"', query)
        self.assertIn('"IsActive" = TRUE', query)

    @patch.object(EmailWrapper, "get_db_connection")
    def test_template_lookup_returns_database_details(self, get_connection):
        get_connection.return_value = self.connection
        self.cursor.fetchone.return_value = (
            5, "Instagram.html", "linkedin", "Instagram.html", "Learn Data Engineering", None
        )

        template = EmailWrapper.get_campaign_template(5)

        self.assertEqual(template["template"], "Instagram.html")
        self.assertEqual(template["campaign"], "linkedin")
        self.assertEqual(template["subject"], "Learn Data Engineering")
        self.cursor.execute.assert_called_once()

    @patch.object(EmailWrapper.smtplib, "SMTP")
    @patch.object(EmailWrapper, "load_receivers_from_db", return_value=[{"email": "test@example.com"}])
    @patch.object(EmailWrapper.os.path, "isfile", side_effect=lambda path: path.endswith("Holi.html"))
    @patch.object(EmailWrapper, "SENDER_PASSWORD", "")
    @patch.object(EmailWrapper, "SENDER_EMAIL", "")
    def test_submission_reports_missing_sender_and_attachment_without_sending(
        self, isfile, load_receivers, smtp
    ):
        with self.assertRaises(EmailWrapper.CampaignConfigurationError) as raised:
            EmailWrapper.send_campaign_email(
                "Holi.html",
                "Happy Holi",
                "Festival",
                PDF_PATHS=[r"C:\missing\Holi.pdf"]
            )

        message = str(raised.exception)
        self.assertIn("SENDER_EMAIL and SENDER_PASSWORD", message)
        self.assertIn("configured PDF attachment is missing", message)
        smtp.assert_not_called()


if __name__ == "__main__":
    unittest.main()

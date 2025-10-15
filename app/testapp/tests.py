from django.test import Client, SimpleTestCase


class HealthCheckTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_healthz_returns_ok(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), "OK")

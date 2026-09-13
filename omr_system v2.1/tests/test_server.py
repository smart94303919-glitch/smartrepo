import unittest

import server


class ServerContractTests(unittest.TestCase):
    def test_app_exposes_api_routes(self):
        routes = {route.path for route in server.app.routes}
        self.assertIn('/api/generate-pdf', routes)
        self.assertIn('/api/grade-sheet', routes)
        self.assertIn('/health', routes)


if __name__ == '__main__':
    unittest.main()

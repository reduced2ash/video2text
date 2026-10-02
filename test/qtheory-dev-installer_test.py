import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).parents[1] / 'scripts/install-qtheory-dev-gate.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTest(unittest.TestCase):
    def test_customizations_are_unchanged_and_install_is_idempotent(self):
        original = '// existing customized imports\n          <div class="grid">\nCUSTOM APP\nexport function registerProtectedApps(app, rootDir) {\nCUSTOM ROUTES\n}'
        updated = installer.patched(original)
        self.assertEqual(updated.count('${qtheoryDevCard}'), 1)
        self.assertEqual(updated.count('registerQtheoryDevAccess(app,'), 1)
        self.assertEqual(installer.patched(updated), updated)
        reverted = updated.replace(installer.IMPORT, '').replace('\n            ${qtheoryDevCard}', '').replace('\n  registerQtheoryDevAccess(app, { isAuthorized });', '')
        self.assertEqual(reverted, original)

    def test_unrecognized_layout_is_rejected(self):
        with self.assertRaises(ValueError):
            installer.patched('unexpected source')

if __name__ == '__main__':
    unittest.main()

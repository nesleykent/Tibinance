"""Python transport for the website implementation; no filtering/OCR policy."""
import base64
import json
import mimetypes
import os
from pathlib import Path
import subprocess


class WebsitePipeline:
    def __init__(self):
        self.process = subprocess.Popen(
            [os.environ.get('TIBINANCE_NODE', 'node'), str(Path(__file__).with_name('website_ingestion.mjs'))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1)
        contract = self.call({'op': 'contract'})
        self.version = contract['version']
        self.stages = contract['stages']

    def call(self, request):
        try:
            self.process.stdin.write(json.dumps(request) + '\n')
            self.process.stdin.flush()
            response = json.loads(self.process.stdout.readline())
            if 'error' in response:
                fault = response.get('fault', 'transport_failure')
                if fault not in ('browser_crash', 'browser_closed', 'timeout', 'transport_failure'):
                    fault = 'transport_failure'
                error = RuntimeError('Local website ingestion unavailable; private diagnostics suppressed.')
                error.fault = fault
                error.phase = response.get('phase') if response.get('phase') in self.stages else None
                error.browser_event = response.get('browserEvent') if response.get('browserEvent') in ('none', 'page_crash', 'disconnected') else None
                raise error
            return response
        except RuntimeError:
            raise
        except Exception:
            raise RuntimeError('Local website ingestion unavailable; private diagnostics suppressed.') from None

    def eligible(self, files):
        # The names are transient pipe data. The JS website rule returns booleans.
        response = self.call({'op': 'eligibility', 'names': [p.name for p in files]})
        return response['eligible']

    def ingest(self, file, context=None, correction=None, reprocess=True):
        if not self.eligible([file])[0]:
            return {'status': 'excluded_automatic', 'processingVersion': self.version,
                    'stages': {'filename': False}, 'attemptedStages': ['filename'],
                    'offers': [], 'issues': [], 'itemVerification': {'status': 'unconfirmed'}}
        return self.call({'op': 'ingest', 'name': file.name,
                          'bytes': base64.b64encode(file.read_bytes()).decode('ascii'),
                          'mimeType': mimetypes.guess_type(file.name)[0] or 'application/octet-stream',
                          'context': context, 'correction': correction, 'reprocess': reprocess})['result']

    def close(self):
        try:
            if self.process.poll() is None:
                self.call({'op': 'close'})
                self.process.stdin.close()
                self.process.wait(timeout=30)
        finally:
            self.process.stdin.close()
            self.process.stdout.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

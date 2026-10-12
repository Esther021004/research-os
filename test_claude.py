import json
import subprocess
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch, Mock
import claude_backend as c
import agent_backend
import server

SCHEMA = {'type': 'object', 'properties': {'answer': {'type': 'string'}}, 'required': ['answer'], 'additionalProperties': False}
AUTH = {'loggedIn': True, 'authMethod': 'claude.ai', 'subscriptionType': 'pro'}


class ClaudeTests(unittest.TestCase):
    def test_path_configuration(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(c, 'DATA', Path(folder)):
            binary = Path(folder) / 'claude'
            binary.touch()
            binary.chmod(0o700)
            c.configure_path(str(binary))
            self.assertEqual(c.configured_path(), str(binary))
            self.assertEqual(c.executable(), str(binary))
            with self.assertRaises(ValueError): c.configure_path('relative/claude')
            with self.assertRaises(ValueError): c.configure_path('/bin/sh')
            c.configure_path('')
            self.assertEqual(c.configured_path(), '')

    def test_environment_strips_billing_and_token_overrides(self):
        with patch.dict(c.os.environ, {'ANTHROPIC_API_KEY': 'secret', 'ANTHROPIC_AUTH_TOKEN': 'secret', 'CLAUDE_CODE_USE_BEDROCK': '1', 'CLAUDE_CODE_OAUTH_TOKEN': 'secret'}):
            env = c.environment()
        self.assertFalse(any(k in env for k in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_OAUTH_TOKEN')))

    def test_missing_binary(self):
        with patch.object(c, 'executable', return_value=None):
            self.assertFalse(c.status()['ready'])

    def test_only_paid_subscription_auth(self):
        with patch.object(c, 'executable', return_value='/mock/claude'), patch.object(c, 'run') as run:
            for method in ('api_key', 'api_key_helper', 'third_party', 'oauth_token', 'none'):
                run.return_value = {**AUTH, 'authMethod': method}
                self.assertFalse(c.status()['ready'])
            run.return_value = AUTH
            self.assertTrue(c.status()['ready'])
            run.return_value = {**AUTH, 'subscriptionType': None}
            self.assertFalse(c.status()['ready'])

    def test_infer_and_no_tools(self):
        with patch.object(c, 'status', return_value={'ready': True}), patch.object(c, 'run', return_value={'subtype': 'success', 'structured_output': {'answer': '확인'}}) as run:
            self.assertEqual(c.infer('private text', SCHEMA), {'answer': '확인'})
            args = run.call_args.args[0]
            self.assertEqual(args[args.index('--tools')+1], '')
            self.assertIn('--no-session-persistence', args)
            self.assertIn('--strict-mcp-config', args)
            self.assertNotIn('private text', args)

    def test_reject_bad_output_and_limit(self):
        with patch.object(c, 'status', return_value={'ready': True}), patch.object(c, 'run') as run:
            run.return_value = {'subtype': 'success', 'structured_output': {'answer': 2}}
            with self.assertRaises(ValueError): c.infer('x', SCHEMA)
            run.return_value = {'subtype': 'error_max_turns', 'is_error': True}
            with self.assertRaises(RuntimeError): c.infer('x', SCHEMA)

    def test_block_inference_when_auth_fails(self):
        with patch.object(c, 'status', return_value={'ready': False, 'message': '로그인 필요'}), patch.object(c, 'run') as run:
            with self.assertRaises(RuntimeError): c.infer('x', SCHEMA)
            run.assert_not_called()

    def test_subprocess_redaction_and_timeout(self):
        with patch.object(c, 'executable', return_value='/mock/claude'), patch.object(c.subprocess, 'run') as run:
            run.return_value = Mock(returncode=1, stderr='SECRET', stdout='SECRET')
            with self.assertRaises(RuntimeError) as error: c.run(['auth', 'status'])
            self.assertNotIn('SECRET', str(error.exception))
            run.side_effect = subprocess.TimeoutExpired('claude', 15)
            with self.assertRaises(RuntimeError): c.run(['auth', 'status'])

    def test_paper_routes_to_claude(self):
        with patch.object(c, 'infer', return_value={'framework': []}) as infer, patch.object(server.urllib.request, 'urlopen') as api:
            self.assertEqual(server.analyze_with_openai('source', provider='claude'), {'framework': []})
            infer.assert_called_once()
            api.assert_not_called()

    def test_agent_routes_to_claude(self):
        with patch.object(c, 'infer', return_value={'answer': '확인', 'actions': [], 'references': []}), patch.object(agent_backend.urllib.request, 'urlopen') as api:
            result = agent_backend.respond({'message': '안녕', 'today': '2026-10-12'}, 'claude', Mock())
            self.assertEqual(result['answer'], '확인')
            api.assert_not_called()


if __name__ == '__main__':
    unittest.main()

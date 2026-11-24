"""Pseudo-terminal and local-only migration tests. No cloud/SQL/network calls."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import sys
import tempfile
import termios
import time
import unittest
from unittest.mock import patch

PATH=Path(__file__).with_name('sprint10_operator.py')
spec=importlib.util.spec_from_file_location('terminal_s10',PATH)
s=importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
SYNTHETIC_SECRET='synthetic.jwt.must-not-echo'


def pty_run(child,answers=()):
    pid,master=pty.fork()
    if pid==0:
        try:
            child()
            sys.stdout.flush(); sys.stderr.flush(); os._exit(0)
        except BaseException as error:
            sys.stdout.write(json.dumps(s.safe_error_record(error))+'\n')
            sys.stdout.flush(); os._exit(1)
    captured=b''; pending=list(answers); done=False; status=None
    try:
        end=time.monotonic()+8
        while time.monotonic()<end:
            if select.select([master],[],[],0.05)[0]:
                try: chunk=os.read(master,65536)
                except OSError: chunk=b''
                captured+=chunk
            while pending and pending[0][0] in captured:
                _,answer=pending.pop(0); os.write(master,answer+b'\n')
            got,raw=os.waitpid(pid,os.WNOHANG)
            if got:
                done=True; status=os.waitstatus_to_exitcode(raw)
                # Drain remaining terminal output without blocking.
                while select.select([master],[],[],0)[0]:
                    try: extra=os.read(master,65536)
                    except OSError: break
                    if not extra: break
                    captured+=extra
                break
        if not done: raise AssertionError('PTY_TIMEOUT')
        return status,captured.decode('utf8','replace')
    finally:
        os.close(master)
        if not done:
            os.kill(pid,signal.SIGKILL); os.waitpid(pid,0)


class TerminalTests(unittest.TestCase):
    def test_nonseekable_pty_ordinary_prompt_uses_separate_streams(self):
        def child():
            try:
                with open('/dev/tty','r+'):
                    pass
            except io.UnsupportedOperation:
                pass
            else: raise AssertionError('fixture_expected_nonseekable_rplus_failure')
            opened=[]; real=os.open
            def tracked(path,flags,*a,**kw):
                if path=='/dev/tty': opened.append(flags & os.O_ACCMODE)
                return real(path,flags,*a,**kw)
            with patch.object(os,'open',tracked):
                value=s.terminal_prompt('PUBLIC_APPROVAL_PROMPT> ')
            assert value=='approved-reference'
            assert opened==[os.O_RDONLY,os.O_WRONLY]
            print('ORDINARY_PASS')
        status,out=pty_run(child,[(b'PUBLIC_APPROVAL_PROMPT> ',b'approved-reference')])
        self.assertEqual(status,0,out); self.assertIn('ORDINARY_PASS',out)

    def test_hidden_input_never_echoes_and_restores_terminal(self):
        def child():
            with open('/dev/tty','r') as tty:
                old=termios.tcgetattr(tty.fileno())
                value=s.terminal_prompt('HIDDEN_JWT_PROMPT> ',hidden=True)
                assert value==SYNTHETIC_SECRET
                assert termios.tcgetattr(tty.fileno())==old
            print('HIDDEN_RESTORED_PASS')
        status,out=pty_run(child,[(b'HIDDEN_JWT_PROMPT> ',SYNTHETIC_SECRET.encode())])
        self.assertEqual(status,0,out); self.assertNotIn(SYNTHETIC_SECRET,out)
        self.assertIn('HIDDEN_RESTORED_PASS',out)

    def test_ordinary_then_hidden_prompt_on_same_nonseekable_terminal(self):
        def child():
            assert s.terminal_prompt('ORDINARY> ')=='approval'
            assert s.terminal_prompt('SECRET> ',True)==SYNTHETIC_SECRET
            print('BOTH_PASS')
        status,out=pty_run(child,[(b'ORDINARY> ',b'approval'),(b'SECRET> ',SYNTHETIC_SECRET.encode())])
        self.assertEqual(status,0,out); self.assertNotIn(SYNTHETIC_SECRET,out)
        self.assertIn('BOTH_PASS',out)

    def test_echo_suppression_failure_stops_before_prompt_or_read(self):
        def child():
            # Simulate a terminal driver which ignores the disable request.
            with patch.object(termios,'tcsetattr',lambda *a:None):
                s.terminal_prompt('MUST_NOT_PROMPT> ',hidden=True)
        status,out=pty_run(child)
        self.assertEqual(status,1)
        self.assertNotIn('MUST_NOT_PROMPT>',out)
        self.assertIn('TERMINAL_ECHO_SUPPRESSION_FAILED',out)
        self.assertNotIn(SYNTHETIC_SECRET,out)

    def test_unavailable_terminal_has_no_stdin_or_visible_fallback(self):
        with (patch.object(os,'open',side_effect=OSError('synthetic-private-connection')),
              patch.object(sys,'stdin',io.StringIO(SYNTHETIC_SECRET))):
            with self.assertRaises(OSError): s.terminal_prompt('hidden',True)
        report=s.safe_error_record(OSError('synthetic-private-connection'))
        self.assertEqual(report['stage'],'terminal.open')
        self.assertNotIn('synthetic-private-connection',json.dumps(report))
        self.assertNotIn(SYNTHETIC_SECRET,json.dumps(report))

    def test_hidden_control_failure_has_no_getpass_fallback(self):
        def child():
            with patch.object(termios,'tcgetattr',side_effect=termios.error('private-detail')):
                s.terminal_prompt('MUST_NOT_PROMPT> ',True)
        status,out=pty_run(child)
        self.assertEqual(status,1); self.assertNotIn('MUST_NOT_PROMPT>',out)
        self.assertNotIn('private-detail',out); self.assertIn('TERMINAL_CONTROL_FAILED',out)

    def test_hidden_interrupt_restores_echo_and_is_sanitised(self):
        def child():
            with open('/dev/tty','r') as tty:
                original=termios.tcgetattr(tty.fileno())
                # Do not send a real signal to the test runner; inject read interruption.
                import builtins
                real_fdopen=os.fdopen
                class Reader:
                    def __init__(self,base): self.base=base
                    def isatty(self): return self.base.isatty()
                    def fileno(self): return self.base.fileno()
                    def readline(self,n): raise KeyboardInterrupt()
                    def close(self): self.base.close()
                def fdopen(fd,mode,**kw):
                    stream=real_fdopen(fd,mode,**kw)
                    return Reader(stream) if mode=='r' else stream
                try:
                    with patch.object(os,'fdopen',fdopen): s.terminal_prompt('INTERRUPT> ',True)
                except KeyboardInterrupt:
                    assert termios.tcgetattr(tty.fileno())==original
                    print(json.dumps(s.safe_error_record(KeyboardInterrupt())))
                else: raise AssertionError('expected_interrupt')
        status,out=pty_run(child)
        self.assertEqual(status,0,out); self.assertIn('INTERRUPTED',out)
        self.assertNotIn('Traceback',out)

    def test_unknown_runtime_error_never_becomes_a_printed_private_code(self):
        report=s.safe_error_record(RuntimeError('SYNTHETIC_PRIVATE_CREDENTIAL'))
        self.assertEqual(report['code'],'OPERATOR_OPERATION_FAILED')
        self.assertNotIn('SYNTHETIC_PRIVATE_CREDENTIAL',json.dumps(report))


class MigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        repo=Path(__file__).resolve().parents[2]
        cls.previous=subprocess.check_output(['git','-C',str(repo),'show',
          '8d6a62d8ed5c0d837772076199e238ce2bc5374b:recovery/bg-founder-sprint10/sprint10_operator.py'])
        assert s.sha(cls.previous)==s.PREVIOUS_SUPPLEMENT_SHA256

    @contextlib.contextmanager
    def setup_private(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); profile=root/'profile.json'; base=root/'bg017c-s09b.py'
            previous=root/'previous.py'; candidate=root/'candidate.json'; evidence=root/'evidence.json'
            receipt=root/'receipt.json'
            for p,b in [(base,b'original-operator-unchanged'),(previous,self.previous),
                        (candidate,b'{"private":"synthetic-binding"}')]: s.write_new(p,b)
            s.write_new(evidence,s.exact_json({'inputBindingSha256':s.sha(candidate.read_bytes()),
                                             'finalActivationApprovalRef':None}))
            old=s.exact_json({'baseOperatorSha256':s.sha(base.read_bytes()),
                             'supplementSha256':s.PREVIOUS_SUPPLEMENT_SHA256})+b'\n'
            s.write_new(profile,old)
            with patch.multiple(s,ROOT=root,PROFILE=profile,BASE_OPERATOR=base,
                                CANDIDATE=candidate,EVIDENCE=evidence,MIGRATION_RECEIPT=receipt):
                yield root,profile,base,previous,candidate,evidence,receipt,old

    def test_migration_preserves_original_profile_binding_and_evidence(self):
        with self.setup_private() as (root,p,base,previous,candidate,evidence,receipt,old):
            before=[x.read_bytes() for x in (base,candidate,evidence,previous)]
            with (contextlib.redirect_stdout(io.StringIO()) as output,
                  patch.object(subprocess,'run',side_effect=AssertionError('NO_CLOUD_ALLOWED'))):
                s.migrate_profile(previous)
            self.assertEqual([x.read_bytes() for x in (base,candidate,evidence,previous)],before)
            self.assertEqual(p.with_name(p.name+'.before-sprint10b').read_bytes(),old)
            self.assertEqual(s.private(p)['supplementSha256'],s.sha(PATH.read_bytes()))
            self.assertEqual(s.private(receipt)['status'],'COMPLETE')
            self.assertNotIn('synthetic-binding',output.getvalue())
            self.assertEqual(p.stat().st_mode&0o077,0)
            self.assertEqual(receipt.stat().st_mode&0o077,0)

    def test_wrong_previous_source_hash_refuses_before_any_writes(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            previous.write_bytes(b'wrong')
            with self.assertRaisesRegex(RuntimeError,'PREVIOUS_SUPPLEMENT_HASH_MISMATCH'):
                s.migrate_profile(previous)
            self.assertEqual(p.read_bytes(),old); self.assertFalse(receipt.exists())

    def test_changed_base_operator_refuses_migration(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            base.write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError,'BASE_OPERATOR_CHANGED'):
                s.migrate_profile(previous)
            self.assertEqual(p.read_bytes(),old); self.assertFalse(receipt.exists())

    def test_changed_candidate_refuses_migration(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            c.write_bytes(b'{}')
            with self.assertRaisesRegex(RuntimeError,'PRIVATE_CANDIDATE_CHANGED'):
                s.migrate_profile(previous)
            self.assertEqual(p.read_bytes(),old)

    def test_existing_activation_state_refuses_migration(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            (root/'bg017c-s09b').mkdir()
            with self.assertRaisesRegex(RuntimeError,'ACTIVATION_STATE_EXISTS'):
                s.migrate_profile(previous)
            self.assertEqual(p.read_bytes(),old); self.assertFalse(receipt.exists())

    def test_incomplete_migration_blocks_operator_loading(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            with contextlib.redirect_stdout(io.StringIO()): s.migrate_profile(previous)
            data=s.private(receipt); data['status']='INTENT'
            receipt.write_bytes(s.exact_json(data))
            with self.assertRaisesRegex(RuntimeError,'MIGRATION_INCOMPLETE_REQUIRES_READBACK'):
                s.check_profile()

    def test_completed_migration_does_not_repeat(self):
        with self.setup_private() as (root,p,base,previous,c,e,receipt,old):
            with contextlib.redirect_stdout(io.StringIO()): s.migrate_profile(previous)
            migrated=p.read_bytes()
            with self.assertRaisesRegex(RuntimeError,'PREVIOUS_SUPPLEMENT_HASH_MISMATCH'):
                s.migrate_profile(previous)
            self.assertEqual(p.read_bytes(),migrated)


if __name__=='__main__': unittest.main()

"""Asks contracts/embargo.py itself, with no network and no GenVM: a JSON list of [name, args] on stdin,
a JSON list of answers on stdout. A stub stands in for the genlayer module, as in tests/test_pure.py, and
only the contract's pure helpers and its rules() view are called. tests/unit/oracle.mjs runs it."""

import importlib.util
import json
import pathlib
import sys
import types

stub = types.ModuleType("genlayer")


class _Any:
    def __getattr__(self, n): return _Any()
    def __call__(self, *a, **k): return _Any()
    def __getitem__(self, n): return _Any()


class _UserError(Exception):
    def __init__(self, message=""):
        super().__init__(message)
        self.message = message


class _VM:
    UserError = _UserError
    Return = object
    Result = object


class _Public:
    view = staticmethod(lambda f: f)

    class _Write:
        def __call__(self, f): return f
        payable = staticmethod(lambda f: f)
    write = _Write()


class _GL:
    vm = _VM()
    public = _Public()

    class Contract: pass

    def __getattr__(self, n): return _Any()


class _T:
    def __init__(self, *a, **k): pass
    def __class_getitem__(cls, item): return cls


stub.gl = _GL()
stub.allow_storage = lambda c: c
stub.Address = str
stub.DynArray = _T
stub.TreeMap = _T
stub.u256 = int
stub.u32 = int
stub.u64 = int
stub.i64 = int
stub.__all__ = ["gl", "allow_storage", "Address", "DynArray", "TreeMap", "u256", "u32", "u64", "i64"]
sys.modules["genlayer"] = stub

SRC = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "embargo.py"
spec = importlib.util.spec_from_file_location("embargo_contract", SRC)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)


def fingerprint(html):
    """The fingerprint every validator agrees on for a page served with exactly these bytes."""
    try:
        return cc._fingerprint(cc._page_text(cc._visible(cc._decoded(html.encode("utf-8")))))
    except _UserError:
        return ""


def answer(name, args):
    if name == "rules":
        return json.loads(cc.Embargo.rules(None))
    if name == "url_problem":
        return cc._url_problem(*args)
    if name == "prefix_problem":
        return cc._prefix_problem(*args)
    if name == "text_problem":
        return cc._text_problem(*args)
    if name == "number_arg":
        return str(cc._number_arg(*args))
    if name == "under":
        return cc._under(*args)
    if name == "fingerprint":
        return fingerprint(args[0])
    if name == "instant":
        return cc._instant_seconds(args[0])
    if name == "constants":
        return {k: (str(v) if isinstance(v, int) else v) for k, v in vars(cc).items() if k.isupper() and isinstance(v, (int, str))}
    raise SystemExit("unknown question " + name)


print(json.dumps([answer(n, a) for n, a in json.load(sys.stdin)]))

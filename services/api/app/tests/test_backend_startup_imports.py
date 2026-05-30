"""Startup import regressions."""

import builtins
import importlib
import sys


OPTIONAL_PDF_IMPORTS = (
    "app.services.parsers.docling_adapter",
    "app.services.parsers.mineru_adapter",
    "docling",
    "mineru",
    "magic_pdf",
)


def _clear_pipeline_modules() -> None:
    for name in (
        "app.services.pipeline.processor",
        "app.services.parsers.docling_adapter",
        "app.services.parsers.mineru_adapter",
        "docling",
        "mineru",
        "magic_pdf",
    ):
        sys.modules.pop(name, None)


def _guard_optional_pdf_imports(monkeypatch):
    real_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if any(name == blocked or name.startswith(f"{blocked}.") for blocked in OPTIONAL_PDF_IMPORTS):
            raise AssertionError(f"optional PDF parser imported during startup: {name}")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)


def test_pipeline_processor_import_does_not_load_optional_pdf_parsers(monkeypatch):
    _clear_pipeline_modules()
    _guard_optional_pdf_imports(monkeypatch)

    importlib.import_module("app.services.pipeline.processor")


def test_non_pdf_parser_lookup_does_not_load_optional_pdf_parsers(monkeypatch):
    _clear_pipeline_modules()
    processor = importlib.import_module("app.services.pipeline.processor")
    _guard_optional_pdf_imports(monkeypatch)

    parser = processor._get_parser("html")

    assert parser.__class__.__name__ == "HtmlParser"


def test_pypdf_priority_does_not_load_optional_pdf_parsers(monkeypatch):
    _clear_pipeline_modules()
    processor = importlib.import_module("app.services.pipeline.processor")
    monkeypatch.setattr(processor.settings, "parser_priority", "pypdf")
    _guard_optional_pdf_imports(monkeypatch)

    parser = processor._get_parser("pdf")

    assert parser.__class__.__name__ == "PdfParser"

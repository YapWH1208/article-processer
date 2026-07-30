"""MinerU adapter — high-quality PDF document parsing.

MinerU (https://github.com/opendatalab/MinerU) provides industry-leading
PDF-to-Markdown conversion with layout preservation, image/figure extraction,
table detection, and formula recognition (LaTeX).

**Package note:** MinerU 3.x+ is installed as ``mineru`` (NOT ``magic-pdf``).
The old ``magic_pdf`` package was the v0.x/v1.x predecessor and is no longer
maintained.

Installation (v3.x):
    pip install -U "mineru[all]"

This adapter detects MinerU via the ``mineru`` CLI or Python module and falls
back gracefully to pypdf if unavailable.
"""

import logging
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from types import ModuleType
from app.services.parsers.base import BaseParser, ParseResult
from app.core.config import settings

logger = logging.getLogger(__name__)

_HF_WINDOWS_PATCH_LOCK = threading.Lock()
_HF_WINDOWS_PATCH_MARKER = "_article_processor_windows_symlink_fallback"


def _is_windows_symlink_privilege_error(error: OSError) -> bool:
    """Return whether Windows denied symlink creation for lack of privilege."""
    return getattr(error, "winerror", None) == 1314


def _install_huggingface_windows_symlink_fallback(
    *,
    file_download_module: ModuleType | None = None,
    is_windows: bool | None = None,
) -> None:
    """Make Hugging Face cache downloads work without Windows symlink privilege.

    ``huggingface_hub`` normally detects unsupported symlinks and copies the
    blob instead.  MinerU can still hit WinError 1314 when a cached capability
    result says links are supported.  Mirror the hub's documented copy/move
    fallback only for that specific error, leaving unrelated download errors
    visible to the caller.
    """
    if is_windows is None:
        is_windows = os.name == "nt"
    if not is_windows:
        return

    if file_download_module is None:
        try:
            from huggingface_hub import file_download as file_download_module
        except ImportError:
            return

    with _HF_WINDOWS_PATCH_LOCK:
        if getattr(file_download_module, _HF_WINDOWS_PATCH_MARKER, False):
            return

        original_create_symlink = file_download_module._create_symlink

        def create_symlink_or_copy(src: str, dst: str, new_blob: bool = False) -> None:
            try:
                original_create_symlink(src=src, dst=dst, new_blob=new_blob)
            except OSError as error:
                if not _is_windows_symlink_privilege_error(error):
                    raise
                logger.warning(
                    "Windows denied a Hugging Face cache symlink; copying the MinerU model file instead."
                )
                try:
                    os.remove(dst)
                except OSError:
                    pass
                if new_blob:
                    shutil.move(src, dst)
                else:
                    shutil.copyfile(src, dst)

        file_download_module._create_symlink = create_symlink_or_copy
        setattr(file_download_module, _HF_WINDOWS_PATCH_MARKER, True)

# ── Detection ──────────────────────────────────────────────────────────────

def _detect_mineru_cli() -> bool:
    """Check if the ``mineru`` CLI is available on PATH."""
    return shutil.which("mineru") is not None


def _detect_mineru_module() -> bool:
    """Check if the ``mineru`` Python package is importable."""
    try:
        import mineru  # noqa: F401
        return True
    except ImportError:
        return False


def _detect_mineru_do_parse() -> bool:
    """Check if the in-process ``do_parse`` API is available."""
    try:
        from mineru.cli.common import do_parse  # noqa: F401
        return True
    except ImportError:
        return False


HAS_MINERU_CLI = _detect_mineru_cli()
HAS_MINERU_MODULE = _detect_mineru_module()
HAS_MINERU_DO_PARSE = _detect_mineru_do_parse()

# Legacy fallback — old magic_pdf package (v0.x/v1.x)
try:
    import magic_pdf.model as model_config  # noqa: F401
    model_config.__use_inside__ = True
    from magic_pdf.pipe.UNIPipe import UNIPipe  # noqa: F401
    from magic_pdf.rw.DiskReaderWriter import DiskReaderWriter  # noqa: F401
    HAS_LEGACY_MAGIC_PDF = True
except ImportError:
    HAS_LEGACY_MAGIC_PDF = False


class MinerUAdapter(BaseParser):
    """High-quality PDF parser using MinerU.

    Detection order:
    1. ``mineru`` CLI (subprocess) — most reliable, works with any v3.x install
    2. ``mineru.cli.common.do_parse`` (in-process) — faster, no subprocess overhead
    3. Legacy ``magic_pdf`` (UNIPipe) — for users still on v0.x/v1.x
    4. Fallback to pypdf parser
    """

    def __init__(self):
        self._available = HAS_MINERU_CLI or HAS_MINERU_DO_PARSE or HAS_LEGACY_MAGIC_PDF

    async def parse(self, file_path: Path) -> ParseResult:
        """Convert PDF to Markdown using MinerU with full layout preservation."""
        failures: list[str] = []

        # Prefer the in-process path on Windows, where this adapter can apply
        # the Hugging Face cache fallback before MinerU starts model downloads.
        strategies = []
        if os.name == "nt" and HAS_MINERU_DO_PARSE:
            strategies.append(("do_parse", self._parse_via_do_parse))
        if HAS_MINERU_CLI:
            strategies.append(("CLI", self._parse_via_cli))
        if HAS_MINERU_DO_PARSE and os.name != "nt":
            strategies.append(("do_parse", self._parse_via_do_parse))
        if HAS_LEGACY_MAGIC_PDF:
            strategies.append(("legacy", self._parse_via_legacy))

        for name, strategy in strategies:
            try:
                return await strategy(file_path)
            except Exception as error:
                failures.append(f"{name}: {error}")
                logger.warning("MinerU %s strategy failed; trying the next parser option: %s", name, error)

        # A model-download or optional-engine failure must not leave an
        # otherwise readable PDF stuck in the parsing state.
        from app.services.parsers.pdf import PdfParser

        fallback = await PdfParser().parse(file_path)
        fallback.metadata = fallback.metadata or {}
        fallback.metadata.setdefault("parser", "pypdf")
        fallback.metadata["mineru_fallback_reason"] = "; ".join(failures) or "MinerU is not installed"
        return fallback

    # ── CLI strategy ─────────────────────────────────────────────────────

    async def _parse_via_cli(self, file_path: Path) -> ParseResult:
        """Use ``mineru`` CLI via subprocess."""
        tmp_dir = tempfile.mkdtemp(prefix="mineru_cli_")
        try:
            cmd = [
                "mineru",
                "-p", str(file_path),
                "-o", tmp_dir,
                "-b", "pipeline",  # pipeline backend — works CPU/GPU
            ]

            logger.info(f"Running MinerU CLI: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 min timeout for large PDFs
            )

            if result.returncode != 0:
                stderr = result.stderr[:500] if result.stderr else "unknown error"
                logger.warning(f"MinerU CLI failed (rc={result.returncode}): {stderr}")
                raise RuntimeError(f"MinerU CLI failed: {stderr}")

            return self._collect_cli_output(tmp_dir, file_path)

        except subprocess.TimeoutExpired:
            logger.warning("MinerU CLI timed out after 300s — falling back")
            raise RuntimeError("MinerU CLI timed out")
        except FileNotFoundError:
            logger.warning("mineru CLI not found at runtime — falling back")
            raise RuntimeError("mineru CLI not found")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _collect_cli_output(self, output_dir: str, file_path: Path) -> ParseResult:
        """Collect MinerU CLI output: find the generated .md file(s)."""
        md_files: list[str] = []
        for root, _dirs, files in os.walk(output_dir):
            for f in files:
                if f.endswith(".md"):
                    md_files.append(os.path.join(root, f))

        if not md_files:
            raise RuntimeError("MinerU CLI produced no .md output")

        # Use the first/largest .md file
        md_path = max(md_files, key=lambda p: os.path.getsize(p))
        md_content = Path(md_path).read_text(encoding="utf-8", errors="replace")

        # Determine title
        title = file_path.stem
        for line in md_content.strip().split("\n")[:5]:
            line = line.strip()
            if line.startswith("# ") and not line.startswith("## "):
                title = line[2:].strip()
                break

        page_count = self._estimate_page_count(md_content)

        # Collect images from output dir
        image_paths: list[str] = []
        for root, _dirs, files in os.walk(output_dir):
            for f in files:
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                    image_paths.append(os.path.join(root, f))

        stored_image_dir = ""
        if image_paths:
            stored_image_dir = self._store_images(image_paths)
        if stored_image_dir:
            md_content = self._rewrite_image_paths(md_content, output_dir, stored_image_dir)

        return ParseResult(
            markdown=md_content.strip(),
            title=title,
            page_count=page_count,
            metadata={
                "parser": "mineru",
                "image_dir": stored_image_dir,
                "image_count": len(image_paths),
            },
        )

    # ── do_parse strategy ────────────────────────────────────────────────

    async def _parse_via_do_parse(self, file_path: Path) -> ParseResult:
        """Use mineru.cli.common.do_parse in-process."""
        from mineru.cli.common import do_parse

        _install_huggingface_windows_symlink_fallback()
        tmp_dir = tempfile.mkdtemp(prefix="mineru_dp_")
        try:
            pdf_bytes = file_path.read_bytes()
            do_parse(
                output_dir=tmp_dir,
                pdf_file_names=[file_path.stem],
                pdf_bytes_list=[pdf_bytes],
                p_lang_list=["en"],
                backend="pipeline",
            )
            return self._collect_cli_output(tmp_dir, file_path)
        except Exception as e:
            logger.warning(f"MinerU do_parse failed: {e}")
            raise RuntimeError(f"MinerU do_parse failed: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # ── Legacy magic_pdf strategy ────────────────────────────────────────

    async def _parse_via_legacy(self, file_path: Path) -> ParseResult:
        """Use legacy magic_pdf.UNIPipe (v0.x/v1.x compatibility)."""
        import magic_pdf.model as model_config  # noqa: F811
        model_config.__use_inside__ = True
        from magic_pdf.pipe.UNIPipe import UNIPipe  # noqa: F811
        from magic_pdf.rw.DiskReaderWriter import DiskReaderWriter  # noqa: F811

        pdf_bytes = file_path.read_bytes()
        tmp_dir = tempfile.mkdtemp(prefix="mineru_legacy_")
        image_dir = os.path.join(tmp_dir, "images")
        os.makedirs(image_dir, exist_ok=True)

        try:
            image_writer = DiskReaderWriter(image_dir)
            jso_data = {"pdf_info": {}}
            pipe = UNIPipe(pdf_bytes, jso_data, image_writer)
            pipe.pipe_classify()
            pipe.pipe_parse()
            md_content = pipe.pipe_mk_markdown(image_dir)

            title = file_path.stem
            for line in md_content.strip().split("\n")[:5]:
                line = line.strip()
                if line.startswith("# ") and not line.startswith("## "):
                    title = line[2:].strip()
                    break

            image_paths: list[str] = []
            if os.path.isdir(image_dir):
                for f in sorted(os.listdir(image_dir)):
                    img_path = os.path.join(image_dir, f)
                    if os.path.isfile(img_path):
                        image_paths.append(img_path)

            stored_image_dir = ""
            if image_paths and md_content:
                stored_image_dir = self._store_images(image_paths)
            if stored_image_dir:
                md_content = self._rewrite_image_paths(md_content, image_dir, stored_image_dir)

            return ParseResult(
                markdown=md_content.strip(),
                title=title,
                page_count=self._estimate_page_count(md_content),
                metadata={
                    "parser": "mineru",
                    "image_dir": stored_image_dir,
                    "image_count": len(image_paths),
                },
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    # ── Shared helpers ───────────────────────────────────────────────────

    def _store_images(self, image_paths: list[str]) -> str:
        """Copy extracted images to mutable storage under storage/images/<ts>/."""
        try:
            images_root = settings.images_path
            import datetime
            ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
            dest_dir = images_root / ts
            dest_dir.mkdir(parents=True, exist_ok=True)

            for img_path in image_paths:
                fname = os.path.basename(img_path)
                dest = dest_dir / fname
                if not dest.exists():
                    shutil.copy2(img_path, dest)

            return str(dest_dir.relative_to(settings.data_path))
        except Exception as e:
            logger.warning(f"Failed to store images: {e}")
            return ""

    def _rewrite_image_paths(self, markdown: str, old_dir: str, new_dir: str) -> str:
        """Rewrite image references from temp dir to persisted storage path.

        Replaces the old temp directory with the storage path, then makes all
        remaining relative image URLs absolute so they load from the API server.
        """
        import re

        api_base = getattr(settings, "api_base_url", None) or "http://localhost:8000"

        # Replace old temp dir paths with the new persisted storage path
        markdown = markdown.replace(old_dir, new_dir)
        old_basename = os.path.basename(old_dir.rstrip("/").rstrip("\\"))
        if old_basename:
            markdown = markdown.replace(f"{old_basename}/", f"{new_dir}/")

        # Make any remaining relative image URLs absolute
        def _abs_url(match: re.Match) -> str:
            alt = match.group(1) or ""
            src = match.group(2).strip()
            if src.startswith(("http://", "https://", "data:")):
                return match.group(0)
            norm = src.lstrip("/")
            return f"![{alt}]({api_base.rstrip('/')}/{norm})"

        markdown = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _abs_url, markdown)
        return markdown

    def _estimate_page_count(self, markdown: str) -> int:
        """Estimate page count from markdown."""
        import re
        pages = re.findall(r'<!--\s*page\s+(\d+)', markdown, re.IGNORECASE)
        if pages:
            return max(int(p) for p in pages)
        return max(1, len(markdown) // 3000)

    def supports(self, source_type: str) -> bool:
        return source_type == "pdf"

    @property
    def is_available(self) -> bool:
        """Check if any MinerU variant is installed and usable."""
        return self._available

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
import time
import zipfile
from pathlib import Path
from app.services.parsers.base import BaseParser, ParseResult
from app.core.config import IMAGES_URL_PREFIX, settings

logger = logging.getLogger(__name__)

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
    0. Remote API (cloud mineru.net or self-hosted ``mineru-api``) — when configured
    1. ``mineru`` CLI (subprocess) — most reliable, works with any v3.x install
    2. ``mineru.cli.common.do_parse`` (in-process) — faster, no subprocess overhead
    3. Legacy ``magic_pdf`` (UNIPipe) — for users still on v0.x/v1.x
    4. Fallback to pypdf parser
    """

    def _api_configured(self) -> bool:
        """Check settings live — the adapter instance may outlive a settings
        reload (PUT /settings), so configuration must not be snapshotted."""
        return bool(
            settings.mineru_api_enabled
            and (
                settings.mineru_api_key.strip()
                or (
                    settings.mineru_api_mode == "selfhosted"
                    and settings.mineru_api_base_url.strip()
                )
            )
        )

    async def parse(self, file_path: Path) -> ParseResult:
        """Convert PDF to Markdown using MinerU with full layout preservation."""

        # ── Strategy 0: remote API (cloud or self-hosted) ────────────────
        if self._api_configured():
            return await self._parse_via_api(file_path)

        # ── Strategy 1: mineru CLI (subprocess) ───────────────────────
        if HAS_MINERU_CLI:
            return await self._parse_via_cli(file_path)

        # ── Strategy 2: mineru.do_parse (in-process) ──────────────────
        if HAS_MINERU_DO_PARSE:
            return await self._parse_via_do_parse(file_path)

        # ── Strategy 3: legacy magic_pdf UNIPipe ──────────────────────
        if HAS_LEGACY_MAGIC_PDF:
            return await self._parse_via_legacy(file_path)

        # ── None available ────────────────────────────────────────────
        raise RuntimeError(
            "MinerU is not installed. Install with: pip install -U \"mineru[all]\"\n"
            "Or enable the remote API: MINERU_API_ENABLED=true MINERU_API_KEY=<key>\n"
            "See: https://github.com/opendatalab/MinerU"
        )

    # ── Remote API strategy ───────────────────────────────────────────────

    def _api_auth_header(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.mineru_api_key}"}

    async def _parse_via_api(self, file_path: Path) -> ParseResult:
        """Parse via remote MinerU service (cloud or self-hosted)."""
        import httpx

        mode = settings.mineru_api_mode
        if mode == "selfhosted":
            return await self._parse_via_api_selfhosted(file_path)
        return await self._parse_via_api_cloud(file_path)

    async def _parse_via_api_cloud(self, file_path: Path) -> ParseResult:
        """Use MinerU cloud Precision API (mineru.net v4)."""
        import httpx

        base = settings.mineru_api_base_url.rstrip("/")
        headers = {
            "Content-Type": "application/json",
            **self._api_auth_header(),
        }
        data_id = file_path.stem

        with httpx.Client(timeout=60) as client:
            # 1. Request a signed upload URL
            submit_resp = client.post(
                f"{base}/api/v4/file-urls/batch",
                headers=headers,
                json={
                    "files": [{"name": file_path.name, "data_id": data_id}],
                    "model_version": settings.mineru_api_model,
                    "enable_formula": settings.mineru_api_enable_formula,
                    "is_ocr": settings.mineru_api_is_ocr,
                    "language": settings.mineru_api_language,
                },
            )
            if submit_resp.status_code == 401:
                raise RuntimeError(
                    "MinerU API rejected the API key (401). Check MINERU_API_KEY."
                )
            if submit_resp.status_code != 200:
                raise RuntimeError(
                    f"MinerU API submit failed ({submit_resp.status_code}): "
                    f"{submit_resp.text[:500]}"
                )
            submit_data = submit_resp.json()
            if submit_data.get("code") != 0:
                raise RuntimeError(
                    f"MinerU API submit error: {submit_data.get('msg', submit_data)}"
                )
            batch_id = submit_data["data"]["batch_id"]
            file_urls = submit_data["data"].get("file_urls") or []
            if not file_urls:
                raise RuntimeError("MinerU API returned no upload URL")
            upload_url = file_urls[0]

            # 2. Upload the PDF to the signed URL
            pdf_bytes = file_path.read_bytes()
            upload_resp = client.put(
                upload_url,
                content=pdf_bytes,
                headers={"Content-Type": "application/pdf"},
            )
            if upload_resp.status_code != 200:
                raise RuntimeError(
                    f"MinerU API upload failed ({upload_resp.status_code}): "
                    f"{upload_resp.text[:500]}"
                )

            # 3. Poll for the extraction result
            deadline = time.monotonic() + settings.mineru_api_timeout_seconds
            full_zip_url = ""
            while time.monotonic() < deadline:
                time.sleep(settings.mineru_api_poll_interval)
                result_resp = client.get(
                    f"{base}/api/v4/extract-results/batch/{batch_id}",
                    headers=headers,
                )
                if result_resp.status_code != 200:
                    raise RuntimeError(
                        f"MinerU API result query failed ({result_resp.status_code})"
                    )
                result_data = result_resp.json()
                if result_data.get("code") != 0:
                    raise RuntimeError(
                        f"MinerU API result error: {result_data.get('msg', result_data)}"
                    )
                extract_result = result_data["data"].get("extract_result") or {}
                state = extract_result.get("state", "")
                if state == "done":
                    full_zip_url = extract_result.get("full_zip_url", "")
                    break
                if state == "failed":
                    raise RuntimeError(
                        f"MinerU API extraction failed: {extract_result.get('msg', '')}"
                    )
            else:
                raise RuntimeError(
                    f"MinerU API polling timed out after "
                    f"{settings.mineru_api_timeout_seconds}s"
                )

            if not full_zip_url:
                raise RuntimeError("MinerU API returned no result zip URL")

            # 4. Download and unpack the result archive
            zip_resp = client.get(full_zip_url)
            if zip_resp.status_code != 200:
                raise RuntimeError(
                    f"MinerU API result download failed ({zip_resp.status_code})"
                )
            tmp_dir = tempfile.mkdtemp(prefix="mineru_api_")
            try:
                zip_path = os.path.join(tmp_dir, "result.zip")
                with open(zip_path, "wb") as f:
                    f.write(zip_resp.content)
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(tmp_dir)
                return self._collect_extracted_output(tmp_dir, file_path, engine="api")
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

    async def _parse_via_api_selfhosted(self, file_path: Path) -> ParseResult:
        """Use a self-hosted ``mineru-api`` service (POST /tasks protocol)."""
        import httpx

        base = settings.mineru_api_base_url.rstrip("/")
        headers = self._api_auth_header()

        with httpx.Client(timeout=60) as client:
            # 1. Submit the file as an async task
            with open(file_path, "rb") as f:
                submit_resp = client.post(
                    f"{base}/tasks",
                    files={"files": (file_path.name, f, "application/pdf")},
                    data={"return_md": "true"},
                    headers=headers,
                )
            if submit_resp.status_code != 200:
                raise RuntimeError(
                    f"MinerU self-hosted submit failed ({submit_resp.status_code}): "
                    f"{submit_resp.text[:500]}"
                )
            task_data = submit_resp.json()
            task_id = task_data.get("task_id")
            if not task_id:
                raise RuntimeError(
                    f"MinerU self-hosted returned no task_id: {task_data}"
                )

            # 2. Poll the task until it completes
            deadline = time.monotonic() + settings.mineru_api_timeout_seconds
            while time.monotonic() < deadline:
                time.sleep(settings.mineru_api_poll_interval)
                status_resp = client.get(f"{base}/tasks/{task_id}", headers=headers)
                if status_resp.status_code != 200:
                    raise RuntimeError(
                        f"MinerU self-hosted status query failed "
                        f"({status_resp.status_code})"
                    )
                status_data = status_resp.json()
                task_state = (
                    status_data.get("task", status_data).get("state", "")
                    or status_data.get("state", "")
                )
                if task_state == "done":
                    break
                if task_state in {"failed", "error"}:
                    raise RuntimeError(
                        f"MinerU self-hosted task failed: {status_data}"
                    )
            else:
                raise RuntimeError(
                    f"MinerU self-hosted polling timed out after "
                    f"{settings.mineru_api_timeout_seconds}s"
                )

            # 3. Fetch the result archive
            result_resp = client.get(f"{base}/tasks/{task_id}/result", headers=headers)
            if result_resp.status_code != 200:
                raise RuntimeError(
                    f"MinerU self-hosted result fetch failed "
                    f"({result_resp.status_code})"
                )
            content_type = result_resp.headers.get("content-type", "")

            tmp_dir = tempfile.mkdtemp(prefix="mineru_selfhosted_")
            try:
                if "zip" in content_type or result_resp.content[:2] == b"PK":
                    zip_path = os.path.join(tmp_dir, "result.zip")
                    with open(zip_path, "wb") as f:
                        f.write(result_resp.content)
                    with zipfile.ZipFile(zip_path) as zf:
                        zf.extractall(tmp_dir)
                    return self._collect_extracted_output(
                        tmp_dir, file_path, engine="api-selfhosted"
                    )
                # Plain markdown response
                markdown = result_resp.content.decode("utf-8", errors="replace")
                return self._build_result_from_markdown(
                    markdown, file_path, engine="api-selfhosted"
                )
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

    def _collect_extracted_output(
        self, output_dir: str, file_path: Path, *, engine: str
    ) -> ParseResult:
        """Collect markdown + images from an extracted MinerU result archive."""
        md_files: list[str] = []
        for root, _dirs, files in os.walk(output_dir):
            for f in files:
                if f.lower().endswith(".md"):
                    md_files.append(os.path.join(root, f))

        if not md_files:
            raise RuntimeError("MinerU API produced no .md output")

        md_path = max(md_files, key=lambda p: os.path.getsize(p))
        md_content = Path(md_path).read_text(encoding="utf-8", errors="replace")

        image_paths: list[str] = []
        for root, _dirs, files in os.walk(output_dir):
            for f in files:
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp")):
                    image_paths.append(os.path.join(root, f))

        stored_image_dir = ""
        if image_paths:
            stored_image_dir = self._store_images(image_paths)
        if stored_image_dir:
            stored_basenames = {os.path.basename(p) for p in image_paths}
            md_content = self._rewrite_image_paths(md_content, stored_image_dir, stored_basenames)

        return self._build_result_from_markdown(
            md_content,
            file_path,
            engine=engine,
            stored_image_dir=stored_image_dir,
            image_count=len(image_paths),
        )

    def _build_result_from_markdown(
        self,
        markdown: str,
        file_path: Path,
        *,
        engine: str,
        stored_image_dir: str = "",
        image_count: int = 0,
    ) -> ParseResult:
        """Build a ParseResult from markdown + any images already in storage."""
        title = file_path.stem
        for line in markdown.strip().split("\n")[:5]:
            line = line.strip()
            if line.startswith("# ") and not line.startswith("## "):
                title = line[2:].strip()
                break

        return ParseResult(
            markdown=markdown.strip(),
            title=title,
            page_count=self._estimate_page_count(markdown),
            metadata={
                "parser": "mineru",
                "engine": engine,
                "image_dir": stored_image_dir,
                "image_count": image_count,
            },
        )

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
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp")):
                    image_paths.append(os.path.join(root, f))

        stored_image_dir = ""
        if image_paths:
            stored_image_dir = self._store_images(image_paths)
        if stored_image_dir:
            stored_basenames = {os.path.basename(p) for p in image_paths}
            md_content = self._rewrite_image_paths(md_content, stored_image_dir, stored_basenames)

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
                stored_basenames = {os.path.basename(p) for p in image_paths}
                md_content = self._rewrite_image_paths(md_content, stored_image_dir, stored_basenames)

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

            # Return the URL path of the stored dir as served by the FastAPI
            # static mount (main.py: "/" + IMAGES_URL_PREFIX). The prefix is
            # used instead of dest_dir.relative_to(data_path) because the
            # storage dir may live outside the data root (e.g. Docker's
            # absolute STORAGE_DIR=/data/storage), where relative_to would
            # raise and silently drop images.
            return f"{IMAGES_URL_PREFIX}/{ts}"
        except Exception as e:
            logger.warning(f"Failed to store images: {e}")
            return ""

    def _rewrite_image_paths(
        self,
        markdown: str,
        stored_dir: str,
        stored_basenames: set[str],
    ) -> str:
        """Rewrite image references in parsed markdown to persisted storage URLs.

        Only references whose basename matches an actually-stored image are
        rewritten - to the exact file under "storage/images/<ts>/", which the
        FastAPI static mount serves directly. This avoids both the ambiguous
        basename search of "/images/<name>" (which can return another
        article's image on name collisions) and the broken URLs the old code
        synthesized for files that were never extracted. Remote URLs
        (http/https/data:) and references to unknown files are left untouched.
        """
        import re

        api_base = settings.api_base_url or "http://localhost:8000"
        url_base = f"{api_base.rstrip('/')}/{stored_dir.strip('/')}"

        def _abs_url(match: re.Match) -> str:
            alt = match.group(1) or ""
            src = match.group(2).strip()
            title = match.group(3) or ""
            if src.startswith(("http://", "https://", "data:")):
                return match.group(0)
            basename = os.path.basename(src)
            if basename in stored_basenames:
                return f"![{alt}]({url_base}/{basename}{title})"
            return match.group(0)

        # Optional quoted title after the path is captured and preserved.
        return re.sub(
            r'!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)',
            _abs_url,
            markdown,
        )

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
        return (
            self._api_configured()
            or HAS_MINERU_CLI
            or HAS_MINERU_DO_PARSE
            or HAS_LEGACY_MAGIC_PDF
        )

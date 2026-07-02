# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


app_root = Path(SPECPATH).resolve()
api_root = app_root.parent

datas = [
    (str(api_root / "alembic.ini"), "."),
    (str(app_root / "db" / "migrations"), "app/db/migrations"),
]

hiddenimports = [
    "app.desktop_launcher",
    "app.main",
    "uvicorn.lifespan.on",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
]

a = Analysis(
    [str(app_root / "desktop_launcher.py")],
    pathex=[str(api_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "IPython",
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "jedi",
        "jupyter",
        "matplotlib",
        "notebook",
        "numpy",
        "pandas",
        "scipy",
        "sphinx",
        "tkinter",
        "zmq",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="article-processor-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="article-processor-api",
)

#!/usr/bin/env python3
"""Create a macOS .app launcher linked to this project checkout."""
import argparse
import plistlib
from pathlib import Path
import shlex
import shutil


def create_launcher(destination):
    project = Path(__file__).resolve().parent.parent
    electron_app = project / 'node_modules/electron/dist/Electron.app'
    electron = electron_app / 'Contents/MacOS/Electron'
    if not electron.is_file():
        raise SystemExit('Electron is missing. Run npm ci in the project first.')
    if destination.exists():
        raise SystemExit(f'Refusing to overwrite an existing app: {destination}')
    if not destination.parent.is_dir():
        raise SystemExit(f'Destination folder does not exist: {destination.parent}')

    contents = destination / 'Contents'
    executable = contents / 'MacOS/ProjectMinMax'
    executable.parent.mkdir(parents=True)
    resources = contents / 'Resources'
    resources.mkdir()
    shutil.copy2(electron_app / 'Contents/Resources/electron.icns', resources / 'ProjectMinMax.icns')
    executable.write_text(f'''#!/bin/zsh
set -eu
project={shlex.quote(str(project))}
mkdir -p "$HOME/Library/Logs/Project MinMax"
exec >> "$HOME/Library/Logs/Project MinMax/launcher.log" 2>&1
cd "$project"
unset ELECTRON_RUN_AS_NODE
exec "$project/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$project/app.js"
''')
    executable.chmod(0o755)
    with (contents / 'Info.plist').open('wb') as output:
        plistlib.dump({
            'CFBundleName': 'Project MinMax',
            'CFBundleDisplayName': 'Project MinMax',
            'CFBundleIdentifier': 'com.projectminmax.launcher',
            'CFBundleExecutable': 'ProjectMinMax',
            'CFBundleIconFile': 'ProjectMinMax.icns',
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': '1.0.0',
            'CFBundleVersion': '1',
            'LSUIElement': True,
            'NSHighResolutionCapable': True,
        }, output)
    print(f'Created {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path.home() / 'Desktop/Project MinMax.app')
    create_launcher(parser.parse_args().output.expanduser().resolve())

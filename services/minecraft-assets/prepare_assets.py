#!/usr/bin/env python3
"""Prepare local Minecraft Java 1.20.1 block textures without redistributing them."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

VERSION = "1.20.1"
VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "services" / "minecraft-assets" / ".cache"
OUTPUT = ROOT / "public" / "minecraft" / VERSION
USER_AGENT = "VibeCraft-Studio/0.1 (local Minecraft asset preparation)"
PROPERTY_PREFERENCES = {
    "axis": "y",
    "attachment": "floor",
    "face": "floor",
    "facing": "north",
    "half": "bottom",
    "hanging": "false",
    "hinge": "left",
    "open": "false",
    "part": "foot",
    "powered": "false",
    "shape": "straight",
    "type": "bottom",
    "waterlogged": "false",
}


def fetch_json(url: str) -> dict[str, Any]:
    result = subprocess.run(
        [
            "curl", "--fail", "--location", "--silent", "--show-error",
            "--retry", "5", "--retry-all-errors", "--user-agent", USER_AGENT, url,
        ],
        check=True,
        stdout=subprocess.PIPE,
    )
    return json.loads(result.stdout)


def download(url: str, destination: Path, expected_sha1: str | None = None) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and (not expected_sha1 or sha1(destination) == expected_sha1):
        return
    temporary = destination.with_suffix(destination.suffix + ".download")
    subprocess.run(
        [
            "curl", "--fail", "--location", "--silent", "--show-error",
            "--retry", "5", "--retry-all-errors", "--continue-at", "-",
            "--user-agent", USER_AGENT, "--output", str(temporary), url,
        ],
        check=True,
    )
    if expected_sha1 and sha1(temporary) != expected_sha1:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("Downloaded Minecraft client failed SHA-1 verification.")
    temporary.replace(destination)


def sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_variant_properties(key: str) -> dict[str, str]:
    if not key:
        return {}
    return dict(part.split("=", 1) for part in key.split(",") if "=" in part)


def property_score(properties: dict[str, str]) -> tuple[int, str]:
    score = 0
    for key, value in properties.items():
        preferred = PROPERTY_PREFERENCES.get(key)
        if preferred is not None:
            score += 0 if value == preferred else 20
        elif value == "false":
            score += 0
        elif value == "true":
            score += 5
        elif value.isdigit():
            score += min(int(value), 10)
        else:
            score += 2
    return score, ",".join(f"{key}={value}" for key, value in sorted(properties.items()))


def collect_condition_values(condition: Any, values: dict[str, set[str]]) -> None:
    if not isinstance(condition, dict):
        return
    for key, value in condition.items():
        if key in {"OR", "AND"} and isinstance(value, list):
            for child in value:
                collect_condition_values(child, values)
        elif isinstance(value, str):
            values.setdefault(key, set()).update(value.split("|"))


def default_block_properties(blockstate: dict[str, Any]) -> dict[str, str]:
    variants = blockstate.get("variants")
    if isinstance(variants, dict) and variants:
        candidates = [parse_variant_properties(key) for key in variants]
        return min(candidates, key=property_score)
    values: dict[str, set[str]] = {}
    for part in blockstate.get("multipart", []):
        if isinstance(part, dict):
            collect_condition_values(part.get("when"), values)
    defaults: dict[str, str] = {}
    for key, choices in values.items():
        preferred = PROPERTY_PREFERENCES.get(key)
        if preferred in choices:
            defaults[key] = preferred
        elif "false" in choices:
            defaults[key] = "false"
        else:
            defaults[key] = sorted(choices)[0]
    return defaults


def prepare() -> None:
    manifest = fetch_json(VERSION_MANIFEST_URL)
    version_entry = next((item for item in manifest["versions"] if item["id"] == VERSION), None)
    if not version_entry:
        raise RuntimeError(f"Minecraft {VERSION} was not found in Mojang's version manifest.")
    version = fetch_json(version_entry["url"])
    client = version["downloads"]["client"]
    client_jar = CACHE / f"client-{VERSION}.jar"
    download(client["url"], client_jar, client.get("sha1"))

    temporary_output = OUTPUT.with_name(OUTPUT.name + ".preparing")
    if temporary_output.exists():
        shutil.rmtree(temporary_output)
    texture_root = temporary_output / "assets" / "minecraft" / "textures"
    texture_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(client_jar) as archive:
        archive_names = archive.namelist()
        texture_files = [name for name in archive_names if name.startswith("assets/minecraft/textures/") and name.endswith((".png", ".png.mcmeta"))]
        for archive_name in texture_files:
            relative = Path(archive_name).relative_to("assets/minecraft/textures")
            destination = texture_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(archive_name))

        blockstates: dict[str, Any] = {}
        defaults: dict[str, dict[str, str]] = {}
        for archive_name in archive_names:
            if archive_name.startswith("assets/minecraft/blockstates/") and archive_name.endswith(".json"):
                name = Path(archive_name).stem
                state = json.loads(archive.read(archive_name))
                blockstates[f"minecraft:{name}"] = state
                defaults[f"minecraft:{name}"] = default_block_properties(state)
        models: dict[str, Any] = {}
        for archive_name in archive_names:
            if archive_name.startswith("assets/minecraft/models/block/") and archive_name.endswith(".json"):
                name = archive_name.removeprefix("assets/minecraft/models/").removesuffix(".json")
                models[f"minecraft:{name}"] = json.loads(archive.read(archive_name))

    (temporary_output / "resources.json").write_text(
        json.dumps({
            "minecraftVersion": VERSION,
            "blockstates": blockstates,
            "models": models,
            "defaultProperties": defaults,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (temporary_output / "SOURCE.txt").write_text(
        "Locally extracted from the Minecraft Java 1.20.1 client distributed by Mojang.\n"
        "These assets are not part of VibeCraft and must not be committed or redistributed.\n",
        encoding="utf-8",
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    temporary_output.replace(OUTPUT)
    print(f"Prepared {len(blockstates)} blockstates, {len(models)} block models, and {len(texture_files)} texture assets in {OUTPUT}")


if __name__ == "__main__":
    try:
        prepare()
    except Exception as error:
        print(f"Minecraft asset preparation failed: {error}", file=sys.stderr)
        raise

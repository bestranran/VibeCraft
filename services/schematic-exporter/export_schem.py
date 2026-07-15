#!/usr/bin/env python3
import json
import pathlib
import sys
import tempfile

import mcschematic


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(2)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception as error:
        fail(f"Invalid schematic adapter input: {error}")

    if payload.get("minecraftVersion", "1.20.1") != "1.20.1":
        fail("Only Minecraft Java 1.20.1 is supported.")
    blocks = payload.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        fail("The accepted structure is empty.")

    schematic = mcschematic.MCSchematic()
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            fail(f"Block {index} must be an object.")
        position = (block.get("x"), block.get("y"), block.get("z"))
        if not all(isinstance(value, int) and not isinstance(value, bool) for value in position):
            fail(f"Block {index} coordinates must be integers.")
        block_id = block.get("id")
        if not isinstance(block_id, str) or not block_id.startswith("minecraft:"):
            fail(f"Block {index} has an invalid Minecraft block ID.")
        schematic.setBlock(position, block_id)

    with tempfile.TemporaryDirectory(prefix="vibecraft-schem-") as directory:
        schematic.save(directory, "structure", mcschematic.Version.JE_1_20_1)
        output = pathlib.Path(directory, "structure.schem").read_bytes()
    sys.stdout.buffer.write(output)


if __name__ == "__main__":
    main()
